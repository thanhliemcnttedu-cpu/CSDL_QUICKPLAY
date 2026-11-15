// Cấu hình kết nối lưu tại máy (localStorage). Không bao giờ gửi các khóa này cho học sinh.
export interface AppSettings {
  backend: 'local' | 'drive';
  scriptUrl: string; // URL Web App Apps Script (kết thúc bằng /exec)
  teacherKey: string;
  folderUrl: string; // link thư mục Google Drive riêng của giáo viên (nơi Apps Script lưu dữ liệu)
  geminiKey: string; // khóa API Gemini của giáo viên, lưu trong trình duyệt này; có khóa thì gọi thẳng Gemini ở mọi chế độ lưu
  geminiModel: string;
}

const KEY = 'quizzi.settings.v1';
const DEFAULTS: AppSettings = {
  backend: 'local',
  scriptUrl: '',
  teacherKey: '',
  folderUrl: '',
  geminiKey: '',
  geminiModel: 'gemini-flash-latest', // khi lưu khóa, phần mềm tự chọn mô hình đang hoạt động
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
