import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Radio, Users, Home as HomeIcon, ShieldAlert, Eye } from 'lucide-react';
import type { AntiCheatSettings, QuizSummary, SessionMode, SessionSettings } from '../lib/types';
import { DEFAULT_ANTI_CHEAT } from '../lib/anticheat';
import { api } from '../lib/api';
import { Modal, useToast } from './ui';

const MODES: { id: SessionMode; title: string; desc: string; icon: typeof Radio }[] = [
  { id: 'classic_live', title: 'Trực tiếp tự do', desc: 'Mỗi học sinh làm theo tốc độ riêng, bảng điểm cập nhật liên tục.', icon: Radio },
  { id: 'instructor_paced', title: 'Giáo viên điều khiển nhịp', desc: 'Thầy cô mở từng câu, xem thống kê rồi chuyển câu.', icon: Users },
  { id: 'homework', title: 'Giao bài về nhà', desc: 'Đặt giờ mở và hạn nộp; tự lưu nháp, làm tiếp được.', icon: HomeIcon },
];

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function HostSetupDialog({ quiz, onClose }: { quiz: QuizSummary; onClose: () => void }) {
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [s, setS] = useState<SessionSettings>({
    mode: 'classic_live',
    music: true,
    shuffle_questions: true,
    shuffle_options: true,
    show_leaderboard: true,
    leaderboard_top: 10,
    power_ups: true,
    anti_cheat: { ...DEFAULT_ANTI_CHEAT },
  });
  const ac = s.anti_cheat!;
  const setAc = (p: Partial<AntiCheatSettings>) => setS((x) => ({ ...x, anti_cheat: { ...x.anti_cheat!, ...p } }));
  const [start, setStart] = useState(toLocalInput(new Date()));
  const [deadline, setDeadline] = useState(toLocalInput(new Date(Date.now() + 7 * 86400000)));
  const set = (p: Partial<SessionSettings>) => setS((x) => ({ ...x, ...p }));
  const [roundsText, setRoundsText] = useState('0');
  /** Lưu số lượt làm lại giáo viên tự điền (0–20). */
  const saveRounds = () => {
    const n = Math.round(Number(roundsText));
    if (!Number.isFinite(n) || n < 0 || n > 20 || roundsText.trim() === '') return toast('Số lượt làm lại là một số từ 0 đến 20.', 'error');
    set({ retry_rounds: n });
    setRoundsText(String(n));
    toast(n ? `Đã lưu: học sinh được làm lại các câu sai tối đa ${n} lượt.` : 'Đã lưu: không cho làm lại.', 'ok');
  };
  const [days, setDays] = useState(7); // 0 = tự chọn hạn nộp
  const pickDays = (n: number) => {
    setDays(n);
    if (n) setDeadline(toLocalInput(new Date(new Date(start).getTime() + n * 86400000)));
  };

  const go = async () => {
    if (s.mode !== 'instructor_paced' && String(s.retry_rounds ?? 0) !== roundsText.trim())
      return toast('Thầy cô vừa điền số lượt làm lại nhưng chưa bấm "Lưu số lượt".', 'error');
    const settings = { ...s };
    if (s.mode === 'homework') {
      if (new Date(deadline) <= new Date(start)) return toast('Hạn nộp phải sau giờ mở.', 'error');
      settings.start_time = new Date(start).toISOString();
      settings.deadline = new Date(deadline).toISOString();
    }
    setBusy(true);
    try {
      const { pin } = await api.createSession(quiz.id, settings);
      nav(`/teacher/host/${pin}`);
    } catch (e) {
      toast((e as Error).message, 'error');
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Tổ chức: ${quiz.title}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Hủy</button>
          <Link className="btn" to={`/teacher/preview/${quiz.id}`}><Eye size={18} /> Chơi thử như học sinh</Link>
          <button className="btn success lg" onClick={go} disabled={busy}>{busy ? 'Đang tạo phòng…' : s.mode === 'homework' ? 'Giao bài' : 'Mở phòng chờ'}</button>
        </>
      }
    >
      <div className="stack" style={{ gap: 18 }}>
        <div className="type-grid" role="radiogroup" aria-label="Chế độ chơi">
          {MODES.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={s.mode === m.id} aria-label={m.title} className="type-btn" onClick={() => set({ mode: m.id })}
              style={s.mode === m.id ? { borderColor: 'var(--primary)', background: '#eff6ff' } : undefined}>
              <span className="ic" style={{ background: s.mode === m.id ? 'var(--primary)' : '#94a3b8' }}><m.icon size={20} /></span>
              <span><b>{m.title}</b><br /><small className="muted">{m.desc}</small></span>
            </button>
          ))}
        </div>
        {s.mode === 'homework' && (
          <div className="stack">
            <div className="field">
              <span>Thời gian làm bài</span>
              <div className="row" role="radiogroup" aria-label="Thời gian giao bài">
                {[[1, '1 ngày'], [2, '2 ngày'], [3, '3 ngày'], [7, '1 tuần'], [14, '2 tuần'], [0, 'Tự chọn']].map(([n, label]) => (
                  <button key={n} type="button" role="radio" aria-checked={days === n} className={`tab ${days === n ? 'on' : ''}`} onClick={() => pickDays(n as number)}>{label}</button>
                ))}
              </div>
            </div>
            <div className="row">
              <label className="field grow"><span>Bắt đầu</span><input className="input" type="datetime-local" value={start}
                onChange={(e) => { setStart(e.target.value); if (days) setDeadline(toLocalInput(new Date(new Date(e.target.value).getTime() + days * 86400000))); }} /></label>
              <label className="field grow"><span>Kết thúc (hạn nộp)</span><input className="input" type="datetime-local" value={deadline}
                onChange={(e) => { setDeadline(e.target.value); setDays(0); }} /></label>
            </div>
            <p className="help" style={{ margin: 0 }}>Thầy cô vẫn có thể bấm Kết thúc sớm bất cứ lúc nào để xem bảng tổng kết.</p>
          </div>
        )}
        {s.mode !== 'instructor_paced' && (
          <div className="stack" style={{ gap: 8 }}>
            <div className="field">
              <span>Cách học sinh làm bài</span>
              <div className="row" role="radiogroup" aria-label="Cách học sinh làm bài">
                <button type="button" role="radio" aria-checked={s.navigation !== 'free'} className={`tab ${s.navigation !== 'free' ? 'on' : ''}`} onClick={() => set({ navigation: 'sequential' })}>Trả lời lần lượt từng câu</button>
                <button type="button" role="radio" aria-checked={s.navigation === 'free'} className={`tab ${s.navigation === 'free' ? 'on' : ''}`} onClick={() => set({ navigation: 'free' })}>Tự do chọn câu để trả lời</button>
              </div>
              <small className="help">
                {s.navigation === 'free'
                  ? 'Học sinh có bảng số câu, bấm số nào chuyển tới câu đó, làm xong bấm Nộp bài. Chế độ này không tính giờ từng câu và không thưởng tốc độ.'
                  : 'Học sinh phải trả lời câu đang làm thì mới sang được câu tiếp theo.'}
              </small>
            </div>
            <div className="field">
              <span>Sau khi hiện kết quả một câu</span>
              <div className="row" role="radiogroup" aria-label="Cách sang câu tiếp theo">
                <button type="button" role="radio" aria-checked={s.auto_next !== false} className={`tab ${s.auto_next !== false ? 'on' : ''}`} onClick={() => set({ auto_next: true })}>Tự sang câu sau</button>
                <button type="button" role="radio" aria-checked={s.auto_next === false} className={`tab ${s.auto_next === false ? 'on' : ''}`} onClick={() => set({ auto_next: false })}>Học sinh bấm "Câu tiếp theo"</button>
              </div>
              <small className="help">
                {s.auto_next === false
                  ? 'Kết quả và lời giải thích ở lại trên màn hình cho tới khi học sinh bấm "Câu tiếp theo". Hợp với lớp nhỏ, cần thời gian đọc.'
                  : 'Tự chuyển sau khoảng 2 giây; nếu câu có lời giải thích hoặc em trả lời chưa đúng thì chờ 7 giây. Học sinh vẫn có thể bấm "Câu tiếp theo" để đi nhanh hơn.'}
              </small>
            </div>
            {s.navigation === 'free' && (
              <div className="field">
                <span>Khi học sinh bấm Nộp bài mà chưa làm hết</span>
                <div className="row" role="radiogroup" aria-label="Quy tắc nộp bài">
                  <button type="button" role="radio" aria-checked={!s.require_all} className={`tab ${!s.require_all ? 'on' : ''}`} onClick={() => set({ require_all: false })}>Vẫn nhận bài</button>
                  <button type="button" role="radio" aria-checked={!!s.require_all} className={`tab ${s.require_all ? 'on' : ''}`} onClick={() => set({ require_all: true })}>Phải trả lời hết mới được nộp</button>
                </div>
                <small className="help">{s.require_all ? 'Phần mềm báo cho học sinh các câu còn thiếu và không cho nộp.' : 'Phần mềm nhắc các câu còn thiếu, học sinh vẫn nộp được. Câu bỏ trống tính là sai.'}</small>
              </div>
            )}
          </div>
        )}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 4 }}>
          {s.mode !== 'instructor_paced' && <label className="switch"><input type="checkbox" checked={s.shuffle_questions} onChange={(e) => set({ shuffle_questions: e.target.checked })} /> Xáo trộn câu hỏi</label>}
          <label className="switch"><input type="checkbox" checked={s.shuffle_options} onChange={(e) => set({ shuffle_options: e.target.checked })} /> Xáo trộn đáp án</label>
          <label className="switch"><input type="checkbox" checked={s.show_leaderboard} onChange={(e) => set({ show_leaderboard: e.target.checked })} /> Hiện bảng xếp hạng</label>
          <label className="switch"><input type="checkbox" checked={s.power_ups} onChange={(e) => set({ power_ups: e.target.checked })} /> Thưởng chuỗi trả lời đúng</label>
          <label className="switch"><input type="checkbox" checked={s.music} onChange={(e) => set({ music: e.target.checked })} /> Nhạc nền</label>
        </div>
        {s.mode === 'instructor_paced' ? (
          <p className="help" style={{ margin: 0 }}>
            Giáo viên điều khiển: học sinh không được làm lại câu sai, nhưng khi câu còn thời gian thì được chọn lại đáp án. Hết giờ mà chưa trả lời, em được ghi là <b>chưa trả lời</b>.
          </p>
        ) : (
          <div className="field">
            <span>Cho học sinh làm lại các câu trả lời sai</span>
            <div className="row" role="radiogroup" aria-label="Số lượt làm lại câu sai">
              {[0, 1, 2, 3].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={(s.retry_rounds ?? 0) === n} className={`tab ${(s.retry_rounds ?? 0) === n ? 'on' : ''}`} onClick={() => { set({ retry_rounds: n }); setRoundsText(String(n)); }}>
                  {n ? `${n} lượt` : 'Không cho làm lại'}
                </button>
              ))}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <label htmlFor="retry-rounds" className="small" style={{ fontWeight: 600 }}>Hoặc tự điền số lượt:</label>
              <input id="retry-rounds" className="input" type="number" inputMode="numeric" min={0} max={20} style={{ width: 96 }} value={roundsText}
                onChange={(e) => setRoundsText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), saveRounds())} />
              <button type="button" className="btn sm primary" onClick={saveRounds} disabled={String(s.retry_rounds ?? 0) === roundsText.trim()}>Lưu số lượt</button>
              <span className="badge blue">Đang áp dụng: {s.retry_rounds ? `${s.retry_rounds} lượt` : 'không cho làm lại'}</span>
            </div>
            <small className="help">
              {s.retry_rounds
                ? `Đây là số lượt cho CẢ BÀI, không phải cho từng câu. Làm xong bài, học sinh được làm lại những câu còn sai; vẫn sai thì làm lại tiếp, tối đa ${s.retry_rounds} lượt. Câu làm lại đúng được tính điểm như bình thường.`
                : 'Mỗi câu chỉ được trả lời một lần.'}
            </small>
          </div>
        )}
        {s.show_leaderboard && (
          <label className="field" style={{ maxWidth: 320 }}>
            <span>Bảng xếp hạng và tặng cúp cho</span>
            <select className="input" value={s.leaderboard_top ?? 10} onChange={(e) => set({ leaderboard_top: Number(e.target.value) })}>
              <option value={3}>Top 3 bạn dẫn đầu</option>
              <option value={5}>Top 5 bạn dẫn đầu</option>
              <option value={10}>Top 10 bạn dẫn đầu</option>
              <option value={15}>Top 15 bạn dẫn đầu</option>
              <option value={0}>Tất cả học sinh</option>
            </select>
          </label>
        )}

        <fieldset className="card tight stack" style={{ border: `2px solid ${ac.enabled ? '#fca5a5' : 'var(--border)'}`, background: ac.enabled ? '#fff7f7' : undefined }}>
          <legend className="row" style={{ gap: 6, fontWeight: 800, padding: '0 6px' }}><ShieldAlert size={18} color="#dc2626" /> Chống gian lận</legend>
          <label className="switch"><input type="checkbox" checked={ac.enabled} onChange={(e) => setAc({ enabled: e.target.checked })} /> Bật chế độ thi nghiêm túc</label>
          {ac.enabled && (
            <>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 4 }}>
                <label className="switch"><input type="checkbox" checked={ac.block_right_click} onChange={(e) => setAc({ block_right_click: e.target.checked })} /> Chặn chuột phải (Google Lens, "Tìm bằng hình ảnh")</label>
                <label className="switch"><input type="checkbox" checked={ac.block_copy} onChange={(e) => setAc({ block_copy: e.target.checked })} /> Chặn sao chép, dán, bôi đen, phím tắt</label>
                <label className="switch"><input type="checkbox" checked={ac.detect_leave} onChange={(e) => setAc({ detect_leave: e.target.checked })} /> Phát hiện rời màn hình (chuyển tab, ChatGPT, công cụ chụp)</label>
                <label className="switch"><input type="checkbox" checked={ac.require_fullscreen} onChange={(e) => setAc({ require_fullscreen: e.target.checked })} /> Bắt buộc làm bài toàn màn hình</label>
              </div>
              <div className="stack" style={{ gap: 6 }}>
                <span style={{ fontWeight: 800 }}>Ngưỡng gian lận</span>
                <div className="row">
                  <label className="switch">
                    <input type="radio" name="lockmode" checked={ac.max_violations > 0} onChange={() => setAc({ max_violations: 5 })} />
                    Cho phép vi phạm tối đa
                  </label>
                  <input className="input" type="number" min={1} max={20} style={{ width: 90 }} aria-label="Số lần vi phạm được phép"
                    value={ac.max_violations || ''} disabled={ac.max_violations === 0}
                    onChange={(e) => setAc({ max_violations: Math.min(20, Math.max(1, Math.round(Number(e.target.value) || 1))) })} />
                  <span>lần (chỉ cảnh báo)</span>
                  <label className="switch">
                    <input type="radio" name="lockmode" checked={ac.max_violations === 0} onChange={() => setAc({ max_violations: 0 })} />
                    Không bao giờ khóa
                  </label>
                </div>
                <div className={`alert ${ac.max_violations ? 'warn' : ''}`} style={{ margin: 0 }}>
                  <div>
                    {ac.max_violations
                      ? <>Lần vi phạm 1 → {ac.max_violations}: học sinh nhận <b>cảnh báo</b>. Đến lần thứ <b>{ac.max_violations + 1}</b>, lượt chơi bị <b>khóa và vô hiệu hóa</b> cho tới khi thầy cô bấm Mở khóa.</>
                      : <>Học sinh chỉ nhận cảnh báo, không bị khóa. Mọi vi phạm vẫn được ghi lại cho thầy cô.</>}
                  </div>
                </div>
              </div>
              <p className="help" style={{ margin: 0 }}>
                Mọi vi phạm hiện ngay ở tab <b>Giám sát gian lận</b> của thầy cô. Bài bị khóa có thể được mở lại bằng một cú bấm.
                Lưu ý: trình duyệt không thể ngăn học sinh dùng điện thoại khác để chụp màn hình – hãy kết hợp quan sát trên lớp.
              </p>
            </>
          )}
        </fieldset>
        {s.mode === 'instructor_paced' && s.shuffle_questions && (
          <p className="help" style={{ margin: 0 }}>Ở chế độ giáo viên điều khiển, mọi học sinh cùng làm một câu nên thứ tự câu hỏi được giữ nguyên.</p>
        )}
      </div>
    </Modal>
  );
}
