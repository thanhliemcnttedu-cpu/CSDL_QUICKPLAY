// Máy chủ tài khoản THỬ chạy trên máy lập trình (http://localhost:5181) để thử đăng nhập mà chưa cần Google.
// Dữ liệu chỉ nằm trong bộ nhớ, mất khi tắt. Khóa quản trị được in ra màn hình khi khởi động.
const http = require('http');
const { createAdmin } = require('./gas-harness.cjs');

const admin = createAdmin({ folderId: process.env.MOCK_FOLDER_ID || '1MockFolderForLocalTesting0000000' });
admin.store.set('ADMIN_KEY', process.env.MOCK_ADMIN_KEY || 'dev-admin-key'); // khóa cố định cho máy chủ thử
admin.adminKey = admin.store.get('ADMIN_KEY');
const port = Number(process.env.PORT || 5181);
http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.end();
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      try {
        const before = admin.mails.length;
        res.end(JSON.stringify(req.method === 'POST' ? admin.post(JSON.parse(body || '{}')) : { ok: true, data: { name: 'QUICKPLAY-ACCOUNTS-MOCK' } }));
        // máy chủ thử không gửi thư thật: in thư ra màn hình để người lập trình lấy mã
        admin.mails.slice(before).forEach((m) => console.log(`[THƯ GỬI TỚI ${m.to}] ${m.subject}\n${m.body}`));
      } catch (e) {
        res.end(JSON.stringify({ ok: false, error: String(e && e.message) }));
      }
    });
  })
  .listen(port, () => console.log(`Mock tài khoản: http://localhost:${port}  ADMIN_KEY=${admin.adminKey}`));
