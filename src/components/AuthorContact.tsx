// Liên hệ tác giả: thông tin liên lạc, số tài khoản, và một mã QR chuyển 100.000 đ (tạo trên máy).
import { useState } from 'react';
import { Check, Copy, MessageCircle, Phone, QrCode } from 'lucide-react';
import { Modal } from './ui';
import qrTacGia from '../assets/qr-tac-gia.png'; // nhập từ src: Vite đóng gói ảnh, chạy được cả khi mở từ file:// (bản cài Windows)
import './AuthorContact.css';

const AUTHOR = {
  name: 'Nguyễn Thanh Liêm',
  role: 'Giáo viên Tiểu học',
  school: 'Trường Tiểu học số 1 Tân Uyên',
  zalo: '0888358363',
  account: '0977058363',
  bank: 'BIDV – Chi nhánh Tân Uyên',
  holder: 'NGUYỄN THANH LIÊM',
};

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="ac-copy" aria-label={`Sao chép ${label}`} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1800); } catch { /* trình duyệt chặn bộ nhớ tạm */ }
    }}>{ok ? <Check size={16} /> : <Copy size={16} />}</button>
  );
}

export function AuthorContact({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Liên hệ tác giả" onClose={onClose} wide>
      <div className="ac">
        <div className="ac-info">
          <div className="ac-who">
            <b>{AUTHOR.name}</b>
            <span>{AUTHOR.role} · {AUTHOR.school}</span>
          </div>
          <div className="ac-row">
            <Phone size={18} />
            <div><small>Số điện thoại & Zalo</small><b>{AUTHOR.zalo}</b></div>
            <a className="ac-zalo" href={`https://zalo.me/${AUTHOR.zalo}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={16} /> Nhắn Zalo</a>
            <CopyBtn text={AUTHOR.zalo} label="số Zalo" />
          </div>
          <div className="ac-row">
            <QrCode size={18} />
            <div><small>Số tài khoản BIDV</small><b>{AUTHOR.account}</b><span className="ac-sub">{AUTHOR.holder} · {AUTHOR.bank}</span></div>
            <CopyBtn text={AUTHOR.account} label="số tài khoản" />
          </div>
          <p className="ac-note">Thầy cô liên hệ tác giả qua số điện thoại hoặc Zalo ở trên để sử dụng ứng dụng.</p>
          <p className="ac-note">Ủng hộ tác giả <b>Quick Play</b> để duy trì trang web và cấp tài khoản cho thầy cô. Xin trân trọng cảm ơn.</p>
        </div>
        <div className="ac-qr">
          <img src={qrTacGia} alt="Mã QR nhận tiền của tác giả" />
          <b>Chuyển khoản 100.000 đ</b>
          <span className="ac-sub">Quét bằng ứng dụng ngân hàng hoặc app VietQR</span>
        </div>
      </div>
    </Modal>
  );
}
