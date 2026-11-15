import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { useNavigate, useParams } from 'react-router-dom';
import { Pause, Check, X, Clock, Home as HomeIcon, WifiOff, ShieldAlert, Maximize, Lock, Coins, Volume2, VolumeX, Gift, PartyPopper, HeartHandshake, RotateCcw, Trophy, ArrowRight } from 'lucide-react';
import type { PollResult, Question, Quiz, SessionSettings, ViolationKind } from '../lib/types';
import { enterFullscreen, fullscreenSupported, isFullscreen, useAntiCheat, VIOLATION_LABELS } from '../lib/anticheat';
import { api } from '../lib/api';
import { startPolling } from '../lib/pollTimer';
import type { AnswerRecord } from '../lib/types';
import { computeBonus, computeScore, gradeRatio, type Answer } from '../lib/grading';
import { totalOf } from '../lib/report';
import { Leaderboard } from '../components/Leaderboard';
import { answerKey } from '../lib/sessionLogic';
import { hashString, shuffle } from '../lib/util';
import { onSoundChange, setSound, sfx, soundOn } from '../lib/sound';
import { PlayQuestion } from '../components/PlayQuestion';
import { Spinner, askConfirm } from '../components/ui';
import { AppFooter } from '../components/AppFooter';
import { StudentResult } from '../components/StudentResult';
import { durationOf } from '../lib/analytics';
import { cheerFor, type Cheer } from '../lib/cheer';
import '../result.css';
import { loadPlayer, playerKey, type SavedPlayer } from './Join';

type Feedback = { ratio: number; score: number; q: Question; answer: Answer; coins?: number };

// Khai báo ngoài component để không bị dựng lại mỗi nhịp đồng hồ (giữ nguyên chữ học sinh đang gõ)
const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="play-bg"><div className="play-wrap">{children}</div><AppFooter compact /></div>
);

// Ảnh đã tải trước (giữ tham chiếu để trình duyệt không bỏ giữa chừng)
const preloaded = new Map<string, HTMLImageElement>();
function preloadMedia(q: Question) {
  const urls = [q.stem.image_url, ...q.options.map((o) => o.image_url), ...[...q.stem.text.matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1])];
  for (const u of urls) {
    if (!u || preloaded.has(u) || u.startsWith('data:')) continue;
    const img = new Image();
    img.decoding = 'async';
    img.src = u;
    preloaded.set(u, img);
  }
}

const fmtDeadline = (iso: string) => new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });

export default function Play() {
  const { pin = '' } = useParams();
  const nav = useNavigate();
  const me = useMemo<SavedPlayer | null>(() => loadPlayer(pin), [pin]);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [settings, setSettings] = useState<SessionSettings | null>(null);
  const [poll, setPoll] = useState<PollResult | null>(null);
  const [err, setErr] = useState('');
  const [offline, setOffline] = useState(false);
  const [idx, setIdx] = useState(0); // câu hiện tại theo thứ tự của em
  const [answered, setAnswered] = useState<Set<number>>(new Set());
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const pollState = useRef<string>(''); // trạng thái phiên ở lượt hỏi gần nhất (quyết định nhịp hỏi)
  const advanceRef = useRef<null | (() => void)>(null); // sang câu kế tiếp (nút "Câu tiếp theo" hoặc tự chuyển)
  const advanceTimer = useRef<number>();
  const [countdown, setCountdown] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [draft, setDraft] = useState<{ i: number; a: Answer } | null>(null);
  const [attempt, setAttempt] = useState(0); // tăng để dựng lại câu hỏi khi làm lại / chọn lại đáp án
  // Kết quả từng câu của em (để biết câu nào còn sai cho lượt làm lại)
  const [ratios, setRatios] = useState<Map<number, { ratio: number; score: number; oral: boolean }>>(new Map());
  const [roundsUsed, setRoundsUsed] = useState(0); // số lượt làm lại đã dùng
  const [retry, setRetry] = useState<{ round: number; queue: number[]; pos: number } | null>(null); // đang trong một lượt làm lại
  const [retryDeclined, setRetryDeclined] = useState(false);
  const changed = useRef(new Set<number>()); // giáo viên điều khiển: các câu em đã bấm "Chọn lại đáp án"
  const revealed = useRef(-1);
  const shown = useRef({ score: 0, coins: 0 });
  const finishSent = useRef(false);
  const [myAnswers, setMyAnswers] = useState<Map<number, Answer>>(new Map()); // đáp án em đã chọn (để xem lại ở chế độ tự do chọn câu)
  const [showRank, setShowRank] = useState(false);
  const [introDone, setIntroDone] = useState(false); // bài về nhà: đã đọc hướng dẫn và bấm Bắt đầu
  const wrongStreak = useRef(0);
  const [cheer, setCheer] = useState<Cheer | null>(null);
  const cheerTimer = useRef<number>();
  const [, setNow] = useState(Date.now()); // nhịp 250 ms để vẽ lại thanh thời gian
  const qStart = useRef(Date.now());
  const pausedMs = useRef(0);
  const pauseAt = useRef<number | null>(null);
  const prevState = useRef<string>('');
  const clockOffset = useRef(0);
  const submitting = useRef(false);
  const [warning, setWarning] = useState<{ text: string; n: number } | null>(null);
  const [lockedLocal, setLockedLocal] = useState(false);
  const [fs, setFs] = useState(() => (typeof document !== 'undefined' ? isFullscreen() : false));

  useEffect(() => {
    const f = () => setFs(isFullscreen());
    document.addEventListener('fullscreenchange', f);
    return () => document.removeEventListener('fullscreenchange', f);
  }, []);

  useEffect(() => {
    if (!me) nav(`/join?pin=${pin}${location.hash.includes('s=') ? '&' + location.hash.split('?')[1] : ''}`, { replace: true });
  }, [me, nav, pin]);

  const mode = settings?.mode;
  const paced = mode === 'instructor_paced';
  const homework = mode === 'homework';
  const free = !paced && settings?.navigation === 'free'; // tự do chọn câu, có bảng số câu và nút Nộp bài
  const untimed = homework || free; // không tính giờ từng câu
  const [submitted, setSubmitted] = useState(false);
  const [submitAsk, setSubmitAsk] = useState(false);

  // Thứ tự câu hỏi riêng của từng học sinh (ổn định khi tải lại trang)
  const order = useMemo<Question[]>(() => {
    if (!quiz || !settings || !me) return [];
    return settings.shuffle_questions && settings.mode !== 'instructor_paced' ? shuffle(quiz.questions, hashString(me.player_id)) : quiz.questions;
  }, [quiz, settings, me]);

  // Tải đề + khôi phục tiến độ
  useEffect(() => {
    if (!me) return;
    (async () => {
      try {
        // Gọi đề và tiến độ CÙNG LÚC (mỗi lần gọi Apps Script mất 1–3 giây, gọi nối tiếp thì cộng dồn)
        const progP = api.getProgress(pin, me.player_id).catch(() => null);
        const r = await api.getSessionQuiz(pin);
        setQuiz(r.quiz);
        setSettings(r.settings);
        const prog = await progP;
        if (prog) {
          const done = new Set(prog.answers.map((a) => a.q_index));
          setAnswered(done);
          setScore(prog.answers.reduce((s, a) => s + a.score, 0));
          setRatios(new Map(prog.answers.map((a) => [a.q_index, { ratio: a.ratio, score: a.score, oral: !!a.pending || (a.answer as { kind?: string } | null)?.kind === 'oral' }])));
          setRoundsUsed(Math.max(0, ...prog.answers.map((a) => a.attempt ?? 0)));
          setMyAnswers(new Map(prog.answers.map((a) => [a.q_index, a.answer as Answer])));
          if (prog.answers.length) setIntroDone(true);
          const count = r.quiz.questions.length;
          let next = Math.max(prog.current_index ?? 0, done.size ? Math.max(...done) + 1 : 0);
          if (r.settings.navigation === 'free' && r.settings.mode !== 'instructor_paced') {
            // tự do chọn câu: quay lại câu đang xem, nếu đã trả lời thì tới câu đầu tiên còn trống
            const cur = Math.min(Math.max(0, prog.current_index ?? 0), count - 1);
            const firstOpen = Array.from({ length: count }, (_, i) => i).find((i) => !done.has(i));
            next = done.has(cur) && firstOpen !== undefined ? firstOpen : cur;
          }
          setIdx(next);
          const d = prog.draft as { i: number; a: Answer } | null;
          if (d && d.i === next) setDraft(d);
        }
      } catch (e) {
        setErr((e as Error).message);
      }
    })();
  }, [pin, me]);

  // Thăm dò trạng thái phiên (thay cho WebSocket: Apps Script không hỗ trợ socket)
  const doPoll = useCallback(async () => {
    if (!me) return;
    try {
      const p = await api.poll(pin, me.player_id);
      clockOffset.current = p.server_now - Date.now();
      pollState.current = p.state;
      setPoll(p);
      setOffline(false);
      return true;
    } catch {
      setOffline(true);
      return false;
    }
  }, [pin, me]);

  const modeRef = useRef<string | undefined>(undefined);
  modeRef.current = settings?.mode;
  useEffect(() => {
    // Hỏi trạng thái phòng NGAY, song song với lúc tải đề (không chờ tải đề xong mới hỏi → vào phòng nhanh hơn).
    // Nhịp hỏi theo tình huống để lớp đông không làm nghẽn máy chủ:
    // bài về nhà 20 giây; giáo viên điều khiển 2 giây (cần theo kịp giáo viên);
    // trực tiếp tự do: 2 giây khi chờ bắt đầu, 5 giây khi đang tự làm bài, 15 giây khi phiên đã kết thúc.
    return startPolling(doPoll, () => {
      const mode = modeRef.current;
      return mode === 'homework' ? 20000
        : pollState.current === 'COMPLETED' ? 15000
        : mode === 'instructor_paced' ? 2000
        : pollState.current === 'IN_PROGRESS' ? 5000 : 2000;
    });
  }, [doPoll]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // Chuyển trạng thái: phòng chờ -> bắt đầu (đếm ngược 3-2-1), tạm dừng, bị mời ra
  useEffect(() => {
    if (!poll) return;
    if (poll.kicked) {
      localStorage.removeItem(playerKey(pin));
      return;
    }
    if (prevState.current === 'LOBBY_WAITING' && poll.state === 'IN_PROGRESS') {
      setCountdown(3);
    }
    if (poll.state === 'PAUSED' && pauseAt.current === null) pauseAt.current = Date.now();
    if (poll.state !== 'PAUSED' && pauseAt.current !== null) {
      pausedMs.current += Date.now() - Math.max(pauseAt.current, qStart.current);
      pauseAt.current = null;
    }
    prevState.current = poll.state;
  }, [poll, pin]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      qStart.current = Date.now();
      pausedMs.current = 0;
      return;
    }
    sfx.tick();
    const t = setTimeout(() => setCountdown((c) => (c ?? 1) - 1), 900);
    return () => clearTimeout(t);
  }, [countdown]);

  // Nhịp độ giáo viên: câu hiện tại do giáo viên mở
  const curIndex = paced ? poll?.current_index ?? 0 : idx;
  const q = order[curIndex];

  // Tải trước ảnh của câu đang làm và 2 câu kế tiếp: sang câu mới là ảnh hiện ngay, không chờ tải từ Google Drive
  useEffect(() => {
    for (const x of order.slice(curIndex, curIndex + 3)) preloadMedia(x);
  }, [order, curIndex]);

  useEffect(() => {
    if (paced) {
      setFeedback(null);
      qStart.current = poll?.question_opened_at ? poll.question_opened_at - clockOffset.current : Date.now();
      pausedMs.current = 0;
    }
  }, [paced, curIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Làm xong lượt hiện tại (chưa tính lượt làm lại câu sai)
  const allDone = !paced && order.length > 0 && !retry && (free ? submitted : idx >= order.length);
  const wrongList = useMemo(() => [...ratios.entries()].filter(([, r]) => !r.oral && r.ratio < 1).map(([i]) => i).sort((a, b) => a - b), [ratios]);
  const roundsLeft = Math.max(0, (settings?.retry_rounds ?? 0) - roundsUsed);
  // Còn lượt và còn câu sai → hỏi em có muốn làm lại các câu sai không
  const retryOffer = allDone && roundsLeft > 0 && wrongList.length > 0 && !retryDeclined && poll?.state !== 'COMPLETED';
  const selfDone = allDone && !retryOffer;
  useEffect(() => {
    if (selfDone && me && !finishSent.current) {
      finishSent.current = true;
      api.finishPlayer(pin, me.player_id).then(doPoll).catch(() => {}); // thăm dò lại ngay để hiện thời gian làm bài
    }
  }, [selfDone, me, pin, doPoll]);

  // Chống gian lận: chỉ theo dõi khi đang làm bài
  const ac = settings?.anti_cheat;
  const examActive =
    !!ac?.enabled && !!poll && (poll.state === 'IN_PROGRESS' || poll.state === 'PAUSED') &&
    countdown === null && !allDone && !poll.kicked;
  const needFullscreen = examActive && !!ac?.require_fullscreen && fullscreenSupported() && !fs;
  const lockedNow = !!ac?.enabled && (!!poll?.locked || lockedLocal);

  // Dừng đồng hồ khi học sinh bị che đề (chưa vào lại toàn màn hình) hoặc đang bị khóa,
  // để không mất câu vì thời gian chạy ngầm. Không tính phần thời gian trước khi câu hiện tại mở.
  const holdAt = useRef<number | null>(null);
  // (khi cả lớp đang tạm dừng thì đã có pauseAt lo, tránh trừ hai lần)
  const held = (needFullscreen || lockedNow) && poll?.state !== 'PAUSED';
  useEffect(() => {
    if (held && holdAt.current === null) holdAt.current = Date.now();
    if (!held && holdAt.current !== null) {
      pausedMs.current += Date.now() - Math.max(holdAt.current, qStart.current);
      holdAt.current = null;
    }
  }, [held]);

  const elapsed = () => {
    const now = Date.now();
    const pausedNow = pauseAt.current !== null ? now - Math.max(pauseAt.current, qStart.current) : 0;
    const heldNow = holdAt.current !== null ? now - Math.max(holdAt.current, qStart.current) : 0;
    // dùng giờ thực (không dùng biến `now` vì bộ đếm hiển thị có thể bị trình duyệt làm chậm khi tab chạy nền)
    return Math.max(0, now - qStart.current - pausedMs.current - pausedNow - heldNow);
  };

  const submit = useCallback(
    async (a: Answer) => {
      if (!q || !me || submitting.current || answered.has(curIndex)) return;
      submitting.current = true;
      const timeMs = untimed ? 0 : elapsed();
      const oral = q.type === 'oral' && a.kind === 'oral';
      const ratio = gradeRatio(q, a);
      const newStreak = oral ? streak : ratio === 1 ? streak + 1 : 0;
      const pts = oral ? 0 : computeScore(q, ratio); // điểm = điểm giáo viên đặt × tỉ lệ đúng
      // điểm thưởng: trả lời nhanh + chuỗi câu đúng (lượt làm lại không có thưởng)
      const bonus = oral ? { speed: 0, streak: 0, total: 0 } : computeBonus(q, ratio, timeMs, newStreak, { timed: !untimed, streaks: !!settings?.power_ups, retry: !!retry });
      const before = ratios.get(curIndex)?.score ?? 0; // điểm của câu trả lời cũ (làm lại / chọn lại) sẽ bị thay
      if (!oral) wrongStreak.current = ratio === 1 ? 0 : wrongStreak.current + 1;
      // Giáo viên điều khiển: chưa hết giờ thì chưa cho biết đúng/sai, nên chưa khen và chưa phát âm thanh đúng/sai
      const plain = cheerFor({
        correct: ratio === 1, streak: newStreak, wrongStreak: wrongStreak.current,
        left: paced ? -1 : free ? order.length - answered.size - 1 : order.length - curIndex - 1, answered: curIndex + 1, gifts: false,
      });
      const n2 = (v: number) => v.toLocaleString('vi-VN');
      const say: Cheer | null = oral || paced ? null
        : bonus.streak ? { text: `${newStreak} câu đúng liên tiếp! Em được +${n2(bonus.total)} điểm thưởng.`, tone: 'gift', bonusCoins: 0 }
        : bonus.speed ? { text: `Trả lời nhanh và đúng! Em được +${n2(bonus.speed)} điểm thưởng.`, tone: 'gift', bonusCoins: 0 }
        : plain;
      if (say) {
        setCheer(say);
        clearTimeout(cheerTimer.current);
        cheerTimer.current = window.setTimeout(() => setCheer(null), 3200);
      }
      const coins = bonus.total;
      if (paced) sfx.pop();
      else if (!oral) ratio === 1 ? sfx.correct() : sfx.wrong();
      if (!paced && !oral && ratio === 1 && newStreak >= 3) sfx.combo(); // chuỗi đúng liên tiếp
      setFeedback({ ratio, score: pts, q, answer: a, coins });
      setAnswered((s) => new Set(s).add(curIndex));
      setScore((s) => s + pts - before);
      setRatios((m) => new Map(m).set(curIndex, { ratio, score: pts, oral }));
      setMyAnswers((m) => new Map(m).set(curIndex, a));
      setStreak(newStreak);
      setDraft(null);
      const record: AnswerRecord = {
        player_id: me.player_id, question_id: q.id, q_index: curIndex, answer: a,
        correct: !oral && ratio === 1, ratio, score: pts, coins, pending: oral || undefined, time_ms: Math.round(timeMs), at: Date.now(),
        attempt: retry?.round, change: (paced && changed.current.has(curIndex)) || undefined,
      };
      // Gửi câu trả lời; mất mạng hoặc máy chủ đang bận thì tự gửi lại ở nền (2, 4, 8, 15 giây) để không mất bài của em
      const send = async (tries: number): Promise<void> => {
        try {
          await api.submitAnswer(pin, me.player_id, record);
          if (tries) setOffline(false);
        } catch (e) {
          if (!(e as { retryable?: boolean }).retryable) return; // máy chủ từ chối (đã khóa câu, hết hạn…): gửi lại cũng vậy
          setOffline(true);
          const wait = [2000, 4000, 8000, 15000][tries];
          if (wait) window.setTimeout(() => send(tries + 1), wait);
        }
      };
      // Gửi ở nền, KHÔNG chờ máy chủ trả lời mới cho chuyển câu: đúng/sai đã chấm ngay trên máy em,
      // nên nút "Câu tiếp theo" và đồng hồ tự chuyển chạy ngay (trước đây phải chờ Apps Script 1–3 giây, lớp đông còn lâu hơn).
      void send(0);
      // Mở khóa sau khi giao diện đã cập nhật xong (tránh bấm hai lần liền vào cùng một câu)
      window.setTimeout(() => { submitting.current = false; }, 0);
      if (!paced) {
        const go = () => {
          clearTimeout(advanceTimer.current);
          if (advanceRef.current !== go) return; // đã chuyển câu rồi
          advanceRef.current = null;
          setFeedback(null);
          let next = curIndex + 1;
          if (retry) {
            // Lượt làm lại: đi tiếp câu sai kế tiếp; hết danh sách thì kết thúc lượt
            if (retry.pos + 1 < retry.queue.length) {
              next = retry.queue[retry.pos + 1];
              setRetry({ ...retry, pos: retry.pos + 1 });
            } else {
              next = free ? curIndex : order.length;
              setRoundsUsed(retry.round);
              setRetry(null);
            }
          } else if (free) {
            // tới câu chưa trả lời kế tiếp (vòng lại từ đầu); hết thì ở lại chờ em bấm Nộp bài
            const done = new Set(answered).add(curIndex);
            const open = Array.from({ length: order.length }, (_, k) => (curIndex + 1 + k) % order.length).find((i) => !done.has(i));
            next = open ?? curIndex;
          }
          setIdx(next);
          qStart.current = Date.now();
          pausedMs.current = 0;
          if (untimed) api.saveProgress(pin, me.player_id, next, null).catch(() => {});
        };
        advanceRef.current = go;
        // Tự chuyển: có lời giải thích hoặc trả lời chưa đúng thì để lâu hơn cho em kịp đọc. Tắt tự chuyển: chờ em bấm nút.
        if (settings?.auto_next !== false) advanceTimer.current = window.setTimeout(go, q.explanation || ratio < 1 ? 7000 : homework ? 2200 : 1800);
      }
    },
    [q, me, answered, curIndex, homework, free, untimed, streak, settings, pin, paced, order.length, poll?.question_locked, retry, ratios], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Hết giờ -> tự nộp "không trả lời"
  const limitMs = (q?.time_limit_seconds ?? 30) * 1000;
  const running = !!q && !untimed && poll?.state === 'IN_PROGRESS' && countdown === null && !feedback && !answered.has(curIndex) && !(paced && poll?.question_locked) && !held;
  const remain = Math.max(0, limitMs - elapsed());
  useEffect(() => {
    if (!(running && remain <= 0)) return;
    // Câu trả lời miệng: hết giờ mà em đã gõ chữ / ghi âm xong thì nộp phần đó, không coi là bỏ trống
    const d = liveDraft.current;
    const oral = q?.type === 'oral' && d?.i === curIndex && d.a.kind === 'oral' && (!!d.a.text?.trim() || !!d.a.audio_url) ? d.a : null;
    submit(oral ?? { kind: 'none' });
  }, [running, remain, submit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Giáo viên điều khiển: chỉ cho biết đúng/sai khi hết giờ hoặc giáo viên khóa câu. Trước đó em còn được chọn lại đáp án.
  const pacedReveal = paced && (!!poll?.question_locked || (answered.has(curIndex) && remain <= 0));
  const hideLive = paced && answered.has(curIndex) && !pacedReveal; // chưa hé lộ kết quả: giữ nguyên điểm đang hiển thị
  const canChange = paced && !!feedback && feedback.answer.kind !== 'none' && feedback.answer.kind !== 'oral' && !pacedReveal && remain > 0 && poll?.state === 'IN_PROGRESS';
  const changeAnswer = () => {
    sfx.pop();
    changed.current.add(curIndex);
    setAnswered((s) => {
      const n = new Set(s);
      n.delete(curIndex);
      return n;
    });
    setFeedback(null);
    setAttempt((n) => n + 1);
  };
  useEffect(() => {
    if (pacedReveal && feedback && revealed.current !== curIndex && feedback.answer.kind !== 'oral') {
      revealed.current = curIndex;
      feedback.ratio === 1 ? sfx.correct() : sfx.wrong();
    }
  }, [pacedReveal, feedback, curIndex]);
  const startRetry = () => {
    const queue = wrongList;
    setRetry({ round: roundsUsed + 1, queue, pos: 0 });
    setAnswered((s) => new Set([...s].filter((i) => !queue.includes(i))));
    setFeedback(null);
    setDraft(null);
    setAttempt((n) => n + 1);
    setIdx(queue[0]);
    qStart.current = Date.now();
    pausedMs.current = 0;
  };

  // ---- Hiệu ứng âm thanh (ngắn, nhẹ, học sinh tắt được) ----
  const secLeft = Math.ceil(remain / 1000);
  useEffect(() => {
    if (running && secLeft <= 5 && secLeft > 0) sfx.hurry(); // 5 giây cuối: tích tắc
  }, [running, secLeft]);
  const showingQuestion = !!q && poll?.state === 'IN_PROGRESS' && countdown === null;
  useEffect(() => {
    if (showingQuestion) sfx.whoosh(); // câu hỏi mới hiện ra
  }, [curIndex, showingQuestion]);
  const doneNow = selfDone || poll?.state === 'COMPLETED';
  useEffect(() => {
    if (doneNow) sfx.fanfare(); // hoàn thành bài
  }, [doneNow]);
  // Khi đang trả lời câu hỏi mà chưa ở toàn màn hình: lần chạm / bấm phím kế tiếp sẽ tự phóng to toàn màn hình
  // (trình duyệt chỉ cho phóng to ngay sau một thao tác của người dùng). iPhone không hỗ trợ nên bỏ qua.
  useEffect(() => {
    if (!showingQuestion || doneNow || fs || !fullscreenSupported()) return;
    const go = () => enterFullscreen();
    window.addEventListener('pointerdown', go, { once: true });
    window.addEventListener('keydown', go, { once: true });
    return () => {
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
    };
  }, [showingQuestion, doneNow, fs]);
  /** Bỏ lượt làm hiện tại và vào lại phòng để làm lại từ đầu (lần làm mới được ghi riêng trong báo cáo). */
  const restart = () => {
    localStorage.removeItem(playerKey(pin));
    nav(`/join?pin=${pin}&again=1${location.hash.includes('s=') ? '&' + location.hash.split('?')[1] : ''}`);
  };
  const [soundEnabled, setSoundEnabled] = useState(soundOn());
  useEffect(() => onSoundChange(setSoundEnabled), []);

  // Lưu nháp tự động (giao bài về nhà)
  const draftTimer = useRef<number>();
  // Câu trả lời miệng: gửi bản ghi âm (đã nén Opus) lên Drive của giáo viên
  const uploadAudio = async (blob: Blob) => {
    if (!me) throw new Error('Chưa vào phòng.');
    const b64 = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(',')[1] ?? '');
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
    const r = await api.uploadAnswerAudio(pin, me.player_id, curIndex, blob.type || 'audio/webm', b64);
    return r.url;
  };
  const liveDraft = useRef<{ i: number; a: Answer } | null>(null); // nháp đang có trên máy (dùng khi hết giờ)
  const onDraft = (a: Answer) => {
    liveDraft.current = { i: curIndex, a };
    if (!homework || !me) return;
    clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => api.saveProgress(pin, me.player_id, curIndex, { i: curIndex, a }).catch(() => {}), 1200);
  };

  const warnTimer = useRef<number>();
  const reportViolation = useCallback(
    (kind: ViolationKind, detail: string) => {
      if (!me) return;
      if (kind !== 'open_link') {
        sfx.warn();
        const max = ac?.max_violations ?? 0;
        setWarning((w) => {
          const n = (w?.n ?? poll?.my_violations ?? 0) + 1;
          const left = max - n;
          const tail = !max ? ` – lần ${n}` : left > 0 ? ` – nhắc nhở lần ${n}/${max}, còn ${left} lần trước khi bị khóa` : left === 0 ? ` – lần ${n}/${max}: ĐÂY LÀ LẦN NHẮC NHỞ CUỐI CÙNG` : '';
          return { n, text: VIOLATION_LABELS[kind] + tail };
        });
        clearTimeout(warnTimer.current);
        warnTimer.current = window.setTimeout(() => setWarning(null), 5000);
      }
      api
        .reportViolation(pin, me.player_id, kind, detail, curIndex)
        .then((r) => {
          if (r.locked) {
            sfx.lock();
            setLockedLocal(true);
          }
        })
        .catch(() => {});
    },
    [me, pin, curIndex, ac, poll?.my_violations],
  );
  useAntiCheat(ac, examActive, reportViolation);

  // Thông báo khi giáo viên chấm xong câu trả lời miệng
  const gradedSeen = useRef<Set<string> | null>(null);
  const [gradedMsg, setGradedMsg] = useState<{ ok: boolean; n: number } | null>(null);
  useEffect(() => {
    const g = poll?.my_graded;
    if (!g) return;
    const keys = Object.keys(g);
    if (!gradedSeen.current) {
      gradedSeen.current = new Set(keys);
      return;
    }
    for (const k of keys)
      if (!gradedSeen.current.has(k)) {
        gradedSeen.current.add(k);
        setGradedMsg({ ok: g[Number(k)], n: Number(k) + 1 });
        g[Number(k)] ? sfx.correct() : sfx.wrong();
        window.setTimeout(() => setGradedMsg(null), 4000);
      }
  }, [poll?.my_graded]);
  useEffect(() => {
    if (poll && !poll.locked) setLockedLocal(false);
  }, [poll]);
  const isLocked = lockedNow;

  // ---------------- Hiển thị ----------------
  if (!me) return null;

  if (err)
    return (
      <Shell>
        <div className="card center" style={{ color: 'var(--fg)', margin: 'auto' }}>
          <h2>Không vào được phòng</h2>
          <p>{err}</p>
          <button className="btn primary" onClick={() => nav('/')}><HomeIcon size={18} /> Về trang chủ</button>
        </div>
      </Shell>
    );
  if (!quiz || !poll || !settings) return <Shell><div style={{ margin: 'auto' }}><Spinner label="Đang kết nối phòng…" /></div></Shell>;

  if (poll.kicked)
    return (
      <Shell>
        <div className="card center" style={{ color: 'var(--fg)', margin: 'auto' }}>
          <h2>Em đã được mời ra khỏi phòng</h2>
          <p>Hãy hỏi giáo viên rồi vào lại với tên phù hợp.</p>
          <button className="btn primary" onClick={() => nav(`/join?pin=${pin}`)}>Vào lại</button>
        </div>
      </Shell>
    );

  const meRow = poll.players.find((p) => p.player_id === me.player_id);
  const ranked = [...poll.players].sort((a, b) => totalOf(b) - totalOf(a)); // xếp theo điểm + điểm thưởng
  const myRank = ranked.findIndex((p) => p.player_id === me.player_id) + 1;
  const total = order.length;
  if (!hideLive) shown.current = { score: meRow?.score ?? score, coins: meRow?.coins ?? 0 };
  const canSeeRank = settings.show_leaderboard && myRank > 0 && !hideLive;
  const top = (
    <div className="play-top">
      <span className="play-chip">
        <Avatar value={me.avatar} size={26} /> {me.name}
      </span>
      {q && !untimed && (poll.state === 'IN_PROGRESS' || poll.state === 'PAUSED') ? (
        <div className={`timer-bar ${remain < 5000 ? 'low' : ''}`} role="timer" aria-label={`Còn ${Math.ceil(remain / 1000)} giây`}>
          <i style={{ width: `${(remain / limitMs) * 100}%` }} />
        </div>
      ) : (
        <span className="grow" />
      )}
      {q && !untimed && (poll.state === 'IN_PROGRESS' || poll.state === 'PAUSED') && <span className="badge amber"><Clock size={14} /> {Math.ceil(remain / 1000)}s</span>}
      <span className="badge blue" style={{ fontSize: '1rem' }}>{shown.current.score.toLocaleString('vi-VN')} điểm</span>
      <span className="badge amber" style={{ fontSize: '1rem' }} title="Điểm thưởng: trả lời nhanh và chuỗi câu đúng"><Coins size={14} /> +{shown.current.coins.toLocaleString('vi-VN')} thưởng</span>
      {canSeeRank && (
        <button type="button" className="btn sm ghost" onClick={() => setShowRank(true)} title="Xem bảng xếp hạng">
          <Trophy size={16} /> Hạng {myRank}/{ranked.length}
        </button>
      )}
      {offline && <span className="badge red" title="Mất kết nối, đang thử lại"><WifiOff size={14} /> Mất mạng</span>}
      <button type="button" className="btn icon sm ghost"
        onClick={() => { setSound(!soundEnabled); if (!soundEnabled) sfx.pop(); }}
        aria-label={soundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'} title={soundEnabled ? 'Tắt âm thanh' : 'Bật âm thanh'}>
        {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
      </button>
    </div>
  );

  if (poll.state === 'LOBBY_WAITING')
    return (
      <Shell>
        {top}
        <div className="stack center" style={{ margin: 'auto', alignItems: 'center' }}>
          <Avatar value={me.avatar} size={128} label />
          <h1>Chào {me.name}!</h1>
          <p style={{ fontSize: '1.2rem' }}>Đã vào phòng <b>{pin}</b> – {quiz.title}. Chờ giáo viên bắt đầu nhé…</p>
          {paced && <p className="muted" style={{ margin: 0, maxWidth: 560 }}>Thầy cô mở từng câu cho cả lớp. Khi chưa hết giờ, em được chọn lại đáp án. Hết giờ mà chưa trả lời thì câu đó tính là chưa trả lời.</p>}
          {!paced && (
            <p className="muted" style={{ margin: 0, maxWidth: 560 }}>
              {free
                ? `Bài này em được tự chọn câu để làm: bấm số câu trong bảng để chuyển câu, làm xong bấm Nộp bài. ${settings.require_all ? 'Em phải trả lời hết các câu thì mới nộp được.' : 'Em nộp được cả khi chưa làm hết, câu bỏ trống không có điểm.'}`
                : 'Bài này em trả lời lần lượt từng câu: trả lời xong câu này mới sang câu tiếp theo.'}
              {(settings.retry_rounds ?? 0) > 0 && ` Làm xong, em được làm lại các câu sai tối đa ${settings.retry_rounds} lượt.`}
            </p>
          )}
          {ac?.enabled && (
            <div className="card stack" style={{ color: 'var(--fg)', textAlign: 'left', maxWidth: 560 }}>
              <b className="row" style={{ gap: 8, color: '#b91c1c' }}><ShieldAlert size={20} /> Bài này bật chế độ thi nghiêm túc</b>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {ac.detect_leave && <li>Không chuyển tab, không mở ứng dụng khác (ChatGPT, Zalo, công cụ chụp màn hình…).</li>}
                {ac.block_right_click && <li>Không bấm chuột phải, không dùng Google Lens.</li>}
                {ac.block_copy && <li>Không sao chép, dán hay chụp màn hình.</li>}
                {ac.require_fullscreen && <li>Làm bài ở chế độ toàn màn hình, không bấm Esc.</li>}
                <li>Mọi vi phạm được báo ngay cho giáo viên{ac.max_violations ? `. Em được nhắc nhở ${ac.max_violations} lần; vi phạm lần thứ ${ac.max_violations + 1} thì lượt chơi bị khóa` : ''}.</li>
              </ul>
              {ac.require_fullscreen && fullscreenSupported() && !fs && (
                <button className="btn primary" onClick={enterFullscreen}><Maximize size={18} /> Vào toàn màn hình ngay</button>
              )}
            </div>
          )}
          <div className="players" style={{ justifyContent: 'center' }}>
            {poll.players.map((p) => (
              <span key={p.player_id} className="player-chip"><span className="av"><Avatar value={p.avatar} size={34} /></span>{p.name}</span>
            ))}
          </div>
        </div>
      </Shell>
    );

  if (countdown !== null)
    return <Shell><div className="countdown" key={countdown} style={{ margin: 'auto' }} aria-live="assertive">{countdown}</div></Shell>;

  if (retryOffer) {
    const right = [...ratios.values()].filter((r) => r.ratio >= 1).length;
    return (
      <Shell>
        {top}
        <div className="card stack center" style={{ margin: 'auto', alignItems: 'center', maxWidth: 560, width: '100%', color: 'var(--fg)' }}>
          <RotateCcw size={48} color="var(--primary)" />
          <h1 style={{ margin: 0 }}>{roundsUsed ? `Xong lượt làm lại ${roundsUsed}` : 'Em đã làm xong lượt đầu'}</h1>
          <p style={{ margin: 0, fontSize: '1.15rem' }}>
            Em đúng <b>{right}/{total}</b> câu. Còn <b>{wrongList.length}</b> câu chưa đúng: <b>câu {wrongList.map((i) => i + 1).join(', ')}</b>.
          </p>
          <p className="muted" style={{ margin: 0 }}>
            Thầy cô cho em làm lại các câu sai. Em còn <b>{roundsLeft}</b> lượt làm lại (đã dùng {roundsUsed}/{settings.retry_rounds}).
          </p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn primary lg" onClick={startRetry}><RotateCcw size={20} /> Làm lại {wrongList.length} câu sai</button>
            <button className="btn ghost lg" onClick={() => setRetryDeclined(true)}>Nộp bài luôn</button>
          </div>
        </div>
      </Shell>
    );
  }

  const finishedAll = selfDone;
  if (poll.state === 'COMPLETED' || finishedAll) {
    const done = poll.state === 'COMPLETED';
    return (
      <Shell>
        {top}
        <div className="stack center" style={{ margin: 'auto', alignItems: 'center', maxWidth: 560, width: '100%' }}>
          <h1 style={{ margin: 0 }}>{done ? 'Kết thúc!' : 'Chúc mừng em đã hoàn thành!'}</h1>
          <StudentResult
            pin={pin} playerId={me.player_id} name={me.name} className={me.class_name} avatar={me.avatar}
            quizTitle={quiz.title} total={total} score={meRow?.score ?? score} coins={meRow?.coins ?? 0}
            rank={settings.show_leaderboard ? myRank : 0} players={ranked.length} final={done} pending={poll.my_pending?.length ?? 0}
            durationMs={meRow ? durationOf({ settings, started_at: poll.started_at }, meRow) : null}
          />
          {!done && !homework && <p>Chờ các bạn khác và giáo viên kết thúc phiên…</p>}
          {settings.show_leaderboard && (
            <>
              <b>{settings.leaderboard_top ? `Top ${settings.leaderboard_top} bạn dẫn đầu` : 'Bảng xếp hạng cả lớp'}</b>
              <Leaderboard rows={settings.leaderboard_top ? ranked.slice(0, settings.leaderboard_top) : ranked} meId={me.player_id} />
            </>
          )}
          {!paced && !done && (
            <button className="btn primary" onClick={async () => (await askConfirm('Làm lại bài này từ đầu? Kết quả lần này vẫn được giữ trong báo cáo của thầy cô.')) && restart()}>
              <RotateCcw size={18} /> Làm lại bài này
            </button>
          )}
          <button className="btn ghost" onClick={() => nav('/')}><HomeIcon size={18} /> Về trang chủ</button>
        </div>
      </Shell>
    );
  }

  // Bài về nhà không có phòng chờ: hiện hướng dẫn trước khi làm (cũng là thao tác để vào toàn màn hình)
  if (homework && !introDone && answered.size === 0) {
    return (
      <Shell>
        {top}
        <div className="card stack center" style={{ margin: 'auto', alignItems: 'center', maxWidth: 600, width: '100%', color: 'var(--fg)' }}>
          <Avatar value={me.avatar} size={96} />
          <h1 style={{ margin: 0 }}>{quiz.title}</h1>
          <p style={{ margin: 0 }}>Bài tập về nhà · {total} câu{settings.deadline ? ` · hạn nộp ${fmtDeadline(settings.deadline)}` : ''}</p>
          <ul style={{ margin: 0, paddingLeft: 20, textAlign: 'left' }}>
            <li>{free ? 'Em được tự chọn câu để làm: bấm số câu trong bảng để chuyển câu, làm xong bấm Nộp bài.' : 'Em trả lời lần lượt từng câu: trả lời xong câu này mới sang câu tiếp theo.'}</li>
            {free && <li>{settings.require_all ? 'Em phải trả lời hết các câu thì mới nộp được.' : 'Em nộp được cả khi chưa làm hết, câu bỏ trống không có điểm.'}</li>}
            {(settings.retry_rounds ?? 0) > 0 && <li>Làm xong, em được làm lại các câu sai tối đa {settings.retry_rounds} lượt.</li>}
            <li>Bài không tính giờ từng câu. Thời gian làm cả bài được ghi lại.</li>
            {ac?.enabled && <li>Bài này bật chế độ thi nghiêm túc: không chuyển tab, không bấm chuột phải{ac.max_violations ? `; vi phạm quá ${ac.max_violations} lần thì bài bị khóa` : ''}.</li>}
          </ul>
          <button className="btn primary lg" onClick={() => { setIntroDone(true); enterFullscreen(); qStart.current = Date.now(); }}>Bắt đầu làm bài</button>
        </div>
      </Shell>
    );
  }

  const locked = paced && (answered.has(curIndex) || poll.question_locked);
  const missing = Array.from({ length: total }, (_, i) => i).filter((i) => !answered.has(i));
  const finish = () => {
    setSubmitAsk(false);
    setSubmitted(true); // nếu còn lượt làm lại câu sai thì màn hỏi làm lại hiện ra trước khi nộp hẳn
  };
  return (
    <Shell>
      {top}
      <div className="row between small muted" style={{ fontWeight: 700 }}>
        <span>Câu {curIndex + 1}/{total}</span>
        {homework && settings.deadline && <span>Hạn nộp: {fmtDeadline(settings.deadline)}</span>}
        {retry && <span className="badge amber">Làm lại câu sai · lượt {retry.round}/{settings.retry_rounds} · câu {retry.pos + 1}/{retry.queue.length}</span>}
        {streak >= 2 && settings.power_ups && !paced && <span className="badge amber">Chuỗi đúng ×{streak}</span>}
      </div>
      {q && (
        <PlayQuestion
          key={`${curIndex}-${q.id}-${attempt}`}
          q={q}
          seed={hashString(me.player_id + q.id)}
          shuffleOptions={settings.shuffle_options}
          disabled={!!feedback || locked || (free && answered.has(curIndex)) || poll.state === 'PAUSED' || isLocked || needFullscreen}
          reveal={paced ? pacedReveal : !!feedback || (free && !retry && answered.has(curIndex))}
          chosen={feedback?.answer ?? (answered.has(curIndex) ? myAnswers.get(curIndex) ?? null : null)}
          onSubmit={submit}
          draft={draft?.i === curIndex ? draft.a : null}
          onDraft={onDraft}
          uploadAudio={uploadAudio}
        />
      )}
      {free && !retry && !feedback && answered.has(curIndex) && <div className="alert ok" role="status"><div>Em đã trả lời câu này rồi (đáp án của em và đáp án đúng đang hiện ở trên). Chọn câu khác trong bảng số câu bên dưới.</div></div>}
      {free && !retry && (
        <QuestionNav
          total={total} current={curIndex} answered={answered} busy={!!feedback}
          onGo={(i) => { sfx.pop(); setIdx(i); setDraft(null); api.saveProgress(pin, me.player_id, i, null).catch(() => {}); }}
          onSubmit={() => (answered.size >= total ? finish() : setSubmitAsk(true))}
        />
      )}
      {free && submitAsk && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setSubmitAsk(false)}>
          <div className="modal" role="alertdialog" aria-label="Nộp bài" style={{ maxWidth: 520 }}>
            <h2 style={{ marginTop: 0 }}>{settings.require_all ? 'Chưa nộp bài được' : 'Em chưa làm hết bài'}</h2>
            <p>
              Em còn <b>{missing.length}</b> câu chưa trả lời: <b>câu {missing.map((i) => i + 1).join(', ')}</b>.{' '}
              {settings.require_all ? 'Em cần trả lời hết các câu hỏi thì mới được nộp bài.' : 'Câu bỏ trống sẽ không có điểm. Em có muốn nộp bài luôn không?'}
            </p>
            <div className="qnav-grid">
              {missing.map((i) => <button key={i} className="qnav-no" onClick={() => { setSubmitAsk(false); setIdx(i); setDraft(null); }}>{i + 1}</button>)}
            </div>
            <div className="row end" style={{ marginTop: 16 }}>
              <button className="btn primary" onClick={() => { setSubmitAsk(false); setIdx(missing[0]); setDraft(null); }}>Làm tiếp câu {missing[0] + 1}</button>
              {!settings.require_all && <button className="btn ghost" onClick={finish}>Vẫn nộp bài</button>}
            </div>
          </div>
        </div>
      )}
      {retry && !feedback && (
        <div className="retry-box" role="status"><RotateCcw size={18} /> Lần trước em làm chưa đúng câu này. Hãy đọc thật kỹ rồi trả lời lại nhé!</div>
      )}
      {showRank && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setShowRank(false)}>
          <div className="modal" role="dialog" aria-label="Bảng xếp hạng" style={{ maxWidth: 560 }}>
            <div className="row between" style={{ marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}><Trophy size={22} /> Em đang đứng thứ {myRank}/{ranked.length}</h2>
              <button className="btn icon ghost" onClick={() => setShowRank(false)} aria-label="Đóng"><X size={20} /></button>
            </div>
            <p className="muted small" style={{ marginTop: 0 }}>Xếp theo tổng điểm và điểm thưởng. Thứ hạng thay đổi liên tục khi các bạn trả lời.</p>
            <Leaderboard rows={settings.leaderboard_top ? ranked.slice(0, Math.max(settings.leaderboard_top, 0)) : ranked} meId={me.player_id} />
            {settings.leaderboard_top && myRank > settings.leaderboard_top ? (
              <p className="center" style={{ margin: '10px 0 0' }}>Em chưa vào Top {settings.leaderboard_top}. Cố lên nhé!</p>
            ) : null}
          </div>
        </div>
      )}
      {cheer && (
        <div className={`cheer ${cheer.tone}`} role="status">
          {cheer.tone === 'gift' ? <Gift size={24} /> : cheer.tone === 'praise' ? <PartyPopper size={24} /> : <HeartHandshake size={24} />}
          <span>{cheer.text}</span>
        </div>
      )}
      {feedback && paced && !pacedReveal && feedback.answer.kind !== 'oral' && (
        <div className="feedback note" role="status">
          Đã ghi nhận đáp án của em
          <div className="small" style={{ fontFamily: 'var(--font-body)', marginTop: 6 }}>
            {canChange ? `Em còn ${Math.ceil(remain / 1000)} giây để chọn lại đáp án nếu muốn.` : 'Chờ hết giờ để xem kết quả…'}
          </div>
          {canChange && <button className="btn ghost" style={{ marginTop: 10 }} onClick={changeAnswer}><RotateCcw size={18} /> Chọn lại đáp án</button>}
        </div>
      )}
      {feedback && (!paced || pacedReveal || feedback.answer.kind === 'oral') && (
        <div className={`feedback ${feedback.answer.kind === 'oral' ? '' : feedback.ratio === 1 ? 'ok' : 'bad'}`} role="status">
          {feedback.answer.kind === 'oral' ? <>Đã gửi – chờ giáo viên chấm</> : feedback.ratio === 1 ? <><Check size={30} /> Chính xác! +{feedback.score.toLocaleString('vi-VN')} điểm{feedback.coins ? ` · +${feedback.coins.toLocaleString('vi-VN')} điểm thưởng` : ''}</> : feedback.ratio > 0 ? <>Đúng một phần +{feedback.score.toLocaleString('vi-VN')} điểm</> : feedback.answer.kind === 'none' ? <><Clock size={30} /> {paced ? 'Hết giờ! Em chưa trả lời câu này.' : 'Hết giờ!'}</> : <><X size={30} /> Chưa đúng</>}
          {feedback.q.explanation && <div style={{ fontFamily: 'var(--font-body)', fontSize: '1.05rem', fontWeight: 700, marginTop: 8 }}>{feedback.q.explanation}</div>}
          {paced && <div className="small" style={{ fontFamily: 'var(--font-body)', marginTop: 6 }}>Chờ giáo viên chuyển câu tiếp theo…</div>}
          {!paced && <div style={{ marginTop: 10 }}><button type="button" className="btn next-q" autoFocus onClick={() => advanceRef.current?.()}>Câu tiếp theo <ArrowRight size={18} /></button></div>}
        </div>
      )}
      {paced && poll.question_locked && !feedback && <div className="feedback">{answered.has(curIndex) ? 'Đã khóa câu hỏi – chờ giáo viên…' : 'Đã hết thời gian. Em chưa trả lời câu này.'}</div>}
      {paced && poll.question_locked && poll.question_stats && q && (
        <Stats q={q} stats={poll.question_stats} order={settings.shuffle_options && q.type !== 'true_false' ? shuffle(q.options, hashString(me.player_id + q.id)) : undefined} />
      )}
      {gradedMsg && (
        <div className="cheat-banner" role="status" style={{ background: gradedMsg.ok ? '#15803d' : '#475569', top: warning ? 96 : 12 }}>
          {gradedMsg.ok ? <Check size={24} /> : <X size={24} />}
          <div>Giáo viên đã chấm câu {gradedMsg.n} (trả lời miệng): {gradedMsg.ok ? 'ĐÚNG' : 'CHƯA ĐÚNG'}</div>
        </div>
      )}
      {warning && !isLocked && (
        <div className="cheat-banner" role="alert">
          <ShieldAlert size={24} style={{ flex: 'none' }} />
          <div>
            Cảnh báo gian lận: {warning.text}
            <div className="small" style={{ fontWeight: 600, opacity: 0.9 }}>Giáo viên đã nhận được thông báo. Hãy quay lại làm bài nghiêm túc.</div>
          </div>
        </div>
      )}
      {isLocked && (
        <div className="gate" role="alertdialog" aria-label="Bài làm bị khóa">
          <div className="box">
            <Lock size={64} color="#dc2626" />
            <h1 style={{ margin: 0 }}>Bài làm đã bị khóa</h1>
            <p style={{ margin: 0 }}>
              Em đã vi phạm quy chế thi {poll.my_violations ?? ''} lần, vượt quá số lần thầy cô cho phép.{' '}
              {paced ? 'Hãy giơ tay báo giáo viên để được mở khóa.' : 'Lượt làm này không làm tiếp được nữa. Em hãy thoát ra và vào lại để làm lại từ đầu.'}
            </p>
            {!paced && <button className="btn primary lg" onClick={restart}><RotateCcw size={20} /> Thoát và làm lại từ đầu</button>}
          </div>
        </div>
      )}
      {!isLocked && needFullscreen && (
        <div className="gate" role="alertdialog" aria-label="Yêu cầu toàn màn hình">
          <div className="box">
            <Maximize size={56} color="var(--primary)" />
            <h2 style={{ margin: 0 }}>Bài thi yêu cầu chế độ toàn màn hình</h2>
            <p style={{ margin: 0 }}>Bấm nút dưới để tiếp tục làm bài. Thoát toàn màn hình sẽ bị tính là vi phạm.</p>
            <button className="btn primary lg" onClick={enterFullscreen}><Maximize size={20} /> Vào toàn màn hình</button>
          </div>
        </div>
      )}
      {poll.state === 'PAUSED' && (
        <div className="modal-back" style={{ background: 'rgba(234,242,255,.92)' }}>
          <div className="center pause-box">
            <Pause size={72} color="var(--primary)" />
            <h1>Giáo viên đang tạm dừng</h1>
            <p>Đồng hồ đã dừng. Hãy lắng nghe thầy cô giảng giải nhé!</p>
          </div>
        </div>
      )}
    </Shell>
  );
}

/** Bảng số câu (chế độ tự do chọn câu): bấm số để chuyển câu, có nút Câu trước / Câu tiếp / Nộp bài. */
function QuestionNav({ total, current, answered, busy, onGo, onSubmit }: {
  total: number; current: number; answered: Set<number>; busy: boolean; onGo: (i: number) => void; onSubmit: () => void;
}) {
  return (
    <nav className="qnav card" aria-label="Bảng số câu">
      <div className="row between">
        <b>Bảng số câu <span className="muted" style={{ fontWeight: 500 }}>· đã trả lời {answered.size}/{total}</span></b>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm ghost" disabled={busy || current === 0} onClick={() => onGo(current - 1)}>Câu trước</button>
          <button className="btn sm ghost" disabled={busy || current >= total - 1} onClick={() => onGo(current + 1)}>Câu tiếp</button>
          <button className="btn sm success" disabled={busy} onClick={onSubmit}>Nộp bài</button>
        </div>
      </div>
      <div className="qnav-grid">
        {Array.from({ length: total }, (_, i) => (
          <button key={i} className={`qnav-no ${answered.has(i) ? 'done' : ''} ${i === current ? 'cur' : ''}`} disabled={busy} onClick={() => onGo(i)}
            aria-current={i === current ? 'true' : undefined} aria-label={`Câu ${i + 1}${answered.has(i) ? ', đã trả lời' : ', chưa trả lời'}`}>{i + 1}</button>
        ))}
      </div>
      <small className="muted">Ô xanh: đã trả lời · Ô trắng: chưa trả lời · Viền đậm: câu đang xem</small>
    </nav>
  );
}

export { Leaderboard } from '../components/Leaderboard';

/** Thống kê số học sinh chọn từng phương án (chế độ giáo viên điều khiển). */
export function Stats({ q, stats, order }: { q: Question; stats: Record<string, number>; order?: Question['options'] }) {
  if (!['single_choice', 'true_false', 'multiple_select'].includes(q.type)) return null;
  const total = Object.values(stats).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="card stack" style={{ color: 'var(--fg)' }}>
      <b>Thống kê lựa chọn</b>
      {(order ?? q.options).map((o, i) => {
        const n = Object.entries(stats).filter(([k]) => k.split('+').includes(o.option_id)).reduce((a, [, v]) => a + v, 0);
        return (
          <div key={o.option_id} className="row" style={{ flexWrap: 'nowrap' }}>
            <span className="qnum" style={{ background: `var(--opt-${i})`, color: '#fff' }}>{'ABCDEF'[i]}</span>
            <div className="progress grow" style={{ height: 18 }}><i style={{ width: `${(n / total) * 100}%`, background: o.is_correct ? 'var(--success)' : '#94a3b8' }} /></div>
            <b style={{ width: 36, textAlign: 'right' }}>{n}</b>
            {o.is_correct && <Check size={18} color="var(--success)" />}
          </div>
        );
      })}
    </div>
  );
}

export { answerKey };
