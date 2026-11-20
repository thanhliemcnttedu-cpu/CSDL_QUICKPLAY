// Huy hiệu trạng thái đồng bộ trên thanh đầu (chỉ hiện khi lưu trên Google Drive):
// đã đồng bộ / đang chờ đẩy lên Drive / ngoại tuyến / có lỗi. Báo khi có bản sao xung đột.
import { useEffect, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { loadSettings } from '../lib/settings';
import * as sync from '../lib/offlineSync';
import { useToast } from './ui';

export function SyncBadge() {
  const toast = useToast();
  const [st, setSt] = useState<sync.SyncStatus & { online: boolean }>({ pending: 0, lastConflicts: 0, offline: false, online: true });

  useEffect(() => {
    let live = true;
    const refresh = async () => {
      const s = await sync.status();
      if (live) setSt({ ...s, online: navigator.onLine });
    };
    const onSync = (e: Event) => {
      void refresh();
      const d = (e as CustomEvent<Partial<sync.SyncResult> | undefined>).detail;
      if (d?.conflicts) {
        toast(`Có ${d.conflicts} mục bị sửa cả trên máy lẫn trên Drive. Bản mới hơn được giữ, bản còn lại đã lưu thành bản sao "(xung đột …)".`, 'info');
      }
    };
    void refresh();
    window.addEventListener(sync.SYNC_EVENT, onSync);
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    const timer = window.setInterval(refresh, 15000);
    return () => {
      live = false;
      window.removeEventListener(sync.SYNC_EVENT, onSync);
      window.removeEventListener('online', refresh);
      window.removeEventListener('offline', refresh);
      window.clearInterval(timer);
    };
  }, [toast]);

  if (loadSettings().backend !== 'drive') return null;

  if (!st.online) {
    return (
      <span className="badge amber" title="Không có mạng. Mọi thay đổi vẫn được lưu trên máy và sẽ tự đẩy lên Drive khi có mạng.">
        <CloudOff size={14} /> Ngoại tuyến{st.pending ? ` · chờ đẩy ${st.pending}` : ''}
      </span>
    );
  }
  if (st.offline) {
    return (
      <span className="badge amber" title="Chưa kết nối được Google Drive. Dữ liệu vẫn dùng bản trên máy và sẽ đồng bộ khi kết nối lại.">
        <CloudOff size={14} /> Chưa kết nối Drive{st.pending ? ` · chờ ${st.pending}` : ''}
      </span>
    );
  }
  if (st.lastError) {
    return (
      <span className="badge red" title={`Lỗi đồng bộ: ${st.lastError}. Mục chưa đẩy được vẫn giữ trên máy và sẽ thử lại.`}>
        <TriangleAlert size={14} /> Lỗi đồng bộ{st.pending ? ` · chờ ${st.pending}` : ''}
      </span>
    );
  }
  if (st.pending) {
    return (
      <span className="badge amber" title="Thay đổi đã lưu trên máy, đang chờ đẩy lên Google Drive.">
        <RefreshCw size={14} /> Chờ đẩy {st.pending}
      </span>
    );
  }
  return (
    <span className="badge green" title={st.lastAt ? `Đồng bộ lúc ${new Date(st.lastAt).toLocaleTimeString('vi-VN')}` : 'Đã đồng bộ với Google Drive'}>
      <Cloud size={14} /> Đã đồng bộ
    </span>
  );
}
