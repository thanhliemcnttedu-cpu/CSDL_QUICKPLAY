// Màn chiếu của buổi học quét thẻ: mã QR cho điện thoại, câu hỏi, lưới học sinh, kết quả và bảng tổng kết.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { ArrowRight, BellRing, ChartColumn, Download, QrCode, Square } from 'lucide-react';
import type { Quiz, Session } from '../lib/types';
import { api } from '../lib/api';
import { cardOf, type PaperOp } from '../lib/paper';
import { loadSettings } from '../lib/settings';
import { OPTION_LABELS, htmlToText, sanitizeHtml } from '../lib/util';
import { buildXlsx, downloadBlob } from '../lib/xlsx';
import { StemMedia } from '../components/MediaView';
import { Wordmark } from '../components/Logo';
import { AppFooter } from '../components/AppFooter';
import { Spinner, useToast, askConfirm } from '../components/ui';
import { LiveReport } from '../components/LiveReport';
import '../paper.css';

function scanUrl(pin: string, key: string): string {
  const s = loadSettings();
  const base = location.protocol.startsWith('http') ? location.origin : ((import.meta.env.VITE_PUBLIC_URL as string | undefined) ?? '');
  if (!base) return '';
  const script = s.backend === 'drive' && s.scriptUrl ? `&s=${encodeURIComponent(s.scriptUrl)}` : '';
  return `${base.replace(/\/+$/, '')}/quet?pin=${pin}&k=${encodeURIComponent(key)}${script}`;
}

const choiceOf = (a: { answer: unknown }) => (a.answer as { choice: number }).choice;

export default function PaperHost() {
  const { pin = '' } = useParams();
  const toast = useToast();
  const [s, setS] = useState<Session | null>(null);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [err, setErr] = useState('');
  const [qr, setQr] = useState('');
  const [showQr, setShowQr] = useState(false);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    try {
      setS(await api.hostState(pin));
      setErr('');
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [pin]);
  useEffect(() => {
    api.getSessionQuiz(pin).then((r) => setQuiz(r.quiz)).catch((e) => setErr((e as Error).message));
    refresh();
    const id = window.setInterval(refresh, 1500);
    return () => clearInterval(id);
  }, [pin, refresh]);

  const key = s?.paper?.scan_key ?? '';
  const link = useMemo(() => (key ? scanUrl(pin, key) : ''), [pin, key]);
  useEffect(() => {
    if (link) QRCode.toDataURL(link, { margin: 1, width: 360 }).then(setQr).catch(() => {});
  }, [link]);

  const act = async (op: PaperOp) => {
    if (!s || busy.current) return;
    busy.current = true;
    try {
      await api.paperAction(pin, key, op);
      await refresh();
    } catch (e) {
      toast((e as Error).message, 'error');
    } finally {
      busy.current = false;
    }
  };

  if (err && !s) return <div className="pp-stage"><div className="alert error"><div>{err}</div></div><Link className="btn" to="/teacher/paper">Quay lại</Link></div>;
  if (!s || !quiz) return <div className="pp-stage"><Spinner /></div>;
  if (s.settings.mode !== 'paper' || !s.paper) return <div className="pp-stage"><div className="alert error"><div>Phòng này không ở chế độ giấy.</div></div></div>;

  const qs = quiz.questions;
  const head = (
    <header className="pp-top">
      <Wordmark size={30} />
      <span className="badge blue">Lớp {s.paper.class_name}</span>
      <span className="muted small grow">{s.quiz_title}</span>
    </header>
  );

  // ---------- Tổng kết ----------
  if (s.state === 'COMPLETED') {
    const rows = s.players.map((p) => ({ p, card: cardOf(p.player_id) }));
    const stats = qs.map((q, i) => {
      const ans = s.answers.filter((a) => a.q_index === i);
      const wrong = ans.filter((a) => !a.correct).length;
      return { i, q, answered: ans.length, wrong, pct: ans.length ? Math.round((wrong / ans.length) * 100) : 0 };
    });
    const hard = [...stats].filter((x) => x.wrong > 0).sort((a, b) => b.pct - a.pct || b.wrong - a.wrong).slice(0, 5);
    const exportXlsx = async () => {
      const letter = (pid: string, i: number) => {
        const a = s.answers.find((x) => x.player_id === pid && x.q_index === i);
        return a ? `${OPTION_LABELS[choiceOf(a)]} ${a.correct ? '(đúng)' : '(sai)'}` : '';
      };
      const blob = await buildXlsx([
        {
          name: 'Bảng điểm',
          rows: [
            [`Lớp ${s.paper!.class_name} – ${s.quiz_title}`],
            [`Ngày: ${new Date(s.created_at).toLocaleString('vi-VN')}`],
            [],
            ['Số thẻ', 'Họ tên', 'Số câu đúng', 'Số câu đã trả lời', 'Tổng số câu', 'Điểm', ...qs.map((_, i) => `Câu ${i + 1}`)],
            ...rows.map(({ p, card }) => [card, p.name, p.correct, p.answered, qs.length, p.score, ...qs.map((_, i) => letter(p.player_id, i))]),
          ],
        },
        {
          name: 'Phân tích câu hỏi',
          rows: [
            ['Câu', 'Nội dung', 'Đáp án đúng', 'Số em trả lời', 'Số em sai', 'Tỉ lệ sai (%)'],
            ...stats.map((x) => [x.i + 1, htmlToText(x.q.stem.text), OPTION_LABELS[x.q.options.findIndex((o) => o.is_correct)], x.answered, x.wrong, x.pct]),
          ],
        },
      ]);
      downloadBlob(`Quickplay-bang-diem-${s.paper!.class_name}-${pin}.xlsx`, blob);
    };
    return (
      <div className="pp-stage">
        {head}
        <div className="row between">
          <h1 style={{ margin: 0 }}>Bảng tổng kết</h1>
          <div className="row">
            <button className="btn ghost" onClick={exportXlsx}><Download size={18} /> Xuất Excel đáp án từng thẻ</button>
            <Link className="btn ghost" to="/teacher/paper">Buổi học khác</Link>
          </div>
        </div>
        {hard.length > 0 && (
          <section className="card stack">
            <h2 style={{ margin: 0 }}>Câu nhiều em sai, nên giảng lại</h2>
            {hard.map((x) => (
              <div key={x.i} className="pp-hard">
                <b>Câu {x.i + 1}</b>
                <span className="grow">{htmlToText(x.q.stem.text)}</span>
                <span className="badge red">{x.wrong}/{x.answered} em sai ({x.pct}%)</span>
              </div>
            ))}
          </section>
        )}
        <LiveReport s={s} quiz={quiz} />
        <h2 style={{ margin: 0 }}>Đáp án từng em theo thẻ</h2>
        <section className="card" style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Thẻ</th><th>Họ tên</th><th>Đúng</th><th>Điểm</th>{qs.map((_, i) => <th key={i} className="center">{i + 1}</th>)}</tr></thead>
            <tbody>
              {rows.map(({ p, card }) => (
                <tr key={p.player_id}>
                  <td>{card}</td><td>{p.name}</td><td>{p.correct}/{qs.length}</td><td>{p.score}</td>
                  {qs.map((_, i) => {
                    const a = s.answers.find((x) => x.player_id === p.player_id && x.q_index === i);
                    return <td key={i} className="center"><span className={`pp-dot ${a ? (a.correct ? 'ok' : 'bad') : ''}`} title={a ? (a.correct ? 'Đúng' : 'Sai') : 'Chưa trả lời'}>{a ? OPTION_LABELS[choiceOf(a)] : '·'}</span></td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <AppFooter compact />
      </div>
    );
  }

  // ---------- Chờ điện thoại kết nối ----------
  const qrPanel = (
    <div className="pp-qr card">
      {qr ? <img src={qr} alt="Mã QR mở máy quét thẻ trên điện thoại" /> : <p className="muted">Không tạo được mã QR vì ứng dụng không chạy trên địa chỉ web.</p>}
      <div className="stack">
        <div className="step-pill"><b><QrCode size={20} /></b> Quét mã này bằng điện thoại</div>
        <p style={{ margin: 0 }}>Thầy cô mở camera điện thoại, quét mã QR. Quét xong là vào thẳng máy quét thẻ, chạy ngay trên trình duyệt, không cài ứng dụng.</p>
        {loadSettings().backend !== 'drive' && <div className="alert warn"><div>Đang dùng chế độ “Máy này”: máy quét chỉ mở được trên chính trình duyệt này. Để quét bằng điện thoại, hãy kết nối Google Drive trong Cài đặt.</div></div>}
        {link && <a className="small" href={link} target="_blank" rel="noreferrer">Mở máy quét trên thiết bị này</a>}
      </div>
    </div>
  );
  if (!s.paper.connected) return <div className="pp-stage">{head}<h1 style={{ margin: 0 }}>Kết nối điện thoại của thầy cô</h1>{qrPanel}<AppFooter compact /></div>;

  // ---------- Đang hỏi ----------
  const q = qs[s.current_index];
  const answers = s.answers.filter((a) => a.q_index === s.current_index);
  const byPlayer = new Map(answers.map((a) => [a.player_id, a]));
  const done = answers.length;
  const total = s.players.length;
  const reveal = !!s.paper.reveal || (total > 0 && done >= total);
  const waiting = s.players.filter((p) => !byPlayer.has(p.player_id));
  const counts = q.options.map((_, i) => answers.filter((a) => choiceOf(a) === i).length);
  const max = Math.max(1, ...counts);
  const last = s.current_index >= s.question_count - 1;

  return (
    <div className="pp-stage">
      {head}
      <div className="pp-bar">
        <span className="pp-count">Câu {s.current_index + 1}/{s.question_count}</span>
        <span className="pp-count">Đã nhận <b>{done}</b>/{total} thẻ</span>
        <span className="grow" />
        <button className="btn ghost" onClick={() => setShowQr((v) => !v)}><QrCode size={18} /> Mã QR</button>
        <button className={`btn ${s.paper.remind ? 'accent' : 'ghost'}`} onClick={() => act('remind')} disabled={!waiting.length}><BellRing size={18} /> Nhắc</button>
        <button className="btn ghost" onClick={() => act('reveal')} disabled={total > 0 && done >= total}><ChartColumn size={18} /> {s.paper.reveal ? 'Ẩn kết quả' : 'Hiện kết quả'}</button>
        <button className="btn primary" onClick={() => act('next')}>{last ? 'Xem tổng kết' : 'Câu tiếp'} <ArrowRight size={18} /></button>
        <button className="btn danger" onClick={async () => (await askConfirm('Kết thúc buổi học và xem bảng tổng kết?')) && act('end')}><Square size={16} /> Kết thúc</button>
      </div>
      {showQr && qrPanel}

      <div className="pp-main">
        <section className="card pp-question">
          <div className="pp-stem" dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.stem.text) }} />
          <StemMedia stem={q.stem} />
          <div className="pp-opts">
            {q.options.map((o, i) => (
              <div key={o.option_id} className={`pp-opt ${reveal && o.is_correct ? 'right' : ''}`}>
                <b>{OPTION_LABELS[i]}</b>
                <span className="grow"><span dangerouslySetInnerHTML={{ __html: sanitizeHtml(o.text) }} />{o.image_url && <img src={o.image_url} alt="" />}</span>
                {reveal && (
                  <span className="pp-meter" aria-label={`${counts[i]} em chọn ${OPTION_LABELS[i]}`}>
                    <i style={{ width: `${(counts[i] / max) * 100}%` }} />
                    <em>{counts[i]}</em>
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="card stack">
          {s.paper.remind && waiting.length > 0 && (
            <div className="alert warn" role="status"><div><b>Các em chưa giơ thẻ:</b> {waiting.map((p) => `${cardOf(p.player_id)}. ${p.name}`).join(' · ')}</div></div>
          )}
          {reveal && <div className="ok-strip">Đã hiện kết quả: xanh là đúng, đỏ là sai. Đúng {answers.filter((a) => a.correct).length}/{done} em.</div>}
          <div className="pp-grid" aria-label="Trạng thái thẻ của từng học sinh">
            {s.players.map((p) => {
              const a = byPlayer.get(p.player_id);
              const cls = !a ? (s.paper!.remind ? 'wait' : '') : reveal ? (a.correct ? 'ok' : 'bad') : 'got';
              const label = !a ? 'chưa giơ thẻ' : reveal ? (a.correct ? 'đúng' : 'sai') : 'đã nhận';
              return (
                <div key={p.player_id} className={`pp-tile ${cls}`} title={`${p.name}: ${label}`}>
                  <b>{cardOf(p.player_id)}</b>
                  <span>{p.name}</span>
                  {a && reveal && <em>{OPTION_LABELS[choiceOf(a)]}</em>}
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <AppFooter compact />
    </div>
  );
}
