import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Cloud, Mic, Sparkles, Shapes, MonitorSmartphone, FileText, ArrowRight, Gamepad2 } from 'lucide-react';
import { Brand } from '../App';
import { AppFooter } from '../components/AppFooter';
import { JoinShare } from '../components/JoinShare';

const FEATURES = [
  { ic: Shapes, t: '7 dạng câu hỏi', d: 'Một/nhiều đáp án, Đúng/Sai, điền chỗ trống, sắp xếp, nối cột, trả lời miệng.' },
  { ic: Mic, t: 'Soạn bằng giọng nói', d: 'Nói để nhập câu hỏi và từng đáp án; Ctrl+V dán ảnh chụp màn hình.' },
  { ic: Sparkles, t: 'AI sinh đề', d: 'Từ giáo án Word/PDF: sinh câu hỏi mới hoặc số hóa nguyên văn đề có sẵn.' },
  { ic: Cloud, t: 'Lưu trên Google Drive', d: 'Miễn phí, dữ liệu là tệp .json của chính thầy cô.' },
  { ic: MonitorSmartphone, t: 'Web + bản cài .exe', d: 'Dùng chung một kho dữ liệu trên mọi thiết bị.' },
  { ic: FileText, t: 'Báo cáo Excel', d: 'Bục vinh danh, thống kê từng câu và từng lớp, xuất Excel và PDF.' },
];

export function Home() {
  const nav = useNavigate();
  const [pin, setPin] = useState('');
  // Bấm "Vào phòng" luôn sang trang dành cho học sinh; đã gõ đủ 6 số thì mang mã theo để em không phải nhập lại
  const go = () => nav(/^\d{6}$/.test(pin) ? `/join?pin=${pin}` : '/join');
  return (
    <>
      <header className="topbar">
        <Brand />
        <nav className="topnav">
          <Link to="/login" className="btn primary">Dành cho giáo viên <ArrowRight size={18} /></Link>
        </nav>
      </header>
      <main className="page">
        <section className="hero">
          <div>
            <span className="badge blue">Miễn phí · Không quảng cáo</span>
            <h1 className="hero-title" aria-label="Trắc nghiệm tương tác – AI bứt phá – Quản lý trong tay">
              <span className="ht-main" aria-hidden>TRẮC NGHIỆM TƯƠNG TÁC</span>
              <span className="ht-sub" aria-hidden>AI BỨT PHÁ <i>•</i> QUẢN LÝ TRONG TAY</span>
            </h1>
            <p className="muted" style={{ fontSize: '1.15rem', maxWidth: 560 }}>
              Soạn đề trong vài phút, tổ chức thi trực tiếp trên lớp hoặc giao bài về nhà. Mọi dữ liệu lưu trên Google Drive của thầy cô.
            </p>
            <div className="row">
              <Link to="/teacher" className="btn primary lg">Bắt đầu soạn đề</Link>
              <Link to="/teacher/settings" className="btn ghost lg">Kết nối Google Drive</Link>
            </div>
            <Link to="/demo" className="card tight" style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 14, textDecoration: 'none', color: 'var(--fg)', maxWidth: 560, borderColor: '#9cc3ff' }}>
              <span className="btn success icon" aria-hidden style={{ flex: 'none', pointerEvents: 'none' }}><Gamepad2 size={22} /></span>
              <span className="grow">
                <b style={{ display: 'block' }}>Chơi thử tất cả dạng câu hỏi</b>
                <span className="muted small">Đủ các dạng câu hỏi. Không cần đăng nhập, bấm là chơi ngay.</span>
              </span>
              <ArrowRight size={20} aria-hidden />
            </Link>
          </div>
          <form
            className="join-box stack"
            onSubmit={(e) => {
              e.preventDefault();
              go();
            }}
          >
            <h2 style={{ margin: 0 }}>Học sinh vào phòng</h2>
            <label className="field">
              <span>Nhập mã PIN 6 số thầy cô giao (có thể nhập sau)</span>
              <input
                className="input"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                aria-label="Mã PIN"
              />
            </label>
            <button className="btn accent lg">Vào phòng</button>
            <JoinShare />
          </form>
        </section>
        <section className="feature-list" aria-label="Tính năng">
          {FEATURES.map(({ ic: Ic, t, d }) => (
            <div key={t} className="feature card tight">
              <span className="ic"><Ic size={22} /></span>
              <div>
                <h3 style={{ margin: 0 }}>{t}</h3>
                <p className="muted small" style={{ margin: 0 }}>{d}</p>
              </div>
            </div>
          ))}
        </section>
      </main>
      <AppFooter />
    </>
  );
}
