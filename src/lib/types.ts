// Lược đồ dữ liệu chuẩn (SRS v2.0 – mục 5). Dùng chung cho giao diện, Apps Script và bộ tách đề AI.

export type QuestionType =
  | 'single_choice'
  | 'multiple_select'
  | 'true_false'
  | 'fill_blank'
  | 'drag_drop'
  | 'reorder'
  | 'matching'
  | 'oral'; // trả lời miệng – giáo viên chấm Đúng/Sai khi chơi

export interface VideoMedia {
  source_type: 'internet_url' | 'uploaded_file';
  url: string;
  provider?: 'youtube' | 'vimeo' | 'file';
  embed_id?: string;
  duration_seconds?: number; // < 60 với tệp tải lên
  file_size_bytes?: number; // < 314572800 (300 MB)
  start_time?: number;
  end_time?: number;
}

export interface Stem {
  text: string; // HTML đã làm sạch (đậm, nghiêng, gạch chân, sup/sub, danh sách, link)
  hyperlink?: string;
  image_url?: string;
  image_alt?: string;
  audio_url?: string;
  video?: VideoMedia;
}

export interface Option {
  option_id: string;
  text: string;
  image_url?: string;
  is_correct?: boolean; // single/multiple/true_false
  order_index?: number; // reorder: vị trí đúng
  match_pair_id?: string; // matching: id cặp; drag_drop: id ô trống đúng (rỗng = thẻ nhiễu)
  side?: 'left' | 'right'; // matching
}

export interface Blank {
  blank_id: string; // "blank_1" ứng với [blank_1] trong stem.text
  accepted: string[];
  match_rule: 'exact' | 'ignore_case';
  ignore_accents?: boolean; // chấp nhận khi học sinh gõ không dấu (Ha Noi = Hà Nội)
}

export interface Question {
  id: string;
  type: QuestionType;
  time_limit_seconds: number;
  points: number;
  stem: Stem;
  options: Option[];
  blanks?: Blank[]; // fill_blank
  distractors?: string[]; // fill_blank: từ gây nhiễu → học sinh chọn từ kho từ thay vì gõ
  fill_mode?: 'type' | 'bank' | 'menu'; // fill_blank: gõ chữ / chọn từ kho từ / chọn từ menu thả xuống tại chỗ trống (mặc định: có từ nhiễu thì 'bank', không thì 'type')
  scoring?: 'all_or_nothing' | 'partial'; // multiple_select, matching, drag_drop
  explanation?: string; // đáp án / lời giải của giáo viên
  explanation_image?: string;
  subject?: string; // môn học
  lesson?: string; // bài học
  coins?: number; // (cũ, không còn dùng) xu thưởng do giáo viên đặt cho câu
  needs_review?: boolean; // AI không tìm thấy đáp án đúng -> cảnh báo vàng
  plain_options?: boolean; // một đáp án: ô đáp án nền trắng, không tô màu (dùng cho câu hỏi về màu sắc để màu ô không gây nhầm)
}

export interface Quiz {
  id: string;
  title: string;
  subject?: string; // tên môn dạng chữ (cập nhật theo danh mục khi gán)
  subject_id?: string; // vị trí trong danh mục: môn
  chapter_id?: string; // chương / chủ đề
  lesson_id?: string; // bài
  grade?: string;
  description?: string;
  cover_url?: string;
  questions: Question[];
  visibility: 'private' | 'public';
  paper_period?: ExamPeriod; // đề thi: thời điểm kiểm tra (thường xuyên, giữa kì, cuối kì)
  paper_code?: string; // đề thi: mã đề (VD TIN3-CK1-01)
  created_at: string;
  updated_at: string;
  owner?: string;
}

export type QuizSummary = Pick<Quiz, 'id' | 'title' | 'subject' | 'subject_id' | 'chapter_id' | 'lesson_id' | 'grade' | 'visibility' | 'updated_at' | 'cover_url' | 'paper_period' | 'paper_code'> & {
  question_count: number;
};

// ---------- Danh mục: Môn học → Chương/Chủ đề → Bài ----------
export interface CatalogLesson { id: string; name: string }
export interface CatalogChapter { id: string; name: string; lessons: CatalogLesson[] }
/** `grade`: khối lớp chứa môn này (VD "Lớp 1"); môn cũ chưa xếp lớp thì bỏ trống */
export interface CatalogSubject { id: string; name: string; chapters: CatalogChapter[]; grade?: string }
/** `grades`: danh sách khối lớp theo thứ tự hiển thị (kể cả lớp chưa có môn); bỏ trống = Lớp 1 … Lớp 5 */
export interface Catalog { subjects: CatalogSubject[]; grades?: string[]; updated_at?: string }

// ---------- Phiên tổ chức ----------
export type SessionMode = 'classic_live' | 'instructor_paced' | 'homework' | 'paper' | 'exam'; // paper = chế độ giấy (quét thẻ); exam = bài kiểm tra theo danh sách lớp
export type SessionState = 'LOBBY_WAITING' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED';

export interface AntiCheatSettings {
  enabled: boolean;
  block_right_click: boolean; // chặn chuột phải (và Google Lens qua menu chuột phải)
  block_copy: boolean; // chặn sao chép/dán/bôi đen và phím tắt
  detect_leave: boolean; // phát hiện chuyển tab, chuyển cửa sổ, chụp màn hình (Win+Shift+S), mở ChatGPT…
  require_fullscreen: boolean; // bắt buộc làm bài ở chế độ toàn màn hình
  max_violations: number; // ngưỡng: được vi phạm tối đa N lần (chỉ cảnh báo); lần thứ N+1 khóa lượt chơi. 0 = không bao giờ khóa
}

export interface SessionSettings {
  mode: SessionMode;
  music: boolean;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  show_leaderboard: boolean;
  leaderboard_top?: number; // số bạn hiển thị trên bảng xếp hạng và được tặng cúp (3/5/10/15; 0 = tất cả)
  navigation?: 'sequential' | 'free'; // làm lần lượt từng câu (mặc định) hoặc tự do chọn câu (có bảng số câu, không tính giờ từng câu)
  auto_next?: boolean; // trực tiếp tự do, bài về nhà: tự sang câu sau khi hiện kết quả (mặc định có); tắt = học sinh bấm "Câu tiếp theo"
  require_all?: boolean; // tự do chọn câu: phải trả lời hết mới được nộp bài
  retry_rounds?: number; // 0–20 (giáo viên tự điền): số LƯỢT làm lại các câu sai của cả bài (trực tiếp tự do, bài về nhà). Giáo viên điều khiển: không có làm lại
  power_ups: boolean;
  start_time?: string; // homework
  deadline?: string; // homework: hạn nộp; exam: giờ thu bài (máy chủ đặt khi giáo viên bấm Bắt đầu)
  exam_class_id?: string; // exam: lớp được giao bài kiểm tra
  exam_minutes?: number; // exam: thời gian làm bài (phút)
  exam_layout?: 'one' | 'page'; // exam: từng câu một như trò chơi (mặc định) hoặc cả bài trên một trang cuộn như đề giấy
  exam_review?: 'none' | 'end' | 'submit'; // exam: học sinh xem lại bài (đúng/sai, đáp án, lời giải): không cho / khi thầy cô thu bài / ngay khi nộp
  anti_cheat?: AntiCheatSettings;
}

export type ViolationKind =
  | 'tab_hidden'
  | 'window_blur'
  | 'exit_fullscreen'
  | 'right_click'
  | 'copy_paste'
  | 'screenshot_key'
  | 'devtools'
  | 'shortcut'
  | 'split_screen'
  | 'open_link'; // mở link tham khảo của đề – chỉ ghi nhận, không tính vi phạm

export interface Violation {
  player_id: string;
  name: string;
  kind: ViolationKind;
  detail?: string;
  q_index?: number;
  at: number;
}

export interface Player {
  player_id: string;
  name: string;
  class_name?: string; // lớp của học sinh (bắt buộc khi vào phòng trực tuyến)
  student_code?: string; // exam: mã số học sinh trong danh sách lớp
  paper?: number; // exam nhiều đề: em làm đề thứ mấy trong session.papers
  avatar: string;
  score: number;
  correct: number;
  answered: number;
  current_index: number;
  finished: boolean;
  last_seen: number; // ms epoch
  attempt_no?: number; // lần làm bài thứ mấy của cùng học sinh (cùng tên + lớp) trong phòng này; không có = lần 1
  superseded?: boolean; // đã có lần làm mới hơn → ẩn khỏi bảng xếp hạng, vẫn giữ trong báo cáo
  joined_at?: number; // lúc vào phòng
  finished_at?: number; // lúc làm xong / nộp bài → tính thời gian làm cả bài
  kicked?: boolean;
  streak?: number;
  coins?: number; // tổng ĐIỂM THƯỞNG (thưởng tốc độ + thưởng chuỗi đúng); tên trường giữ nguyên để đọc được dữ liệu cũ
  violations?: number; // tổng số lần vi phạm (không tính open_link)
  violation_base?: number; // mốc khi giáo viên mở khóa – khóa lại khi violations - base >= max
  locked?: boolean; // bị khóa bài do vi phạm
}

export interface AnswerRecord {
  player_id: string;
  question_id: string;
  q_index: number;
  answer: unknown;
  correct: boolean;
  ratio: number; // 0..1 (chấm từng phần)
  score: number;
  coins?: number; // điểm thưởng nhận được ở câu này
  pending?: boolean; // trả lời miệng: chờ giáo viên chấm
  attempt?: number; // lượt làm lại (1–3) đã tạo ra câu trả lời này; không có = lần làm đầu
  change?: boolean; // giáo viên điều khiển: học sinh chọn lại đáp án khi câu còn mở (chỉ dùng khi gửi)
  time_ms: number;
  at: number;
}

/** Thời điểm kiểm tra của đề thi. */
export type ExamPeriod = 'tx' | 'gk1' | 'ck1' | 'gk2' | 'ck2';
/** Một đề trong phòng thi nhiều đề (học sinh được chia ngẫu nhiên, đều nhau giữa các đề). */
export interface SessionPaper { quiz_id: string; code: string; title: string }

export interface Session {
  session_id: string;
  pin: string; // 6 chữ số
  quiz_id: string;
  quiz_title: string;
  papers?: SessionPaper[]; // bài kiểm tra nhiều đề (Apps Script 1.5.7): đề đã bốc cho phòng này
  settings: SessionSettings;
  state: SessionState;
  created_at: number;
  started_at?: number;
  paused_at?: number;
  paused_total_ms?: number;
  ended_at?: number;
  current_index: number; // instructor_paced: câu đang mở
  question_opened_at?: number;
  question_locked?: boolean; // LOCKED_WAITING_HOST
  players: Player[];
  answers: AnswerRecord[];
  violations?: Violation[];
  question_count: number;
  paper?: PaperInfo; // chỉ có ở chế độ giấy
  exam?: ExamInfo; // chỉ có ở bài kiểm tra (không gửi cho học sinh)
}

/** Bài kiểm tra: lớp được giao và danh sách mã số học sinh được phép vào làm. */
export interface ExamInfo {
  class_id: string;
  class_name: string;
  roster: { code: string; name: string }[];
}

/** Lớp học dùng cho chế độ giấy: số thẻ = số thứ tự của học sinh trong danh sách. */
export interface ClassRoom {
  id: string;
  name: string;
  students: string[];
  codes?: string[]; // mã số học sinh do giáo viên đặt, cùng thứ tự với `students` (chuỗi rỗng = chưa đặt)
  updated_at: string;
}

export interface PaperInfo {
  class_name: string;
  scan_key: string; // khóa nằm trong mã QR để điện thoại quét thẻ không cần đăng nhập
  remind?: boolean; // đang hiện tên các em chưa giơ thẻ trên màn chiếu
  connected?: boolean; // điện thoại quét thẻ đã kết nối → màn chiếu chuyển sang câu hỏi
  reveal?: boolean; // giáo viên cho hiện kết quả câu hiện tại (tự hiện khi đủ cả lớp)
}

/** Trạng thái gọn trả về cho máy quét thẻ. */
export interface PaperView {
  state: SessionState;
  current_index: number;
  question_count: number;
  total: number; // sĩ số
  remind: boolean;
  reveal: boolean;
  answers: Record<number, number>; // số thẻ -> phương án đã chọn (0..3) ở câu hiện tại
}

// Gói dữ liệu gửi cho học sinh khi thăm dò (không chứa đáp án của người khác)
export interface PollResult {
  state: SessionState;
  mode: SessionMode;
  current_index: number;
  question_locked: boolean;
  question_opened_at?: number;
  started_at?: number;
  paused_at?: number;
  paused_total_ms?: number;
  server_now: number;
  deadline?: number; // exam: giờ thu bài (ms)
  players: Pick<Player, 'player_id' | 'name' | 'class_name' | 'avatar' | 'score' | 'correct' | 'answered' | 'finished' | 'current_index' | 'coins' | 'joined_at' | 'finished_at'>[];
  my_pending?: number[]; // các câu trả lời miệng của em đang chờ chấm
  my_graded?: Record<number, boolean>; // q_index -> kết quả giáo viên chấm (trả lời miệng)
  kicked?: boolean;
  locked?: boolean; // bài của em đang bị khóa do vi phạm
  my_violations?: number;
  question_stats?: Record<string, number>; // thống kê đáp án câu hiện tại (instructor_paced)
}
