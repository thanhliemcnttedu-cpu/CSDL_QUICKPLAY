// Cấu hình kết nối lưu tại máy (localStorage). Không bao giờ gửi các khóa này cho học sinh.
export interface AppSettings {
  backend: 'local' | 'drive';
  scriptUrl: string; // URL Web App Apps Script (kết thúc bằng /exec)
  teacherKey: string;
  folderUrl: string; // link thư mục Google Drive riêng của giáo viên (nơi Apps Script lưu dữ liệu)
  geminiKey: string; // chỉ dùng ở chế độ cục bộ; chế độ Drive dùng khóa lưu trong Apps Script
  geminiModel: string;
}

const KEY = 'quizzi.settings.v1';
const DEFAULTS: AppSettings = {
  backend: 'local',
  scriptUrl: '',
  teacherKey: '',
  folderUrl: '',
  geminiKey: '',
  geminiModel: 'gemini-2.0-flash',
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    // Cho phép cấu hình sẵn URL Apps Script qua biến môi trường khi build (Vercel)
    const envUrl = import.meta.env?.VITE_SCRIPT_URL as string | undefined;
    if (!raw && envUrl) {
      s.scriptUrl = envUrl;
      s.backend = 'drive';
    }
    return s;
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: AppSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* bộ nhớ trình duyệt bị chặn – bỏ qua */
  }
}

/** URL Apps Script có thể đi kèm link tham gia (?s=...) để học sinh không cần cấu hình. */
export function scriptUrlFromLink(): string | null {
  const m = location.hash.match(/[?&]s=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export const isDesktop = () => !!(window as unknown as { quizziDesktop?: unknown }).quizziDesktop;
