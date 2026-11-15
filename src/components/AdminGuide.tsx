// Bảng hướng dẫn 6 bước cho quản trị: một hàng mốc tiến độ (đã xong / đang làm / chưa tới) và một thẻ nội dung
// cho bước đang chọn. Mỗi bước chỉ vài dòng ngắn để nhìn là hiểu.
import { useEffect, useState, type ReactNode } from 'react';
import { BookOpenCheck, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Globe, GraduationCap, KeyRound, Mail, ServerCog, UserPlus } from 'lucide-react';
import '../guide.css';

interface Props {
  /** Bước đang làm (1–6), tính từ trạng thái thật của hệ thống */
  at: number;
  site: string;
  /** Trang web đã được gắn máy chủ tài khoản (VITE_ADMIN_URL) chưa */
  linked: boolean;
  serverUrl: string;
  copy: (text: string, ok: string) => void;
}

const Line = ({ children }: { children: ReactNode }) => <li><span className="gd-dot" aria-hidden><Check size={12} /></span><span>{children}</span></li>;

export function AdminGuide({ at, site, linked, serverUrl, copy }: Props) {
  const [sel, setSel] = useState(at);
  useEffect(() => setSel(at), [at]); // hệ thống sang bước mới thì thẻ nội dung chuyển theo

  const steps: { icon: typeof Mail; label: string; title: string; time?: string; body: ReactNode; actions?: ReactNode }[] = [
    {
      icon: ServerCog, label: 'Máy chủ', title: 'Cài máy chủ tài khoản', time: 'Một lần · khoảng 5 phút',
      body: <>
        <Line>Dán <b>link thư mục Google Drive</b> lưu trữ rồi bấm <b>Lưu link</b>.</Line>
        <Line><b>Sao chép mã</b>, dán vào Apps Script, <b>Triển khai</b> thành Ứng dụng web (Tôi / Bất kỳ ai).</Line>
        <Line>Dán link <code>/exec</code> và bấm <b>Kiểm tra</b>.</Line>
      </>,
      actions: <small className="muted">Làm ngay ở <b>Trình cài đặt Apps Script</b> bên dưới.</small>,
    },
    {
      icon: KeyRound, label: 'Mật khẩu', title: 'Đổi mật khẩu quản trị', time: 'Bắt buộc',
      body: <>
        <Line>Tài khoản mặc định vừa đăng nhập trở thành tài khoản quản trị.</Line>
        <Line>Bấm <b>Đổi mật khẩu quản trị ngay</b>, đặt mật khẩu riêng (8–72 ký tự).</Line>
        <Line>Lần sau: trang chủ → <b>Dành cho giáo viên</b> → vai trò <b>Quản trị</b>.</Line>
      </>,
    },
    {
      icon: Mail, label: 'Email', title: 'Khai báo email khôi phục', time: 'Nên làm',
      body: <>
        <Line>Bấm <b>Email khôi phục</b> phía trên danh sách tài khoản, điền email cá nhân.</Line>
        <Line>Khi quên mật khẩu: bấm <b>Quên mật khẩu?</b> để nhận mã 6 số qua email.</Line>
      </>,
    },
    {
      icon: Globe, label: 'Bật đăng nhập', title: 'Bật đăng nhập cho giáo viên', time: 'Bắt buộc · một lần',
      body: linked ? (
        <Line>Trang web <b>đã được gắn</b> với máy chủ tài khoản. Giáo viên ở máy nào cũng đăng nhập được.</Line>
      ) : <>
        <Line>Vào Vercel → dự án <b>quickplay</b> → <b>Settings → Environment Variables</b>.</Line>
        <Line>Thêm biến <code>VITE_ADMIN_URL</code>, giá trị là link <code>/exec</code> của máy chủ tài khoản.</Line>
        <Line><b>Save</b> → thẻ <b>Deployments</b> → dấu ba chấm ở bản mới nhất → <b>Redeploy</b>.</Line>
      </>,
      actions: !linked && <>
        <button type="button" className="btn sm" onClick={() => copy('VITE_ADMIN_URL', 'Đã chép tên biến.')}><Copy size={14} /> Chép tên biến</button>
        {serverUrl && <button type="button" className="btn sm" onClick={() => copy(serverUrl, 'Đã chép link /exec.')}><Copy size={14} /> Chép link /exec</button>}
        <a className="btn sm ghost" href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Mở Vercel</a>
      </>,
    },
    {
      icon: UserPlus, label: 'Cấp tài khoản', title: 'Cấp tài khoản cho giáo viên',
      body: <>
        <Line>Bấm <b>Cấp tài khoản</b>: nhập tên tài khoản (ví dụ <code>lan.nguyen</code>), họ tên, mật khẩu ban đầu.</Line>
        <Line>Bấm <b>Chép để gửi</b> rồi gửi cho giáo viên qua Zalo.</Line>
        <Line>Tại đây cũng khóa, mở khóa, đặt lại mật khẩu và xóa tài khoản.</Line>
      </>,
    },
    {
      icon: GraduationCap, label: 'Giáo viên dùng', title: 'Giáo viên và học sinh bắt đầu dùng',
      body: <>
        <Line>Giáo viên mở link giáo viên, đăng nhập, làm Trình cài đặt để nối Google Drive của riêng mình.</Line>
        <Line>Giáo viên khai báo email khôi phục. Từ đó đăng nhập ở máy nào cũng tự kết nối lại.</Line>
        <Line>Học sinh mở link học sinh, nhập mã PIN, tên và lớp. Không cần tài khoản.</Line>
      </>,
      actions: <>
        <button type="button" className="btn sm" onClick={() => copy(`${site}/teacher`, 'Đã chép link cho giáo viên.')}><Copy size={14} /> Chép link giáo viên</button>
        <button type="button" className="btn sm" onClick={() => copy(`${site}/join`, 'Đã chép link cho học sinh.')}><Copy size={14} /> Chép link học sinh</button>
      </>,
    },
  ];
  const cur = steps[sel - 1];
  const state = (n: number) => (n < at ? 'done' : n === at ? 'now' : 'todo');
  const doneCount = Math.max(0, at - 1);

  return (
    <section className="card gd" aria-label="Hướng dẫn từng bước cho quản trị">
      <header className="gd-head">
        <span className="gd-title"><BookOpenCheck size={20} aria-hidden /> Hướng dẫn cho quản trị</span>
        <span className="gd-count">Đã xong <b>{doneCount}</b>/6</span>
      </header>

      <ol className="gd-track" role="tablist" aria-label="Các bước">
        {steps.map((s, i) => {
          const n = i + 1;
          const Ic = s.icon;
          const st = state(n);
          return (
            <li key={n} className={`gd-node ${st} ${sel === n ? 'sel' : ''}`}>
              <button type="button" role="tab" aria-selected={sel === n} aria-label={`Bước ${n}: ${s.title}${st === 'done' ? ' (đã xong)' : st === 'now' ? ' (đang làm)' : ''}`} onClick={() => setSel(n)}>
                <span className="gd-ball">{st === 'done' ? <Check size={18} /> : <Ic size={18} />}</span>
                <span className="gd-label">{s.label}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className={`gd-panel ${state(sel)}`} role="tabpanel">
        <div className="gd-panel-head">
          <span className="gd-step">Bước {sel}</span>
          <h3>{cur.title}</h3>
          {state(sel) === 'done' && <span className="badge green"><Check size={12} /> Đã xong</span>}
          {state(sel) === 'now' && <span className="badge blue">Đang làm</span>}
          {cur.time && <span className="gd-time">{cur.time}</span>}
        </div>
        <ul className="gd-lines">{cur.body}</ul>
        {cur.actions && <div className="gd-actions">{cur.actions}</div>}
        <div className="gd-nav">
          <button type="button" className="btn sm ghost" onClick={() => setSel(sel - 1)} disabled={sel === 1}><ChevronLeft size={16} /> Bước trước</button>
          <button type="button" className="btn sm ghost" onClick={() => setSel(sel + 1)} disabled={sel === 6}>Bước sau <ChevronRight size={16} /></button>
        </div>
      </div>
    </section>
  );
}
