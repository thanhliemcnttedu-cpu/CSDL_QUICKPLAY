// Xem thử giao diện theo thiết bị: mở chính phần mềm trong một khung có đúng kích thước màn hình máy tính,
// máy tính bảng hoặc điện thoại, để soát bố cục ở cả ba chế độ mà không cần đổi thiết bị.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Columns3, ExternalLink, Monitor, RefreshCw, RotateCw, Smartphone, Tablet } from 'lucide-react';
import '../devices.css';

type DeviceId = 'desktop' | 'tablet' | 'phone';
const DEVICES: Record<DeviceId, { name: string; w: number; h: number; icon: typeof Monitor }> = {
  desktop: { name: 'Máy tính', w: 1366, h: 768, icon: Monitor },
  tablet: { name: 'Máy tính bảng', w: 820, h: 1180, icon: Tablet },
  phone: { name: 'Điện thoại', w: 390, h: 844, icon: Smartphone },
};
const PAGES: [string, string][] = [
  ['/', 'Trang chủ'],
  ['/login', 'Đăng nhập (chọn vai trò)'],
  ['/join', 'Học sinh vào phòng'],
  ['/demo', 'Chơi thử các dạng câu hỏi'],
  ['/teacher', 'Giáo viên: thư viện'],
  ['/teacher/settings', 'Giáo viên: cài đặt'],
  ['/teacher/reports', 'Giáo viên: báo cáo'],
  ['/teacher/paper', 'Giáo viên: thẻ trả lời (giấy)'],
  ['/teacher/preview/builtin_tieng_viet_1', 'Chơi thử: Tiếng Việt 1'],
  ['/teacher/preview/builtin_tieng_anh_1', 'Chơi thử: Tiếng Anh 1'],
  ['/admin', 'Quản trị'],
];

/** Một khung thiết bị: iframe đúng kích thước thật, thu nhỏ cho vừa chỗ trống. */
function Frame({ id, landscape, src, nonce, fit }: { id: DeviceId; landscape: boolean; src: string; nonce: number; fit: { w: number; h: number } }) {
  const d = DEVICES[id];
  const turn = landscape && id !== 'desktop';
  const w = turn ? d.h : d.w;
  const h = turn ? d.w : d.h;
  const scale = Math.min(1, fit.w / w, fit.h / h);
  return (
    <figure className="dv-fig" style={{ width: w * scale + 10 }}>
      <figcaption><d.icon size={16} /> {d.name} · {w} × {h}{scale < 1 ? ` · thu nhỏ ${Math.round(scale * 100)}%` : ''}</figcaption>
      <div className={`dv-shell ${id}`} style={{ width: w * scale, height: h * scale }}>
        <iframe key={`${src}|${nonce}`} title={`Xem thử trên ${d.name}`} src={src} width={w} height={h} style={{ transform: `scale(${scale})` }} />
      </div>
    </figure>
  );
}

export default function DevicePreview() {
  const [params, setParams] = useSearchParams();
  // Thiết bị và trang đang xem lấy thẳng từ địa chỉ (?d=…&p=…) để chép link cho người khác vẫn mở đúng chế độ
  const asked = params.get('d');
  const device: DeviceId | 'all' = asked === 'phone' || asked === 'tablet' || asked === 'desktop' || asked === 'all' ? asked : 'phone';
  const path = params.get('p') || '/';
  const setDevice = (d: DeviceId | 'all') => setParams({ d, p: path }, { replace: true });
  const setPath = (p: string) => setParams({ d: device, p }, { replace: true });
  const [landscape, setLandscape] = useState(false);
  const [typed, setTyped] = useState(path);
  const [nonce, setNonce] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ w: 1000, h: 700 });

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setRoom({ w: el.clientWidth - 8, h: Math.max(360, window.innerHeight - el.getBoundingClientRect().top - 48) });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  useEffect(() => setTyped(path), [path]);

  const src = `${location.origin}${location.pathname}#${path.startsWith('/') ? path : '/' + path}`;
  const go = (p: string) => setPath(p.trim() ? (p.trim().startsWith('/') ? p.trim() : '/' + p.trim()) : '/');
  const all = device === 'all';
  // Xem cả ba: chia chỗ trống theo tỉ lệ chiều rộng của từng thiết bị
  const total = DEVICES.desktop.w + DEVICES.tablet.w + DEVICES.phone.w;
  // trừ khoảng hở giữa ba khung và viền khung (3 × 10px viền + 2 × 20px hở + dự phòng)
  const fitOf = (id: DeviceId) => (all ? { w: (Math.max(300, room.w - 90) * DEVICES[id].w) / total, h: room.h - 24 } : { w: room.w - 12, h: room.h });

  return (
    <div className="dv-page">
      <header className="dv-bar">
        <Link to="/" className="btn ghost sm"><ArrowLeft size={16} /> Trang chủ</Link>
        <b>Xem thử theo thiết bị</b>
        <div className="tabs" role="tablist" aria-label="Chọn thiết bị">
          {(Object.keys(DEVICES) as DeviceId[]).map((id) => {
            const Ic = DEVICES[id].icon;
            return <button key={id} type="button" role="tab" aria-selected={device === id} className={`tab ${device === id ? 'on' : ''}`} onClick={() => setDevice(id)}><Ic size={16} /> {DEVICES[id].name}</button>;
          })}
          <button type="button" role="tab" aria-selected={all} className={`tab ${all ? 'on' : ''}`} onClick={() => setDevice('all')}><Columns3 size={16} /> Cả ba</button>
        </div>
        <button type="button" className="btn sm" onClick={() => setLandscape((v) => !v)} aria-pressed={landscape} title="Xoay ngang / dọc (điện thoại, máy tính bảng)"><RotateCw size={16} /> {landscape ? 'Đang xoay ngang' : 'Xoay ngang'}</button>
        <button type="button" className="btn sm" onClick={() => setNonce((n) => n + 1)} title="Tải lại khung xem thử"><RefreshCw size={16} /> Tải lại</button>
        <a className="btn sm ghost" href={src} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Mở riêng</a>
      </header>
      <div className="dv-bar dv-pages">
        <label className="row" style={{ gap: 6 }}>Trang
          <select className="input" value={PAGES.some(([p]) => p === path) ? path : ''} onChange={(e) => e.target.value && go(e.target.value)} aria-label="Chọn trang để xem thử">
            {!PAGES.some(([p]) => p === path) && <option value="">(đường dẫn tự gõ)</option>}
            {PAGES.map(([p, t]) => <option key={p} value={p}>{t}</option>)}
          </select>
        </label>
        <form className="row grow" style={{ gap: 6, flexWrap: 'nowrap' }} onSubmit={(e) => { e.preventDefault(); go(typed); }}>
          <input className="input grow" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="/play/123456" aria-label="Đường dẫn trong phần mềm" spellCheck={false} />
          <button className="btn sm primary">Mở</button>
        </form>
        <small className="muted">Bấm, gõ trong khung như trên thiết bị thật. Khung chỉ thu nhỏ hình, bố cục vẫn đúng theo kích thước màn hình ghi ở trên.</small>
      </div>
      <div className={`dv-stage ${all ? 'all' : ''}`} ref={stage}>
        {all
          ? (Object.keys(DEVICES) as DeviceId[]).map((id) => <Frame key={id} id={id} landscape={landscape} src={src} nonce={nonce} fit={fitOf(id)} />)
          : <Frame id={device as DeviceId} landscape={landscape} src={src} nonce={nonce} fit={fitOf(device as DeviceId)} />}
      </div>
    </div>
  );
}
