// Bảng hướng dẫn 6 bước cho quản trị: một hàng mốc tiến độ (đã xong / đang làm / chưa tới) và một thẻ nội dung
// cho bước đang chọn. Mỗi bước chỉ vài dòng ngắn để nhìn là hiểu.
import { useEffect, useState, type ReactNode } from 'react';
import { BookOpenCheck, Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Globe, GraduationCap, KeyRound, Mail, RefreshCw, ServerCog, UserPlus } from 'lucide-react';
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

/** Tên nút / mục đúng như chữ hiện trên màn hình Vercel */
const Key = ({ children, go }: { children: ReactNode; go?: boolean }) => <span className={`gd-key ${go ? 'go' : ''}`}>{children}</span>;
const Line = ({ children }: { children: ReactNode }) => <li><span className="gd-dot" aria-hidden><Check size={12} /></span><span>{children}</span></li>;

export function AdminGuide({ at, site, linked, serverUrl, copy }: Props) {
  const [sel, setSel] = useState(at);
  useEffect(() => setSel(at), [at]); // hệ thống sang bước mới thì thẻ nội dung chuyển theo
  // Màn hình điện thoại: mặc định thu gọn để danh sách tài khoản hiện ngay, bấm để mở lại
  const [open, setOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia || !window.matchMedia('(max-width: 640px)').matches);

  const steps: { icon: typeof Mail; label: string; title: string; time?: string; body: ReactNode; actions?: ReactNode; raw?: boolean }[] = [
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
      icon: KeyRound, label: 'Mật khẩu', title: 'Mật khẩu quản trị', time: 'Tùy chọn',
      body: <>
        <Line>Tài khoản mặc định vừa đăng nhập trở thành tài khoản quản trị.</Line>
        <Line><b>Có thể giữ nguyên mật khẩu hiện tại.</b> Muốn đổi thì bấm <b>Đổi mật khẩu quản trị</b> và đặt mật khẩu riêng (8–72 ký tự).</Line>
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
      icon: Globe, label: 'Bật đăng nhập', title: 'Bật đăng nhập cho giáo viên', time: 'Bắt buộc · một lần · khoảng 3 phút',
      raw: true,
      body: linked ? (
        <ul className="gd-lines"><Line>Trang web <b>đã được gắn</b> với máy chủ tài khoản. Giáo viên ở máy nào cũng đăng nhập được.</Line></ul>
      ) : (
        <>
          <p className="gd-why">Việc này báo cho trang web biết máy chủ tài khoản nằm ở đâu. Chưa làm thì giáo viên ở máy khác <b>chưa đăng nhập được</b>. Làm trên trang Vercel (nơi đang chạy trang web), theo đúng 7 việc dưới đây:</p>
          <ol className="gd-sub">
            <li>
              <b>Chép link máy chủ tài khoản.</b> Bấm nút bên dưới, link <code>/exec</code> được chép vào bộ nhớ tạm.
              <span className="gd-row">
                <button type="button" className="btn sm primary" onClick={() => copy(serverUrl, 'Đã chép link /exec. Sang việc 2.')} disabled={!serverUrl}><Copy size={14} /> Chép link /exec</button>
                {serverUrl && <code className="gd-url">{serverUrl}</code>}
              </span>
            </li>
            <li>
              <b>Mở Vercel.</b> Bấm nút bên dưới (mở ở thẻ mới). Trong danh sách dự án, bấm vào dự án tên <Key>quickplay</Key>.
              <span className="gd-row"><a className="btn sm" href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Mở Vercel</a></span>
            </li>
            <li><b>Mở trang biến môi trường.</b> Ở cột bên trái, bấm <Key>Environment Variables</Key>.</li>
            <li><b>Thêm biến mới.</b> Bấm nút <Key>Add Environment Variable</Key> (có bản ghi là <Key>Add New</Key> hoặc <Key>Create new</Key>).</li>
            <li>
              <b>Điền hai ô rồi lưu.</b>
              <div className="gd-form" role="group" aria-label="Mẫu điền trên Vercel">
                <div>
                  <small>Ô <b>Key</b> (tên biến): dán vào đây</small>
                  <span className="gd-field"><code>VITE_ADMIN_URL</code><button type="button" className="btn sm" onClick={() => copy('VITE_ADMIN_URL', 'Đã chép tên biến. Dán vào ô Key.')}><Copy size={14} /> Chép</button></span>
                </div>
                <div>
                  <small>Ô <b>Value</b> (giá trị): dán vào đây</small>
                  <span className="gd-field"><code>{serverUrl ? serverUrl.replace('https://script.google.com', '…') : 'link /exec của máy chủ tài khoản'}</code><button type="button" className="btn sm" onClick={() => copy(serverUrl, 'Đã chép link /exec. Dán vào ô Value.')} disabled={!serverUrl}><Copy size={14} /> Chép</button></span>
                </div>
                <div>
                  <small>Mục <b>Environments</b></small>
                  <span className="gd-field"><span>Để nguyên như Vercel chọn sẵn (<Key>All Environments</Key> hoặc có tích <Key>Production</Key>).</span></span>
                </div>
              </div>
              Xong bấm nút <Key go>Save</Key>.
            </li>
            <li>
              <b>Dựng lại trang web</b> để biến có hiệu lực. Ở cột bên trái bấm <Key>Deployments</Key> → ở dòng trên cùng (có chữ <Key>Current</Key>) bấm dấu <Key>⋯</Key> ở cuối dòng → chọn <Key>Redeploy</Key> → bấm <Key go>Redeploy</Key> lần nữa để xác nhận.
            </li>
            <li>
              <b>Chờ và kiểm tra.</b> Chờ khoảng 1 phút tới khi cột Status ghi <Key>Ready</Key>, quay lại trang này rồi bấm nút bên dưới. Bước 4 chuyển sang màu xanh là xong.
              <span className="gd-row"><button type="button" className="btn sm success" onClick={() => location.reload()}><RefreshCw size={14} /> Tôi đã làm xong, kiểm tra lại</button></span>
            </li>
          </ol>
        </>
      ),
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
        <button type="button" className="btn sm ghost gd-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{open ? 'Thu gọn' : 'Mở hướng dẫn'}</button>
      </header>

      {open && <ol className="gd-track" role="tablist" aria-label="Các bước">
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
      </ol>}

      {open && <div className={`gd-panel ${state(sel)}`} role="tabpanel">
        <div className="gd-panel-head">
          <span className="gd-step">Bước {sel}</span>
          <h3>{cur.title}</h3>
          {state(sel) === 'done' && <span className="badge green"><Check size={12} /> Đã xong</span>}
          {state(sel) === 'now' && <span className="badge blue">Đang làm</span>}
          {cur.time && <span className="gd-time">{cur.time}</span>}
        </div>
        {cur.raw ? cur.body : <ul className="gd-lines">{cur.body}</ul>}
        {cur.actions && <div className="gd-actions">{cur.actions}</div>}
        <div className="gd-nav">
          <button type="button" className="btn sm ghost" onClick={() => setSel(sel - 1)} disabled={sel === 1}><ChevronLeft size={16} /> Bước trước</button>
          <button type="button" className="btn sm ghost" onClick={() => setSel(sel + 1)} disabled={sel === 6}>Bước sau <ChevronRight size={16} /></button>
        </div>
      </div>}
    </section>
  );
}
