import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { PaperLiveNotice } from './components/PaperLiveNotice';
import { HashRouter, NavLink, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, BarChart3, Settings as SettingsIcon, Cloud, HardDrive, ScanLine, LogOut, UserRound, Monitor, Tablet, Smartphone } from 'lucide-react';
import { LightboxProvider, Spinner, ToastProvider, askConfirm, useToast } from './components/ui';
import { loadSettings } from './lib/settings';
import { DriveFullBanner } from './components/BackupTools';
import { ScriptUpdateNotice, ServerVersionInfo } from './components/ScriptUpdate';
import { TopbarClock } from './components/TopbarClock';
import { MusicButton } from './components/MusicButton';
import { accountRequired, checkSession, currentAccount, logout } from './lib/account';
import { Wordmark } from './components/Logo';
import './devices.css';
import { AppFooter } from './components/AppFooter';
import { Home } from './pages/Home';
import { Join } from './pages/Join';

// Tách gói: học sinh chỉ tải phần làm bài; giáo viên mới tải trình soạn thảo
const Library = lazy(() => import('./pages/Library'));
const Editor = lazy(() => import('./pages/Editor'));
const HostLive = lazy(() => import('./pages/HostLive'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const Play = lazy(() => import('./pages/Play'));
const Demo = lazy(() => import('./pages/Demo'));
const Paper = lazy(() => import('./pages/Paper'));
const PaperHost = lazy(() => import('./pages/PaperHost'));
const PaperScan = lazy(() => import('./pages/PaperScan'));
const Preview = lazy(() => import('./pages/Preview'));
const Login = lazy(() => import('./pages/Login'));
const Admin = lazy(() => import('./pages/Admin'));
const DevicePreview = lazy(() => import('./pages/DevicePreview'));

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Quickplay – Trang chủ">
      <Wordmark />
    </Link>
  );
}

/** Khu giáo viên: có máy chủ tài khoản thì bắt buộc đăng nhập bằng tài khoản quản trị cấp. */
/** Ba nút nổi ở góc dưới trái (chỉ khi lập trình trên máy): mở trang đang xem trong khung Máy tính / Máy tính bảng / Điện thoại. */
function DeviceLauncher() {
  const loc = useLocation();
  if (!import.meta.env.DEV || window.self !== window.top || loc.pathname === '/devices') return null;
  const to = (d: string) => `/devices?d=${d}&p=${encodeURIComponent(loc.pathname + loc.search)}`;
  return (
    <nav className="dv-launch" aria-label="Xem thử theo thiết bị">
      <Link to={to('desktop')} title="Xem thử trên máy tính" aria-label="Xem thử trên máy tính"><Monitor size={18} /></Link>
      <Link to={to('tablet')} title="Xem thử trên máy tính bảng" aria-label="Xem thử trên máy tính bảng"><Tablet size={18} /></Link>
      <Link to={to('phone')} title="Xem thử trên điện thoại" aria-label="Xem thử trên điện thoại"><Smartphone size={18} /></Link>
    </nav>
  );
}

function RequireTeacher({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const need = accountRequired();
  const acc = currentAccount();
  useEffect(() => {
    if (!need || !acc) return;
    let live = true;
    // Tài khoản bị khóa hoặc phiên hết hạn → đăng xuất
    checkSession().then((ok) => {
      if (live && !ok) {
        logout();
        nav('/teacher/login', { replace: true });
      }
    });
    return () => {
      live = false;
    };
  }, [need, acc?.token]); // eslint-disable-line react-hooks/exhaustive-deps
  if (need && !acc) return <Navigate to="/teacher/login" replace />;
  return <>{children}</>;
}

function AccountChip() {
  const nav = useNavigate();
  const acc = currentAccount();
  if (!acc) return null;
  return (
    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
      <span className="badge blue" title={`Tài khoản: ${acc.username}`}><UserRound size={14} /> {acc.name}</span>
      <button className="btn sm ghost" title="Đăng xuất" aria-label="Đăng xuất" onClick={async () => { if (await askConfirm('Đăng xuất khỏi trình duyệt này? Lần sau cần nhập lại tài khoản và mật khẩu.')) { logout(); nav('/login?chon=1', { replace: true }); } }}>
        <LogOut size={16} /> <span className="acc-out">Đăng xuất</span>
      </button>
    </span>
  );
}

/** Drive chặn chia sẻ ảnh → ảnh được lưu kèm trong bộ đề: báo một lần mỗi phiên làm việc. */
function MediaInlineNotice() {
  const toast = useToast();
  useEffect(() => {
    const on = () => {
      if (sessionStorage.getItem('quickplay.inlineNoted')) return;
      try { sessionStorage.setItem('quickplay.inlineNoted', '1'); } catch { /* bỏ qua */ }
      toast('Google Drive không cho chia sẻ ảnh bằng link, nên ảnh đã được nén nhỏ và lưu kèm trong bộ đề. Ảnh vẫn hiện bình thường với học sinh.', 'info');
    };
    window.addEventListener('quickplay-media-inline', on);
    return () => window.removeEventListener('quickplay-media-inline', on);
  }, [toast]);
  return null;
}

function TeacherShell({ children }: { children: ReactNode }) {
  const s = loadSettings();
  return (
    <>
      <header className="topbar">
        <Brand />
        <span className={`badge ${s.backend === 'drive' ? 'green' : 'amber'}`} title={s.backend === 'drive' ? 'Dữ liệu lưu trên Google Drive' : 'Dữ liệu chỉ lưu trong trình duyệt này'}>
          {s.backend === 'drive' ? <Cloud size={14} /> : <HardDrive size={14} />} {s.backend === 'drive' ? 'Google Drive' : 'Máy này'}
        </span>
        <ServerVersionInfo />
        <TopbarClock />
        <nav className="topnav" aria-label="Điều hướng giáo viên">
          <NavLink to="/teacher" end><BookOpen size={18} /> Thư viện</NavLink>
          <NavLink to="/teacher/paper" aria-label="Dạy học trên lớp"><ScanLine size={18} /> <span className="nav-long">Dạy học trên lớp</span><span className="nav-short" aria-hidden>Trên lớp</span></NavLink>
          <NavLink to="/teacher/reports"><BarChart3 size={18} /> Báo cáo</NavLink>
          <NavLink to="/teacher/settings"><SettingsIcon size={18} /> Cài đặt</NavLink>
        </nav>
        <MusicButton scope="teacher" className="btn sm ghost topbar-music" />
        <AccountChip />
      </header>
      <main className="page"><MediaInlineNotice /><ScriptUpdateNotice /><DriveFullBanner /><PaperLiveNotice />{children}</main>
      <AppFooter />
    </>
  );
}

export function App() {
  return (
    <ToastProvider>
      <LightboxProvider>
        <HashRouter>
          <DeviceLauncher />
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/join" element={<Join />} />
              <Route path="/demo" element={<Demo />} />
              <Route path="/play/:pin" element={<Play />} />
              <Route path="/teacher" element={<RequireTeacher><TeacherShell><Library /></TeacherShell></RequireTeacher>} />
              <Route path="/teacher/edit/:id" element={<RequireTeacher><TeacherShell><Editor /></TeacherShell></RequireTeacher>} />
              <Route path="/teacher/reports" element={<RequireTeacher><TeacherShell><Reports /></TeacherShell></RequireTeacher>} />
              <Route path="/teacher/settings" element={<RequireTeacher><TeacherShell><Settings /></TeacherShell></RequireTeacher>} />
              <Route path="/teacher/host/:pin" element={<RequireTeacher><HostLive /></RequireTeacher>} />
              <Route path="/teacher/paper" element={<RequireTeacher><TeacherShell><Paper /></TeacherShell></RequireTeacher>} />
              <Route path="/teacher/paper/:pin" element={<RequireTeacher><PaperHost /></RequireTeacher>} />
              <Route path="/scan" element={<PaperScan />} />
              <Route path="/teacher/preview/:id" element={<RequireTeacher><Preview /></RequireTeacher>} />
              <Route path="/login" element={<Login />} />
              <Route path="/devices" element={<DevicePreview />} />
              <Route path="/teacher/login" element={<Login role="teacher" />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </Suspense>
        </HashRouter>
      </LightboxProvider>
    </ToastProvider>
  );
}
