import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PaperSheetHead, type SheetInfo } from '../components/PaperSheet';
import { ROMAN, autoComment, fmtPoint, pointEach, sectionsOf, sheetNumbers } from '../lib/paperSheet';
import { Avatar } from '../components/Avatar';
import { Mascot } from '../components/Mascot';
import { MusicButton } from '../components/MusicButton';
import { useNavigate, useParams } from 'react-router-dom';
import { Pause, Check, X, Clock, Home as HomeIcon, WifiOff, ShieldAlert, Maximize, Lock, Coins, Volume2, VolumeX, Gift, PartyPopper, HeartHandshake, RotateCcw, RotateCw, Trophy, ArrowRight, ClipboardCheck, Send, ListChecks, Star } from 'lucide-react';
import type { PollResult, Question, Quiz, SessionSettings, ViolationKind } from '../lib/types';
import { enterFullscreen, fullscreenSupported, isFullscreen, reloadPage, takeReload, useAntiCheat, VIOLATION_LABELS } from '../lib/anticheat';
import { api } from '../lib/api';
import { readSnap, saveSnap, takeBoot, type SessionQuiz } from '../lib/bootCache';
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
import { LEVEL_LABEL, cheerFor, levelOf, type Cheer, type Level } from '../lib/cheer';
import '../result.css';
import { loadPlayer, playerKey, type SavedPlayer } from './Join';

/** Lời nhắn trên màn kết quả bài kiểm tra theo mức đánh giá. */
const LEVEL_CHEER: Record<Level, string> = {
  excellent: 'Xuất sắc! Em nắm bài rất chắc. Thầy cô và các bạn rất tự hào về em!',
  good: 'Rất tốt! Em đã làm bài chắc chắn, cố thêm một chút là đạt xuất sắc.',
  pass: 'Em đã hoàn thành bài. Xem lại các câu sai để lần sau làm tốt hơn nhé!',
  effort: 'Đừng nản nhé! Em ôn lại các câu sai, lần sau chắc chắn sẽ tốt hơn.',
};

type Feedback = { ratio: number; score: number; q: Question; answer: Answer; coins?: number };

// Khai báo ngoài component để không bị dựng lại mỗi nhịp đồng hồ (giữ nguyên chữ học sinh đang gõ)
const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="play-bg"><div className="play-wrap">{children}</div><AppFooter compact /></div>
);

// Ảnh đã tải trước (giữ tham chiếu để trình duyệt không bỏ giữa chừng)
const preloaded = new Map<string, HTMLImageElement>();
function preloadMedia(q: Question) {
  // chỉ để tải trước ảnh: câu hỏi thiếu dữ liệu (tệp đề nhập từ ngoài) thì bỏ qua, không làm hỏng màn làm bài
  const urls = [q?.stem?.image_url, ...(q?.options ?? []).map((o) => o?.image_url), ...[...String(q?.stem?.text ?? '').matchAll(/<img[^>]+src="([^"]+)"/g)].map((m) => m[1])];
  for (const u of urls) {
    if (!u || preloaded.has(u) || u.startsWith('data:')) continue;
    const img = new Image();
    img.decoding = 'async';
    img.src = u;
    preloaded.set(u, img);
  }
}

/** Thời gian còn lại dạng phút:giây (bài kiểm tra). */
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const fmtDeadline = (iso: string) => new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });

export default function Play() {
  const { pin = '' } = useParams();
  const nav = useNavigate();
  const me = useMemo<SavedPlayer | null>(() => loadPlayer(pin), [pin]);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [settings, setSettings] = useState<SessionSettings | null>(null);
  const [paperCode, setPaperCode] = useState(""); // bài kiểm tra nhiều đề: mã đề của em
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
  const [lockedCount, setLockedCount] = useState(0); // số lần vi phạm máy chủ báo lúc khóa bài (lần thăm dò có thể chưa kịp cập nhật)
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
  const exam = mode === 'exam'; // bài kiểm tra: không báo đúng/sai từng câu, có giờ làm cả bài, nộp một lần
  const free = !paced && settings?.navigation === 'free'; // tự do chọn câu, có bảng số câu và nút Nộp bài
  const untimed = homework || free || exam; // không tính giờ từng câu
  const [submitted, setSubmitted] = useState(false);
  // Bài kiểm tra: đã nộp (vừa bấm nộp, hoặc máy chủ ghi nhận đã nộp từ trước) thì không làm tiếp được
  const examSubmitted = exam && (submitted || !!poll?.players.find((p) => p.player_id === me?.player_id)?.finished);
  const [submitAsk, setSubmitAsk] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false); // bài kiểm tra: đang mở phần xem lại bài làm
  const [editing, setEditing] = useState<Set<number>>(new Set()); // bài kiểm tra: các câu em đang chọn lại đáp án
  const editOn = (i: number, on: boolean) => setEditing((s) => { const n = new Set(s); if (on) n.add(i); else n.delete(i); return n; });

  // Thứ tự câu hỏi riêng của từng học sinh (ổn định khi tải lại trang)
  const order = useMemo<Question[]>(() => {
    if (!quiz || !settings || !me) return [];
    return settings.shuffle_questions && settings.mode !== 'instructor_paced' ? shuffle(quiz.questions, hashString(me.player_id)) : quiz.questions;
  }, [quiz, settings, me]);

  // Tải đề + khôi phục tiến độ
  useEffect(() => {
    if (!me) return;
    const show = (r: SessionQuiz) => {
      setQuiz(r.quiz);
      setSettings(r.settings);
      setPaperCode(r.paper?.code ?? r.quiz.paper_code ?? '');
    };
    (async () => {
      try {
        // 1) Vừa vào phòng (Apps Script 1.5.8): đề + tiến độ đã đi kèm, hiện ngay, không gọi máy chủ
        const boot = takeBoot(pin, me.player_id);
        // 2) Tải lại trang: đề đã chụp sẵn trong thẻ trình duyệt hiện ngay, chỉ hỏi tiến độ
        //    (ảnh chụp đề không đổi suốt buổi; giờ thu bài mới nhất đi theo lần thăm dò) → không gọi lại getSessionQuiz,
        //    cả lớp mất mạng rồi tải lại cùng lúc cũng không dồn thêm việc cho máy chủ
        const snap = boot ? null : readSnap(pin, me.player_id);
        // Gọi đề và tiến độ CÙNG LÚC (mỗi lần gọi Apps Script mất 1–3 giây, gọi nối tiếp thì cộng dồn)
        const progP = boot?.progress ? Promise.resolve(boot.progress) : api.getProgress(pin, me.player_id).catch(() => null);
        const r: SessionQuiz = boot ?? snap ?? (await api.getSessionQuiz(pin, me.player_id));
        if (!boot && !snap) saveSnap(pin, me.player_id, r);
        show(r);
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
        // bài kiểm tra: đồng hồ tính trên máy em theo giờ thu bài, chỉ cần hỏi để biết bị khóa / thầy cô kết thúc
        // → 8 giây, bớt gần một nửa số lần gọi khi cả lớp cùng làm (máy chủ rảnh hơn để ghi đáp án)
        : pollState.current === 'IN_PROGRESS' ? (mode === 'exam' ? 8000 : 5000) : 2000;
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
    // cả bài trên một trang: tải trước ảnh của mọi câu
    for (const x of settings?.exam_layout === 'page' ? order : order.slice(curIndex, curIndex + 3)) preloadMedia(x);
  }, [order, curIndex, settings?.exam_layout]);

  useEffect(() => {
    if (paced) {
      setFeedback(null);
      qStart.current = poll?.question_opened_at ? poll.question_opened_at - clockOffset.current : Date.now();
      pausedMs.current = 0;
    }
  }, [paced, curIndex]); // eslint-disable-line react-hooks/exhaustive-deps

  // Làm xong lượt hiện tại (chưa tính lượt làm lại câu sai)
  const allDone = !paced && order.length > 0 && !retry && (exam ? examSubmitted : free ? submitted : idx >= order.length);
  // Bài kiểm tra: đồng hồ đếm ngược cả bài theo giờ thu bài của máy chủ; hết giờ thì tự nộp
  const examLeftMs = exam && poll?.deadline ? poll.deadline - (Date.now() + clockOffset.current) : null;
  const examTimeUp = examLeftMs !== null && examLeftMs <= 0 && poll?.state === 'IN_PROGRESS';
  const [timedOut, setTimedOut] = useState(false); // bài bị thu vì hết giờ (em chưa tự bấm nộp)
  const selfSubmitted = useRef(false); // em vừa tự bấm Nộp bài trên máy này
  useEffect(() => {
    if (examTimeUp && !examSubmitted) {
      setTimedOut(true);
      setSubmitted(true);
      doPoll();
    }
  }, [examTimeUp, examSubmitted, doPoll]);
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
    async (a: Answer, at?: number) => {
      const pos = at ?? curIndex; // vị trí câu đang trả lời
      const q = order[pos];
      // Bài kiểm tra: câu đã trả lời vẫn được gửi lại khi em bấm "Chọn lại đáp án" (chưa nộp bài, còn giờ)
      if (!q || !me || submitting.current || (answered.has(pos) && !(exam && editing.has(pos)))) return;
      const again = exam && answered.has(pos);
      submitting.current = true;
      const timeMs = untimed ? 0 : elapsed();
      const oral = q.type === 'oral' && a.kind === 'oral';
      const ratio = gradeRatio(q, a);
      const newStreak = oral ? streak : ratio === 1 ? streak + 1 : 0;
      const pts = oral ? 0 : computeScore(q, ratio); // điểm = điểm giáo viên đặt × tỉ lệ đúng
      // điểm thưởng: trả lời nhanh + chuỗi câu đúng (lượt làm lại không có thưởng)
      const bonus = oral ? { speed: 0, streak: 0, total: 0 } : computeBonus(q, ratio, timeMs, newStreak, { timed: !untimed, streaks: !!settings?.power_ups, retry: !!retry });
      const before = ratios.get(pos)?.score ?? 0; // điểm của câu trả lời cũ (làm lại / chọn lại) sẽ bị thay
      if (!oral) wrongStreak.current = ratio === 1 ? 0 : wrongStreak.current + 1;
      // Giáo viên điều khiển: chưa hết giờ thì chưa cho biết đúng/sai, nên chưa khen và chưa phát âm thanh đúng/sai
      const plain = cheerFor({
        correct: ratio === 1, streak: newStreak, wrongStreak: wrongStreak.current,
        left: paced ? -1 : free ? order.length - answered.size - 1 : order.length - pos - 1, answered: pos + 1, gifts: false,
      });
      const n2 = (v: number) => v.toLocaleString('vi-VN');
      const say: Cheer | null = oral || paced || exam ? null
        : bonus.streak ? { text: `${newStreak} câu đúng liên tiếp! Em được +${n2(bonus.total)} điểm thưởng.`, tone: 'gift', bonusCoins: 0 }
        : bonus.speed ? { text: `Trả lời nhanh và đúng! Em được +${n2(bonus.speed)} điểm thưởng.`, tone: 'gift', bonusCoins: 0 }
        : plain;
      if (say) {
        setCheer(say);
        clearTimeout(cheerTimer.current);
        cheerTimer.current = window.setTimeout(() => setCheer(null), 3200);
      }
      const coins = bonus.total;
      if (exam) sfx.saved(); // bài kiểm tra: chuông "đã ghi nhận", không cho biết đúng/sai
      else if (paced) sfx.pop(); // giáo viên điều khiển: đúng/sai phát khi hết giờ
      else if (!oral) ratio === 1 ? sfx.correct() : sfx.wrong();
      if (!paced && !exam && !oral && ratio === 1 && newStreak >= 3) sfx.combo(); // chuỗi đúng liên tiếp
      if (!exam) setFeedback({ ratio, score: pts, q, answer: a, coins });
      setAnswered((s) => new Set(s).add(pos));
      setScore((s) => s + pts - before);
      setRatios((m) => new Map(m).set(pos, { ratio, score: pts, oral }));
      setMyAnswers((m) => new Map(m).set(pos, a));
      if (exam) editOn(pos, false);
      setStreak(newStreak);
      setDraft(null);
      const record: AnswerRecord = {
        player_id: me.player_id, question_id: q.id, q_index: pos, answer: a,
        correct: !oral && ratio === 1, ratio, score: pts, coins, pending: oral || undefined, time_ms: Math.round(timeMs), at: Date.now(),
        attempt: retry?.round, change: (paced && changed.current.has(pos)) || again || undefined,
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
      if (exam && settings?.exam_layout) {
        // Bài kiểm tra (từ 1.5.5): không hiện kết quả, ở lại câu vừa làm; em tự bấm "Câu tiếp theo" hoặc chọn số câu.
        // Cả bài trên một trang: không có chuyển câu.
      } else if (exam) {
        // Bài kiểm tra tạo trước 1.5.5: sang ngay câu kế tiếp (tự do chọn câu: tới câu chưa làm kế tiếp)
        let next = pos + 1;
        if (free) {
          const done = new Set(answered).add(pos);
          const open = Array.from({ length: order.length }, (_, k) => (pos + 1 + k) % order.length).find((i) => !done.has(i));
          next = open ?? pos;
        }
        setIdx(next);
        api.saveProgress(pin, me.player_id, Math.min(next, order.length), null).catch(() => {});
      } else if (!paced) {
        const go = () => {
          clearTimeout(advanceTimer.current);
          if (advanceRef.current !== go) return; // đã chuyển câu rồi
          advanceRef.current = null;
          setFeedback(null);
          let next = pos + 1;
          if (retry) {
            // Lượt làm lại: đi tiếp câu sai kế tiếp; hết danh sách thì kết thúc lượt
            if (retry.pos + 1 < retry.queue.length) {
              next = retry.queue[retry.pos + 1];
              setRetry({ ...retry, pos: retry.pos + 1 });
            } else {
              next = free ? pos : order.length;
              setRoundsUsed(retry.round);
              setRetry(null);
            }
          } else if (free) {
            // tới câu chưa trả lời kế tiếp (vòng lại từ đầu); hết thì ở lại chờ em bấm Nộp bài
            const done = new Set(answered).add(pos);
            const open = Array.from({ length: order.length }, (_, k) => (pos + 1 + k) % order.length).find((i) => !done.has(i));
            next = open ?? pos;
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
    [q, order, me, answered, curIndex, homework, exam, free, untimed, streak, settings, pin, paced, order.length, poll?.question_locked, retry, ratios, editing], // eslint-disable-line react-hooks/exhaustive-deps
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
  const uploadAudio = async (blob: Blob, at: number = curIndex) => {
    if (!me) throw new Error('Chưa vào phòng.');
    const b64 = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(',')[1] ?? '');
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
    const r = await api.uploadAnswerAudio(pin, me.player_id, at, blob.type || 'audio/webm', b64);
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
            setLockedCount(r.violations);
          }
        })
        .catch(() => {});
    },
    [me, pin, curIndex, ac, poll?.my_violations],
  );
  useAntiCheat(ac, examActive, reportViolation);

  // Em vừa tải lại trang (F5 / nút Tải lại) trong giờ làm bài: báo một dòng cho giáo viên xem, KHÔNG tính vi phạm
  useEffect(() => {
    if (!examActive || !me) return;
    const r = takeReload(location.hash.split('?')[0]);
    if (!r) return;
    api.reportViolation(pin, me.player_id, 'reload', `Tải lại trang (${r.how}), vắng ${r.away} giây — không tính vi phạm`, curIndex).catch(() => {});
  }, [examActive]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Chỉ mở khóa khi kết quả thăm dò MỚI hơn lúc khóa (đã thấy đủ số lần vi phạm) mà vẫn không khóa,
    // tức thầy cô đã mở khóa. Lần thăm dò gửi đi trước lúc khóa, về muộn, không được mở khóa nhầm.
    if (poll && !poll.locked && (poll.my_violations ?? 0) >= lockedCount) setLockedLocal(false);
  }, [poll, lockedCount]);
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
      {exam && examLeftMs !== null && (poll.state === 'IN_PROGRESS' || poll.state === 'PAUSED') && !examSubmitted && (
        <span className={`badge ${examLeftMs < 60000 ? 'red' : 'amber'}`} style={{ fontSize: '1.05rem' }} role="timer" aria-label="Thời gian làm bài còn lại"><Clock size={16} /> Còn {clock(examLeftMs)}</span>
      )}
      {exam && <span className="badge blue" style={{ fontSize: "1rem" }}><ClipboardCheck size={14} /> {paperCode ? `Mã đề ${paperCode}` : "Bài kiểm tra"}</span>}
      {exam && !examSubmitted && (
        // Mạng chập chờn, câu hỏi/hình không hiện: tải lại trang (như phím F5), không tính vi phạm, bài đã làm vẫn giữ nguyên
        <button type="button" className="btn ghost sm" onClick={reloadPage} title="Câu hỏi hoặc hình không hiện? Bấm để tải lại trang (như phím F5). Không tính vi phạm, bài đã làm vẫn giữ nguyên.">
          <RotateCw size={16} /> Tải lại
        </button>
      )}
      {!exam && <span className="badge blue" style={{ fontSize: '1rem' }}>{shown.current.score.toLocaleString('vi-VN')} điểm</span>}
      {!exam && <span className="badge amber" style={{ fontSize: '1rem' }} title="Điểm thưởng: trả lời nhanh và chuỗi câu đúng"><Coins size={14} /> +{shown.current.coins.toLocaleString('vi-VN')} thưởng</span>}
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
      {/* Nhạc nền vui nhộn: trò chơi theo ô "Nhạc nền" của phòng; bài kiểm tra mặc định có nhạc (bật từ màn nhập mã),
          em bấm nút này để tắt / bật; nộp bài xong thì dừng */}
      <MusicButton scope="student" defaultOn initial={exam || settings.music ? undefined : false} paused={doneNow || (exam && examSubmitted) || isLocked} label={false} className="btn icon sm ghost" />

    </div>
  );

  if (poll.state === 'LOBBY_WAITING')
    return (
      <Shell>
        {top}
        <div className="stack center" style={{ margin: 'auto', alignItems: 'center' }}>
          {exam ? (
            <Avatar value={me.avatar} size={128} label />
          ) : (
            // Phòng chờ trò chơi: nhân vật của em đứng cạnh Bé Chớp đang vẫy tay
            <div className="lobby-duo">
              <span className="av-sticker"><Avatar value={me.avatar} size={120} label /></span>
              <Mascot pose="wave" size={132} />
            </div>
          )}
          <h1>Chào {me.name}!</h1>
          <p style={{ fontSize: '1.2rem' }}>Đã vào phòng <b>{pin}</b> – {quiz.title}. Chờ giáo viên bắt đầu nhé…</p>
          {exam && (
            <div className="card stack" style={{ color: 'var(--fg)', textAlign: 'left', maxWidth: 560 }}>
              <b className="row" style={{ gap: 8 }}><ClipboardCheck size={20} color="var(--primary)" /> Đây là bài kiểm tra</b>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>Bài có <b>{total}</b> câu, làm trong <b>{settings.exam_minutes ?? 45} phút</b>. Đồng hồ chạy khi thầy cô bấm Bắt đầu; hết giờ bài tự được thu.</li>
                <li>Trong lúc làm, phần mềm <b>không báo đúng hay sai</b>. Chưa bấm <b>Nộp bài kiểm tra</b> thì em vẫn được bấm <b>Chọn lại đáp án</b> ở câu đã làm, như khoanh lại trên đề giấy.</li>
                {settings.exam_layout === 'page' && <li>Cả bài nằm trên <b>một trang</b>: em cuộn xuống để làm lần lượt, bấm số câu ở đầu trang để tới câu chưa làm.</li>}
                {settings.exam_layout === 'one' && <li>Mỗi lần hiện <b>một câu</b>. Trả lời xong em bấm <b>Câu tiếp theo</b>, hoặc bấm số câu trong bảng số câu để chọn câu muốn làm.</li>}
                {settings.exam_review === 'submit' && <li>Nộp bài xong em được <b>xem lại bài làm</b>: đáp án đúng và lời giải từng câu.</li>}
                {settings.exam_review === 'end' && <li>Khi thầy cô thu bài cả lớp, em được <b>xem lại bài làm</b>: đáp án đúng và lời giải từng câu.</li>}
                <li>Làm xong, em bấm <b>Nộp bài kiểm tra</b>. Nộp rồi thì không làm lại được.</li>
              </ul>
            </div>
          )}
          {paced && <p className="muted" style={{ margin: 0, maxWidth: 560 }}>Thầy cô mở từng câu cho cả lớp. Khi chưa hết giờ, em được chọn lại đáp án. Hết giờ mà chưa trả lời thì câu đó tính là chưa trả lời.</p>}
          {!paced && !exam && (
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

  if (exam && (poll.state === 'COMPLETED' || selfDone)) {
    // Kết quả bài kiểm tra: số câu đúng, sai và điểm thang 10. Câu trả lời miệng chờ giáo viên chấm.
    let right = 0, part = 0, oralWait = 0;
    for (const [i, r] of ratios) {
      if (r.oral) {
        const g = poll.my_graded?.[i];
        if (g === undefined) oralWait++;
        else if (g) { right++; part += 1; }
      } else {
        part += r.ratio;
        if (r.ratio >= 1) right++;
      }
    }
    const wrong = Math.max(0, total - right - oralWait);
    const blank = Math.max(0, total - ratios.size);
    const mark = total ? Math.round((part / total) * 1000) / 100 : 0;
    const level = levelOf(total ? Math.round((part / total) * 100) : 0);
    // Em tự nộp bài hay bị thu bài: dựa vào máy chủ (giờ nộp so với giờ thu bài), không dựa vào việc máy này có
    // "chứng kiến" lúc hết giờ hay không — mở lại trang sau giờ thu bài (máy khác, tải lại) vẫn hiện đúng.
    const meP = poll.players.find((p) => p.player_id === me.player_id) as ({ finished?: boolean; finished_at?: number } | undefined);
    const due = poll.deadline ?? 0;
    const serverHanded = !!meP?.finished && !!meP.finished_at && (!due || meP.finished_at < due);
    const handedIn = examSubmitted && !timedOut && (selfSubmitted.current || serverHanded);
    const collectedTitle = due && Date.now() + clockOffset.current >= due ? 'Đã hết giờ làm bài' : 'Thầy cô đã thu bài';
    // Xem lại bài: giáo viên cho xem ngay khi nộp, hoặc chỉ khi đã thu bài cả lớp
    const review = settings.exam_review ?? 'none';
    const canReview = review === 'submit' || (review === 'end' && poll.state === 'COMPLETED');
    // "Đề giấy": tờ đề có điểm và lời phê, kết quả từng phần; xem lại bài đánh số câu theo tờ đề
    const isPaper = settings.exam_layout === 'page' && settings.exam_style === 'paper';
    const secs = isPaper ? sectionsOf(order) : [];
    const nos = sheetNumbers(secs);
    const each = pointEach(total);
    const secResults = secs.map((sec) => {
      let pts = 0, ok = 0;
      for (const i of sec.items) {
        const r = ratios.get(i);
        if (!r) continue;
        if (r.oral) { if (poll.my_graded?.[i]) { pts += 1; ok++; } } else { pts += r.ratio; if (r.ratio >= 1) ok++; }
      }
      return { ...sec, pts: pts * each, ok };
    });
    const rvOrder = isPaper ? secs.flatMap((sec) => sec.items) : order.map((_, i) => i);
    return (
      <Shell>
        {top}
        {isPaper && (
          <article className="paper-sheet" aria-label="Tờ bài kiểm tra đã chấm" style={{ marginBottom: 16 }}>
            <PaperSheetHead
              info={{
                school: quiz.school_name, name: me.name, className: me.class_name, period: quiz.paper_period, year: quiz.school_year,
                code: paperCode || quiz.paper_code, subject: quiz.subject, grade: quiz.grade, minutes: settings.exam_minutes,
                date: poll.started_at ? new Date(poll.started_at) : new Date(),
              }}
              score={{ mark, comment: autoComment(level, oralWait > 0), note: oralWait ? 'Chờ chấm trả lời miệng' : undefined }}
            />
            <div className="ps-result" role="status">
              {secResults.map((sec, k) => (
                <div key={sec.type}>
                  <small>Phần {ROMAN[k] ?? k + 1}: {sec.title}</small>
                  <b>{fmtPoint(sec.pts)} / {fmtPoint(each * sec.items.length)} điểm</b>
                  <span className="muted small"> · đúng {sec.ok}/{sec.items.length} câu</span>
                </div>
              ))}
            </div>
          </article>
        )}
        <div className={`card stack center exam-result lv-${level}`} style={{ margin: reviewOpen ? '0 auto' : 'auto', alignItems: 'center', maxWidth: 600, width: '100%', color: 'var(--fg)' }}>
          <div className="er-band" aria-hidden><i /><i /><i /><i /><i /><i /><i /><i /></div>
          <span className="er-icon" aria-hidden>{level === 'excellent' || level === 'good' ? <Trophy size={40} /> : <PartyPopper size={40} />}</span>
          <h1 className="er-title">{handedIn ? 'Chúc mừng em đã hoàn thành bài kiểm tra!' : collectedTitle}</h1>
          <p className="er-who"><b>{me.name}</b>{me.class_name ? ` · lớp ${me.class_name}` : ''}<br /><span>{quiz.title}{paperCode && !quiz.title.includes(paperCode) ? ` · Mã đề ${paperCode}` : ""}</span></p>
          {!handedIn && <p className="muted" style={{ margin: 0 }}>Bài của em đã được thu. Các câu em đã trả lời đều được tính điểm.</p>}
          <div className="er-score" role="img" aria-label={`Điểm ${mark.toLocaleString('vi-VN')} trên 10`} style={{ '--p': `${Math.min(100, mark * 10)}%` } as React.CSSProperties}>
            <div><b>{mark.toLocaleString('vi-VN')}</b><span>điểm / 10</span></div>
          </div>
          {!oralWait && (
            <span className={`er-level ${level}`}>
              <Star size={18} fill="currentColor" /> Mức đánh giá: {LEVEL_LABEL[level]}
            </span>
          )}
          {!oralWait && <p className="er-cheer">{LEVEL_CHEER[level]}</p>}
          <div className="exam-nums" role="status">
            <div className="ok"><b>{right}</b><span>câu đúng</span></div>
            <div className="bad"><b>{wrong}</b><span>câu sai{blank ? ` (gồm ${blank} câu bỏ trống)` : ''}</span></div>
            <div className="mark"><b>{total}</b><span>câu cả bài</span></div>
          </div>
          <p style={{ margin: 0, fontSize: '1.05rem' }}>Bài kiểm tra em làm đúng <b>{right}/{total}</b> câu, sai <b>{wrong}</b> câu. Điểm em đạt được là <b>{mark.toLocaleString('vi-VN')}</b>.</p>
          {oralWait > 0 && <p className="muted" style={{ margin: 0 }}>Còn {oralWait} câu trả lời miệng chờ thầy cô chấm; điểm sẽ được cộng thêm sau khi chấm.</p>}
          <p className="muted small" style={{ margin: 0 }}>Bài đã nộp và đã khóa, em không thể làm lại bài kiểm tra này.</p>
          {canReview && !reviewOpen && <button className="btn primary" onClick={() => setReviewOpen(true)}><ListChecks size={18} /> Xem lại bài làm</button>}
          {review === 'end' && !canReview && <p className="small" style={{ margin: 0 }}>Khi thầy cô thu bài cả lớp, em xem lại được từng câu (đáp án đúng và lời giải) ngay trên trang này.</p>}
          <button className="btn ghost" onClick={() => nav('/')}><HomeIcon size={18} /> Về trang chủ</button>
        </div>
        {canReview && reviewOpen && (
          <div className="stack exam-review" style={{ maxWidth: 820, width: '100%', margin: '16px auto 0' }}>
            <h2 style={{ margin: 0 }}>Xem lại bài làm</h2>
            {rvOrder.map((i) => {
              const qq = order[i];
              const r = ratios.get(i);
              const g = r?.oral ? poll.my_graded?.[i] : undefined;
              const st = !r ? 'blank' : r.oral ? (g === undefined ? 'wait' : g ? 'ok' : 'bad') : r.ratio >= 1 ? 'ok' : r.ratio > 0 ? 'part' : 'bad';
              const label = { blank: 'Bỏ trống', wait: 'Chờ thầy cô chấm', ok: 'Đúng', part: 'Đúng một phần', bad: 'Sai' }[st];
              return (
                <section key={qq.id} className={`card stack exam-rv ${st}`} style={{ color: 'var(--fg)' }}>
                  <div className="row between"><b>Câu {nos.get(i) ?? i + 1}</b><span className={`badge ${st === 'ok' ? 'green' : st === 'part' || st === 'wait' ? 'amber' : st === 'bad' ? 'red' : ''}`}>{st === 'ok' ? <Check size={14} /> : st === 'bad' ? <X size={14} /> : null} {label}</span></div>
                  <PlayQuestion q={qq} seed={hashString(me.player_id + qq.id)} shuffleOptions={settings.shuffle_options} disabled reveal
                    chosen={myAnswers.get(i) ?? null} onSubmit={() => {}} draft={null} onDraft={() => {}} uploadAudio={uploadAudio} />
                  {qq.explanation && <div className="alert"><div><b>Vì sao?</b> {qq.explanation}</div></div>}
                </section>
              );
            })}
            <button className="btn ghost" style={{ alignSelf: 'center' }} onClick={() => { setReviewOpen(false); window.scrollTo(0, 0); }}>Thu gọn</button>
          </div>
        )}
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
          <Mascot pose="celebrate" size={140} className="result-mascot" />
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
          <div className="lobby-duo">
            <span className="av-sticker"><Avatar value={me.avatar} size={92} /></span>
            <Mascot pose="think" size={104} />
          </div>
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
    selfSubmitted.current = true; // em tự bấm Nộp bài (trước giờ thu bài)
    setSubmitted(true); // nếu còn lượt làm lại câu sai thì màn hỏi làm lại hiện ra trước khi nộp hẳn
  };
  /** Bài kiểm tra: hỏi lại trước khi nộp, vì nộp rồi không làm lại được. */
  const handInExam = async () => {
    if (missing.length) return setSubmitAsk(true);
    if (await askConfirm('Nộp bài kiểm tra?\n\nSau khi nộp, bài được khóa lại và em không thể làm lại.', { okLabel: 'Nộp bài kiểm tra' })) finish();
  };
  const examEnd = exam && !free && curIndex >= total; // trả lời lần lượt: đã qua câu cuối, chờ em bấm nộp
  const pageMode = exam && settings.exam_layout === 'page'; // bài kiểm tra: cả bài trên một trang cuộn như đề giấy
  // "Đề giấy" (Apps Script 1.6.0): trình bày như tờ bài kiểm tra trên lớp, câu hỏi chia phần theo dạng câu
  const paperStyle = pageMode && settings.exam_style === 'paper';
  const sheetSecs = paperStyle ? sectionsOf(order) : [];
  const sheetNos = sheetNumbers(sheetSecs);
  /** Số câu hiển thị: đề giấy đánh số theo thứ tự các phần */
  const noOf = (i: number) => sheetNos.get(i) ?? i + 1;
  const missingShown = paperStyle ? [...missing].sort((a, b) => noOf(a) - noOf(b)) : missing;
  const sheetInfo: SheetInfo = {
    school: quiz.school_name, name: me.name, className: me.class_name, period: quiz.paper_period, year: quiz.school_year,
    code: paperCode || quiz.paper_code, subject: quiz.subject, grade: quiz.grade, minutes: settings.exam_minutes,
    date: poll.started_at ? new Date(poll.started_at) : new Date(),
  };
  /** Tới một câu: chế độ một trang thì cuộn tới câu đó, còn lại thì chuyển câu. */
  const goTo = (i: number) => {
    sfx.pop();
    if (pageMode) {
      document.getElementById(`exam-q-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setIdx(i);
    setDraft(null);
    api.saveProgress(pin, me.player_id, i, null).catch(() => {});
  };
  // Câu chưa trả lời kế tiếp (vòng lại từ đầu)
  const nextOpen = Array.from({ length: total }, (_, k) => (curIndex + 1 + k) % total).find((i) => !answered.has(i));
  const blocked = poll.state === 'PAUSED' || isLocked || needFullscreen;
  return (
    <Shell>
      {top}
      {paperStyle && (
        <div className="exam-page stack">
          <div className="ps-bar">
            <span className="ps-who-mini">
              Thí sinh: <b>{me.name}</b>{me.class_name ? <> • Lớp: <b>{me.class_name}</b></> : null}<br />
              Tiến độ: <span className="ps-prog">{answered.size}/{total}</span> câu đã làm
            </span>
            {examLeftMs !== null && <span className={`badge ${examLeftMs < 60000 ? 'red' : 'amber'}`} role="timer" aria-label="Thời gian làm bài còn lại"><Clock size={16} /> {clock(examLeftMs)}</span>}
            <details>
              <summary className="btn sm ghost"><ListChecks size={16} /> Bảng số câu</summary>
              <div className="qnav-pop">
                <div className="qnav-grid">
                  {sheetSecs.flatMap((s) => s.items).map((i) => (
                    <button key={i} className={`qnav-no ${answered.has(i) ? 'done' : ''}`} onClick={() => goTo(i)} aria-label={`Câu ${noOf(i)}${answered.has(i) ? ', đã trả lời' : ', chưa trả lời'}`}>{noOf(i)}</button>
                  ))}
                </div>
              </div>
            </details>
            <button className="btn sm success" onClick={handInExam} disabled={isLocked}><Send size={16} /> Nộp bài</button>
          </div>
          <article className="paper-sheet" aria-label="Tờ bài kiểm tra">
            <PaperSheetHead info={sheetInfo} score={null} />
            {sheetSecs.map((sec, k) => (
              <Fragment key={sec.type}>
                <div className="ps-section">
                  <h3>{ROMAN[k] ?? k + 1}. {sec.title} ({fmtPoint(pointEach(total) * sec.items.length)} điểm)</h3>
                  <p>{sec.hint} Mỗi câu {fmtPoint(pointEach(total))} điểm.</p>
                </div>
                {sec.items.map((i) => {
                  const qq = order[i];
                  return (
                    <section key={qq.id} id={`exam-q-${i}`} className="ps-q">
                      <PlayQuestion
                        q={qq}
                        seed={hashString(me.player_id + qq.id)}
                        shuffleOptions={settings.shuffle_options}
                        key={editing.has(i) ? 'sua' : 'xem'}
                        disabled={(answered.has(i) && !editing.has(i)) || blocked}
                        reveal={false}
                        chosen={answered.has(i) && !editing.has(i) ? myAnswers.get(i) ?? null : null}
                        onSubmit={(a) => submit(a, i)}
                        draft={editing.has(i) ? myAnswers.get(i) ?? null : null}
                        onDraft={() => {}}
                        uploadAudio={(b) => uploadAudio(b, i)}
                        paper
                        label={<><span className="ps-no">Câu {noOf(i)}.</span><span className="ps-pt">({fmtPoint(pointEach(total))} điểm)</span></>}
                      />
                      {(answered.has(i) || editing.has(i)) && (
                        <div className="ps-q-tools">
                          {answered.has(i) && !editing.has(i) && <span className="small" style={{ color: '#0f8f45', fontWeight: 700 }}><Check size={14} /> Đã ghi nhận bài làm</span>}
                          {answered.has(i) && !editing.has(i) && !blocked && <button className="btn sm ghost" onClick={() => editOn(i, true)}><RotateCcw size={14} /> Chọn lại đáp án</button>}
                          {editing.has(i) && <button className="btn sm ghost" onClick={() => editOn(i, false)}>Giữ đáp án cũ</button>}
                        </div>
                      )}
                    </section>
                  );
                })}
              </Fragment>
            ))}
            <div className="ps-end">
              <span>{missing.length ? `Em còn ${missing.length} câu chưa làm. Em hãy kiểm tra kỹ trước khi nộp bài.` : `Em đã làm đủ ${total} câu. Em hãy kiểm tra kỹ trước khi nộp bài.`}</span>
              <button className="btn success lg" onClick={handInExam} disabled={isLocked}><Send size={20} /> Nộp bài kiểm tra</button>
            </div>
          </article>
        </div>
      )}
      {pageMode && !paperStyle && (
        <div className="exam-page stack">
          <div className="card stack exam-progress" style={{ color: 'var(--fg)' }}>
            <div className="row between">
              <b>Đã trả lời {answered.size}/{total} câu</b>
              <button className="btn sm success" onClick={handInExam} disabled={isLocked}><Send size={16} /> Nộp bài kiểm tra</button>
            </div>
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={answered.size} aria-label="Số câu đã trả lời"><i style={{ width: `${(answered.size / Math.max(1, total)) * 100}%` }} /></div>
            <div className="qnav-grid">
              {order.map((_, i) => (
                <button key={i} className={`qnav-no ${answered.has(i) ? 'done' : ''}`} onClick={() => goTo(i)} aria-label={`Câu ${i + 1}${answered.has(i) ? ', đã trả lời' : ', chưa trả lời'}`}>{i + 1}</button>
              ))}
            </div>
          </div>
          {order.map((qq, i) => (
            <section key={qq.id} id={`exam-q-${i}`} className={`card stack exam-q ${answered.has(i) ? 'done' : ''}`} style={{ color: 'var(--fg)' }}>
              <div className="row between">
                <b>Câu {i + 1}/{total}</b>
                {answered.has(i) && !editing.has(i) && !blocked && (
                  <button className="btn sm ghost" onClick={() => editOn(i, true)}><RotateCcw size={14} /> Chọn lại đáp án</button>
                )}
                {editing.has(i) && <button className="btn sm ghost" onClick={() => editOn(i, false)}>Giữ đáp án cũ</button>}
                {answered.has(i) ? <span className="badge green"><Check size={14} /> Đã trả lời</span> : <span className="badge">Chưa trả lời</span>}
              </div>
              <PlayQuestion
                q={qq}
                seed={hashString(me.player_id + qq.id)}
                shuffleOptions={settings.shuffle_options}
                key={editing.has(i) ? 'sua' : 'xem'}
                disabled={(answered.has(i) && !editing.has(i)) || blocked}
                reveal={false}
                chosen={answered.has(i) && !editing.has(i) ? myAnswers.get(i) ?? null : null}
                onSubmit={(a) => submit(a, i)}
                draft={editing.has(i) ? myAnswers.get(i) ?? null : null}
                onDraft={() => {}}
                uploadAudio={(b) => uploadAudio(b, i)}
              />
            </section>
          ))}
          <div className="card stack center" style={{ alignItems: 'center', color: 'var(--fg)' }}>
            <b>{missing.length ? `Em còn ${missing.length} câu chưa trả lời.` : `Em đã trả lời hết ${total} câu.`}</b>
            <span className="muted small">Trước khi nộp, em có thể bấm "Chọn lại đáp án" ở câu muốn sửa. Sau khi nộp, bài được khóa lại và em không thể làm lại.</span>
            <button className="btn success lg" onClick={handInExam} disabled={isLocked}><Send size={20} /> Nộp bài kiểm tra</button>
          </div>
        </div>
      )}
      {!pageMode && <div className="row between small muted" style={{ fontWeight: 700 }}>
        <span>{examEnd ? `Đã trả lời ${answered.size}/${total} câu` : `Câu ${curIndex + 1}/${total}`}</span>
        {homework && settings.deadline && <span>Hạn nộp: {fmtDeadline(settings.deadline)}</span>}
        {retry && <span className="badge amber">Làm lại câu sai · lượt {retry.round}/{settings.retry_rounds} · câu {retry.pos + 1}/{retry.queue.length}</span>}
        {streak >= 2 && settings.power_ups && !paced && <span className="badge amber">Chuỗi đúng ×{streak}</span>}
      </div>}
      {q && !pageMode && (
        <PlayQuestion
          key={`${curIndex}-${q.id}-${attempt}-${exam && editing.has(curIndex) ? 'sua' : 'xem'}`}
          q={q}
          seed={hashString(me.player_id + q.id)}
          shuffleOptions={settings.shuffle_options}
          disabled={!!feedback || locked || (free && answered.has(curIndex) && !(exam && editing.has(curIndex))) || poll.state === 'PAUSED' || isLocked || needFullscreen}
          reveal={paced ? pacedReveal : exam ? false : !!feedback || (free && !retry && answered.has(curIndex))}
          chosen={feedback?.answer ?? (answered.has(curIndex) && !(exam && editing.has(curIndex)) ? myAnswers.get(curIndex) ?? null : null)}
          onSubmit={submit}
          draft={exam && editing.has(curIndex) ? myAnswers.get(curIndex) ?? null : draft?.i === curIndex ? draft.a : null}
          onDraft={onDraft}
          uploadAudio={uploadAudio}
        />
      )}
      {examEnd && (
        <div className="card stack center" style={{ alignItems: 'center', color: 'var(--fg)', margin: 'auto', maxWidth: 560, width: '100%' }}>
          <ClipboardCheck size={52} color="var(--primary)" />
          <h1 style={{ margin: 0 }}>Em đã trả lời hết {total} câu</h1>
          <p style={{ margin: 0 }}>Bấm nút dưới đây để nộp bài kiểm tra. Sau khi nộp, bài được khóa lại và em không thể làm lại.</p>
          <button className="btn success lg" onClick={handInExam} disabled={isLocked}><Send size={20} /> Nộp bài kiểm tra</button>
        </div>
      )}
      {exam && editing.has(curIndex) && (
        <div className="alert" role="status"><div>Em đang chọn lại đáp án câu {curIndex + 1}. Chọn xong em gửi lại, hoặc <button className="btn sm ghost" onClick={() => editOn(curIndex, false)}>Giữ đáp án cũ</button></div></div>
      )}
      {exam && settings.exam_layout === 'one' && answered.has(curIndex) && !editing.has(curIndex) && (
        <div className="card stack center exam-next" role="status" style={{ alignItems: 'center', color: 'var(--fg)' }}>
          <b><Check size={18} color="var(--success)" /> Đã ghi nhận câu trả lời câu {curIndex + 1}.</b>
          {!blocked && <button className="btn sm ghost" onClick={() => editOn(curIndex, true)}><RotateCcw size={14} /> Chọn lại đáp án</button>}
          {nextOpen !== undefined ? (
            <button className="btn primary lg next-q" autoFocus onClick={() => goTo(nextOpen)}>Câu tiếp theo{nextOpen !== curIndex + 1 ? ` (câu ${nextOpen + 1} chưa làm)` : ''} <ArrowRight size={20} /></button>
          ) : (
            <>
              <span>Em đã trả lời hết {total} câu. Xem lại bảng số câu hoặc nộp bài.</span>
              <button className="btn success lg" onClick={handInExam} disabled={isLocked}><Send size={20} /> Nộp bài kiểm tra</button>
            </>
          )}
        </div>
      )}
      {free && !pageMode && !retry && !feedback && answered.has(curIndex) && !(exam && settings.exam_layout === 'one') && <div className="alert ok" role="status"><div>{exam ? 'Em đã trả lời câu này rồi. Chọn câu khác trong bảng số câu bên dưới, hoặc bấm Nộp bài kiểm tra khi đã làm xong.' : 'Em đã trả lời câu này rồi (đáp án của em và đáp án đúng đang hiện ở trên). Chọn câu khác trong bảng số câu bên dưới.'}</div></div>}
      {free && !pageMode && !retry && (
        <QuestionNav
          total={total} current={curIndex} answered={answered} busy={!!feedback}
          onGo={goTo}
          onSubmit={() => (exam ? handInExam() : answered.size >= total ? finish() : setSubmitAsk(true))}
          submitLabel={exam ? 'Nộp bài kiểm tra' : undefined}
        />
      )}
      {free && submitAsk && (
        <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && setSubmitAsk(false)}>
          <div className="modal" role="alertdialog" aria-label="Nộp bài" style={{ maxWidth: 520 }}>
            <h2 style={{ marginTop: 0 }}>{settings.require_all ? 'Chưa nộp bài được' : 'Em chưa làm hết bài'}</h2>
            <p>
              Em còn <b>{missing.length}</b> câu chưa trả lời: <b>câu {missingShown.map(noOf).join(', ')}</b>.{' '}
              {settings.require_all ? 'Em cần trả lời hết các câu hỏi thì mới được nộp bài.' : exam ? 'Câu bỏ trống tính là sai. Nộp rồi em không làm lại được. Em có muốn nộp bài kiểm tra luôn không?' : 'Câu bỏ trống sẽ không có điểm. Em có muốn nộp bài luôn không?'}
            </p>
            <div className="qnav-grid">
              {missingShown.map((i) => <button key={i} className="qnav-no" onClick={() => { setSubmitAsk(false); goTo(i); }}>{noOf(i)}</button>)}
            </div>
            <div className="row end" style={{ marginTop: 16 }}>
              <button className="btn primary" onClick={() => { setSubmitAsk(false); goTo(missingShown[0]); }}>Làm tiếp câu {noOf(missingShown[0])}</button>
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
          <div className="fb-row">
            {/* Bé Chớp phản ứng theo kết quả: đúng → reo mừng, đúng một phần → suy nghĩ, sai/hết giờ → ối */}
            <Mascot size={92} pose={feedback.answer.kind === 'oral' ? 'think' : feedback.ratio === 1 ? 'cheer' : feedback.ratio > 0 ? 'think' : 'oops'} />
            <span>
          {feedback.answer.kind === 'oral' ? <>Đã gửi – chờ giáo viên chấm</> : feedback.ratio === 1 ? <><Check size={30} /> Chính xác! +{feedback.score.toLocaleString('vi-VN')} điểm{feedback.coins ? ` · +${feedback.coins.toLocaleString('vi-VN')} điểm thưởng` : ''}</> : feedback.ratio > 0 ? <>Đúng một phần +{feedback.score.toLocaleString('vi-VN')} điểm</> : feedback.answer.kind === 'none' ? <><Clock size={30} /> {paced ? 'Hết giờ! Em chưa trả lời câu này.' : 'Hết giờ!'}</> : <><X size={30} /> Chưa đúng</>}
            </span>
          </div>
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
              Em đã vi phạm quy chế thi {Math.max(poll.my_violations ?? 0, lockedCount) || ''} lần, vượt quá số lần thầy cô cho phép.{' '}
              {paced || exam ? 'Hãy giơ tay báo giáo viên để được mở khóa.' : 'Lượt làm này không làm tiếp được nữa. Em hãy thoát ra và vào lại để làm lại từ đầu.'}
            </p>
            {!paced && !exam && <button className="btn primary lg" onClick={restart}><RotateCcw size={20} /> Thoát và làm lại từ đầu</button>}
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
function QuestionNav({ total, current, answered, busy, onGo, onSubmit, submitLabel }: {
  total: number; current: number; answered: Set<number>; busy: boolean; onGo: (i: number) => void; onSubmit: () => void; submitLabel?: string;
}) {
  return (
    <nav className="qnav card" aria-label="Bảng số câu">
      <div className="row between">
        <b>Bảng số câu <span className="muted" style={{ fontWeight: 500 }}>· đã trả lời {answered.size}/{total}</span></b>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm ghost" disabled={busy || current === 0} onClick={() => onGo(current - 1)}>Câu trước</button>
          <button className="btn sm ghost" disabled={busy || current >= total - 1} onClick={() => onGo(current + 1)}>Câu tiếp</button>
          <button className="btn sm success" disabled={busy} onClick={onSubmit}>{submitLabel ?? 'Nộp bài'}</button>
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
