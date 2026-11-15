import type { Option, Question, QuestionType, Quiz } from './types';
import { uid } from './util';
import { emptyDraft, toQuestion, type Draft } from './draft';

export const TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: 'Một đáp án',
  multiple_select: 'Nhiều đáp án',
  true_false: 'Đúng / Sai',
  fill_blank: 'Điền chỗ trống',
  drag_drop: 'Kéo thả vào ô trống',
  reorder: 'Sắp xếp',
  matching: 'Nối cột',
  oral: 'Trả lời miệng',
};

/** 7 dạng câu hỏi của trình soạn (đúng thứ tự các tab). drag_drop chỉ còn để đọc đề cũ. */
export const COMPOSER_TYPES: QuestionType[] = ['single_choice', 'multiple_select', 'true_false', 'fill_blank', 'reorder', 'matching', 'oral'];

export const TYPE_HINTS: Record<QuestionType, string> = {
  single_choice: 'Học sinh chạm chọn 1 phương án.',
  multiple_select: 'Học sinh tích nhiều ô rồi bấm Gửi.',
  true_false: 'Bấm nhanh Đúng hoặc Sai.',
  fill_blank: 'Gõ từ, hoặc chọn từ trong kho từ (khi có từ gây nhiễu).',
  drag_drop: 'Kéo thẻ vào đúng ô trống.',
  reorder: 'Sắp lại các bước theo đúng thứ tự.',
  matching: 'Nối mỗi ô cột A với ô cột B.',
  oral: 'Học sinh trả lời bằng lời, giáo viên chấm Đúng / Sai.',
};

export const SUBJECTS = [
  'Toán học', 'Tiếng Việt', 'Ngữ văn', 'Tiếng Anh', 'Khoa học', 'Khoa học tự nhiên', 'Tự nhiên và Xã hội',
  'Lịch sử và Địa lí', 'Đạo đức', 'Giáo dục công dân', 'Tin học', 'Công nghệ', 'Âm nhạc', 'Mĩ thuật',
  'Giáo dục thể chất', 'Hoạt động trải nghiệm', 'Khác',
];

export const opt = (text = '', extra: Partial<Option> = {}): Option => ({ option_id: uid('o'), text, ...extra });

export function newQuestion(type: QuestionType): Question {
  const base: Question = {
    id: uid('q'),
    type,
    time_limit_seconds: type === 'true_false' ? 20 : 30,
    points: 1000,
    stem: { text: '' },
    options: [],
    coins: 2,
  };
  switch (type) {
    case 'oral':
      base.time_limit_seconds = 60;
      break;
    case 'single_choice':
      base.options = [opt('', { is_correct: true }), opt(), opt(), opt()];
      break;
    case 'multiple_select':
      base.options = [opt('', { is_correct: true }), opt('', { is_correct: true }), opt(), opt()];
      base.scoring = 'partial';
      break;
    case 'true_false':
      base.options = [opt('Đúng', { is_correct: true }), opt('Sai', { is_correct: false })];
      break;
    case 'fill_blank':
      base.stem.text = 'Thủ đô của Việt Nam là [blank_1].';
      base.blanks = [{ blank_id: 'blank_1', accepted: ['Hà Nội'], match_rule: 'ignore_case' }];
      base.time_limit_seconds = 45;
      break;
    case 'drag_drop':
      base.stem.text = 'Nước sôi ở [blank_1] độ C và đóng băng ở [blank_2] độ C.';
      base.blanks = [
        { blank_id: 'blank_1', accepted: [], match_rule: 'exact' },
        { blank_id: 'blank_2', accepted: [], match_rule: 'exact' },
      ];
      base.options = [opt('100', { match_pair_id: 'blank_1' }), opt('0', { match_pair_id: 'blank_2' }), opt('50')];
      base.scoring = 'partial';
      base.time_limit_seconds = 45;
      break;
    case 'reorder':
      base.options = [opt('', { order_index: 0 }), opt('', { order_index: 1 }), opt('', { order_index: 2 })];
      base.scoring = 'all_or_nothing';
      base.time_limit_seconds = 45;
      break;
    case 'matching': {
      const pairs = [uid('p'), uid('p'), uid('p')];
      base.options = [
        ...pairs.map((p) => opt('', { side: 'left', match_pair_id: p })),
        ...pairs.map((p) => opt('', { side: 'right', match_pair_id: p })),
      ];
      base.scoring = 'partial';
      base.time_limit_seconds = 60;
      break;
    }
  }
  return base;
}

export function newQuiz(title = 'Bộ câu hỏi mới'): Quiz {
  const now = new Date().toISOString();
  return { id: uid('quiz_'), title, questions: [], visibility: 'private', created_at: now, updated_at: now };
}

/** Bộ đề mẫu để giáo viên thử ngay lần đầu mở ứng dụng. */
export function sampleQuiz(): Quiz {
  const q = newQuiz('Mẫu: Khoa học lớp 4 – Nước và không khí');
  q.subject = 'Khoa học';
  q.grade = 'Lớp 4';
  const q1 = newQuestion('single_choice');
  q1.stem.text = 'Nước tồn tại ở mấy thể chính?';
  q1.options = [opt('1 thể'), opt('2 thể'), opt('3 thể', { is_correct: true }), opt('4 thể')];
  const q2 = newQuestion('true_false');
  q2.stem.text = 'Không khí <b>không có</b> màu, không có mùi, không có vị.';
  const q3 = newQuestion('multiple_select');
  q3.stem.text = 'Những việc nào giúp <u>tiết kiệm nước</u>?';
  q3.options = [
    opt('Khóa vòi khi đánh răng', { is_correct: true }),
    opt('Tưới cây bằng nước vo gạo', { is_correct: true }),
    opt('Để vòi chảy khi rửa bát'),
    opt('Tắm thật lâu dưới vòi sen'),
  ];
  const q4 = newQuestion('fill_blank');
  q4.stem.text = 'Nước sôi ở [blank_1] °C (ở áp suất thường).';
  q4.blanks = [{ blank_id: 'blank_1', accepted: ['100', 'một trăm'], match_rule: 'ignore_case' }];
  const q5 = newQuestion('fill_blank');
  q5.stem.text = 'Nước sôi ở [blank_1] độ C và đóng băng ở [blank_2] độ C.';
  q5.blanks = [
    { blank_id: 'blank_1', accepted: ['100'], match_rule: 'ignore_case' },
    { blank_id: 'blank_2', accepted: ['0'], match_rule: 'ignore_case' },
  ];
  q5.distractors = ['50', '37'];
  q5.scoring = 'partial';
  const q8 = newQuestion('oral');
  q8.stem.text = 'Em hãy nêu 2 việc làm giúp giữ sạch nguồn nước ở gia đình em.';
  q8.explanation = 'Không xả rác xuống ao hồ; đậy kín bể nước; dùng xong khóa vòi…';
  const q6 = newQuestion('reorder');
  q6.stem.text = 'Sắp xếp các giai đoạn của vòng tuần hoàn nước:';
  q6.options = [opt('Nước bay hơi', { order_index: 0 }), opt('Hơi nước ngưng tụ thành mây', { order_index: 1 }), opt('Mưa rơi xuống', { order_index: 2 })];
  const q7 = newQuestion('matching');
  q7.stem.text = 'Nối thể của nước với ví dụ phù hợp:';
  const [l1, l2, l3, r1, r2, r3] = q7.options;
  l1.text = 'Thể rắn'; r1.text = 'Nước đá';
  l2.text = 'Thể lỏng'; r2.text = 'Nước mưa';
  l3.text = 'Thể khí'; r3.text = 'Hơi nước';
  q.questions = [q1, q2, q3, q4, q5, q6, q7, q8].map((x) => ({ ...x, subject: 'Khoa học', lesson: 'Nước và không khí' }));
  return q;
}

// ---------------- Bộ câu hỏi mặc định "Trải nghiệm Quickplay" (trang /demo) ----------------
const svgUrl = (svg: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

/** Hình tự vẽ: một hình vuông chia 4 phần bằng nhau, tô màu 1 phần. */
const DEMO_FRACTION_IMG = svgUrl(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><rect width="240" height="240" rx="20" fill="#eef5ff"/>' +
    '<rect x="40" y="40" width="80" height="80" fill="#1668f2"/><rect x="120" y="40" width="80" height="80" fill="#fff"/>' +
    '<rect x="40" y="120" width="80" height="80" fill="#fff"/><rect x="120" y="120" width="80" height="80" fill="#fff"/>' +
    '<g fill="none" stroke="#0a1730" stroke-width="5"><rect x="40" y="40" width="160" height="160"/><path d="M120 40v160M40 120h160"/></g></svg>',
);

/** Mỗi dạng câu hỏi nên dùng khi nào – hiện ở trang chơi thử. */
export const TYPE_USE_CASES: Record<QuestionType, string> = {
  single_choice: 'Kiểm tra nhanh kiến thức, chỉ có một câu trả lời đúng.',
  multiple_select: 'Khi có nhiều ý đúng và muốn học sinh chọn cho đủ.',
  true_false: 'Khởi động đầu giờ, kiểm tra nhận định đúng hay sai.',
  fill_blank: 'Ghi nhớ từ khóa, công thức, chính tả. Thêm từ gây nhiễu thì học sinh chọn từ trong kho thay vì gõ.',
  drag_drop: 'Kéo thẻ vào đúng ô trống trong câu.',
  reorder: 'Các bước của một quy trình, trình tự thời gian, sắp xếp số.',
  matching: 'Ghép khái niệm với ví dụ, từ với nghĩa, phép tính với kết quả.',
  oral: 'Câu hỏi mở cần diễn đạt bằng lời; giáo viên nghe và chấm.',
};

/** Bộ câu hỏi mặc định của phần mềm: đủ 7 dạng, để chơi thử ngay không cần đăng nhập. */
export function demoQuiz(): Quiz {
  const q = newQuiz('Trải nghiệm Quickplay');
  q.id = 'quiz_demo';
  q.description = 'Chơi thử đủ 7 dạng câu hỏi của Quickplay.';

  const q1 = newQuestion('single_choice');
  q1.stem.text = 'Hình vuông được chia thành 4 phần bằng nhau. Phần tô màu xanh là phân số nào?';
  q1.stem.image_url = DEMO_FRACTION_IMG;
  q1.stem.image_alt = 'Hình vuông chia 4 phần bằng nhau, tô màu 1 phần';
  q1.options = [opt('1/2'), opt('1/4', { is_correct: true }), opt('3/4'), opt('1/3')];
  q1.explanation = 'Có 4 phần bằng nhau, tô màu 1 phần nên phân số là 1/4.';

  const q2 = newQuestion('multiple_select');
  q2.stem.text = 'Những con vật nào là <b>động vật có vú</b>?';
  q2.options = [opt('Cá heo', { is_correct: true }), opt('Con dơi', { is_correct: true }), opt('Cá mập'), opt('Chim cánh cụt')];
  q2.explanation = 'Cá heo và dơi đẻ con và nuôi con bằng sữa. Cá mập là cá, chim cánh cụt là chim.';

  const q3 = newQuestion('true_false');
  q3.stem.text = 'Trái Đất quay quanh Mặt Trời.';
  q3.explanation = 'Đúng. Trái Đất quay quanh Mặt Trời một vòng hết khoảng 365 ngày.';

  const q4 = newQuestion('fill_blank');
  q4.stem.text = 'Thủ đô của Việt Nam là [blank_1].';
  q4.blanks = [{ blank_id: 'blank_1', accepted: ['Hà Nội', 'Ha Noi'], match_rule: 'ignore_case' }];
  q4.explanation = 'Thủ đô của Việt Nam là Hà Nội. Máy không phân biệt chữ hoa, chữ thường.';

  const q5 = newQuestion('fill_blank');
  q5.stem.text = 'Một tuần có [blank_1] ngày. Một năm có [blank_2] tháng.';
  q5.blanks = [
    { blank_id: 'blank_1', accepted: ['7'], match_rule: 'ignore_case' },
    { blank_id: 'blank_2', accepted: ['12'], match_rule: 'ignore_case' },
  ];
  q5.distractors = ['10', '24'];
  q5.scoring = 'partial';
  q5.explanation = 'Một tuần có 7 ngày, một năm có 12 tháng.';

  const q6 = newQuestion('reorder');
  q6.stem.text = 'Sắp xếp các số theo thứ tự <b>từ bé đến lớn</b>:';
  q6.options = [opt('9', { order_index: 0 }), opt('27', { order_index: 1 }), opt('105', { order_index: 2 }), opt('350', { order_index: 3 })];
  q6.explanation = 'Thứ tự đúng: 9 → 27 → 105 → 350.';

  const q7 = newQuestion('matching');
  q7.stem.text = 'Nối mỗi phép tính với kết quả đúng:';
  const [l1, l2, l3, r1, r2, r3] = q7.options;
  l1.text = '6 × 7'; r1.text = '42';
  l2.text = '81 : 9'; r2.text = '9';
  l3.text = '100 − 36'; r3.text = '64';
  q7.explanation = '6 × 7 = 42; 81 : 9 = 9; 100 − 36 = 64.';

  const q8 = newQuestion('oral');
  q8.stem.text = 'Em hãy kể tên 3 việc em có thể làm để bảo vệ môi trường.';
  q8.explanation = 'Bỏ rác đúng nơi quy định, tiết kiệm điện và nước, trồng và chăm sóc cây xanh, hạn chế túi ni lông…';

  q.questions = [q1, q2, q3, q4, q5, q6, q7, q8];
  return q;
}

// ---------------- Bộ câu hỏi MẶC ĐỊNH của Quickplay: "Tiếng Việt 1" và "Tiếng Anh 1" ----------------
// Dựng sẵn trong mã (id cố định), luôn có trong tab "Thư viện công cộng"; mỗi bộ đủ 7 dạng và 3 cách điền chỗ trống.
export const BUILTIN_PREFIX = 'builtin_';
export const isBuiltinId = (id: string) => id.startsWith(BUILTIN_PREFIX);
const BUILTIN_DATE = '2026-01-01T00:00:00.000Z';

export interface BuiltinQuiz {
  id: string;
  title: string;
  /** Vị trí mẫu trong danh mục: Môn › Chương/Chủ đề › Bài */
  path: [string, string, string];
  make: () => Quiz;
}

export const BUILTIN_QUIZZES: BuiltinQuiz[] = [
  { id: 'builtin_tieng_viet_1', title: 'Tiếng Việt 1', path: ['Tiếng Việt', 'Chủ đề 1: Em yêu trường em', 'Bài 1: Ôn tập từ và câu'], make: vietnameseDemoQuiz },
  { id: 'builtin_tieng_anh_1', title: 'Tiếng Anh 1', path: ['Tiếng Anh', 'Unit 1: Hello', 'Lesson 1: Greetings'], make: englishDemoQuiz },
];

export const builtinQuiz = (id: string): Quiz | null => BUILTIN_QUIZZES.find((b) => b.id === id)?.make() ?? null;

const picks = (items: string[]) => items.map((t) => ({ id: uid('o'), text: t.replace(/\*$/, ''), correct: t.endsWith('*') }));
const cells = (items: string[]) => items.map((t) => ({ id: uid('o'), text: t }));
const pairsOf = (rows: [string, string][]) => rows.map(([l, r]) => ({ pid: uid('p'), left: { id: uid('o'), text: l }, right: { id: uid('o'), text: r } }));

/** Một câu của bộ mặc định: soạn bằng đúng bản nháp của hộp "Soạn câu hỏi" nên dữ liệu giống hệt câu giáo viên tự soạn. */
function demoQuestion(type: QuestionType, where: [string, string, string], text: string, explanation: string, fill?: (d: Draft) => void): Question {
  const d = emptyDraft(type, { subject: where[0], lesson: where[2], points: 10, coins: 2 });
  d.text = text;
  d.explanation = explanation;
  fill?.(d);
  return toQuestion(d);
}

const builtin = (b: BuiltinQuiz, description: string, questions: Question[]): Quiz => ({
  id: b.id, title: b.title, subject: b.path[0], grade: 'Tiểu học', description, questions, visibility: 'private', created_at: BUILTIN_DATE, updated_at: BUILTIN_DATE,
});

const APPLE_IMG = svgUrl(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><rect width="240" height="240" rx="20" fill="#eef5ff"/>' +
    '<path d="M120 84c-22-20-66-10-66 40 0 40 30 74 52 74 8 0 10-4 14-4s6 4 14 4c22 0 52-34 52-74 0-50-44-60-66-40z" fill="#e5383b"/>' +
    '<path d="M120 86c0-18 4-30 14-40" fill="none" stroke="#6b3f1d" stroke-width="7" stroke-linecap="round"/>' +
    '<path d="M134 56c10-16 28-20 42-14-6 16-24 24-42 14z" fill="#2fb866"/><ellipse cx="88" cy="118" rx="10" ry="16" fill="#fff" opacity=".35"/></svg>',
);

const BALL_IMG = svgUrl(
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240"><rect width="240" height="240" rx="20" fill="#eef5ff"/>' +
    '<ellipse cx="120" cy="206" rx="62" ry="10" fill="#0a1730" opacity=".12"/><circle cx="120" cy="116" r="78" fill="#f5b301"/>' +
    '<path d="M48 96c40 22 104 22 144 0M58 160c36-18 88-18 124 0" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".85"/>' +
    '<circle cx="92" cy="84" r="14" fill="#fff" opacity=".4"/></svg>',
);

/** Bộ mặc định "Tiếng Việt 1": 10 câu, mỗi câu 10 điểm (tổng 100). */
export function vietnameseDemoQuiz(): Quiz {
  const b = BUILTIN_QUIZZES[0];
  const q = (type: QuestionType, text: string, explanation: string, fill?: (d: Draft) => void) => demoQuestion(type, b.path, text, explanation, fill);
  return builtin(b, 'Bộ câu hỏi mặc định của Quickplay cho môn Tiếng Việt: đủ 7 dạng câu hỏi và 3 cách điền chỗ trống.', [
    q('single_choice', 'Trong hình là quả gì?', 'Hình vẽ một quả táo màu đỏ, có cuống và lá xanh.', (d) => {
      d.image = APPLE_IMG;
      d.image_alt = 'Hình vẽ một quả màu đỏ, có cuống và một chiếc lá xanh';
      d.options = picks(['Quả táo*', 'Quả cam', 'Quả chuối', 'Quả nho']);
    }),
    q('single_choice', 'Từ nào viết đúng chính tả?', 'Viết đúng là "sạch sẽ": tiếng "sạch" và tiếng "sẽ" đều bắt đầu bằng chữ s.', (d) => {
      d.options = picks(['xạch sẽ', 'sạch sẽ*', 'sạch xẽ', 'xạch xẽ']);
    }),
    q('multiple_select', 'Những từ nào dưới đây là từ chỉ sự vật? (Chọn tất cả đáp án đúng)', '"Cái bàn" và "con mèo" là từ chỉ sự vật. "Chạy" là từ chỉ hoạt động, "xinh đẹp" là từ chỉ đặc điểm.', (d) => {
      d.options = picks(['cái bàn*', 'chạy', 'con mèo*', 'xinh đẹp']);
    }),
    q('true_false', 'Câu "Mẹ em là giáo viên." thuộc kiểu câu Ai là gì?', 'Đúng. Câu giới thiệu "Mẹ em" (Ai?) "là giáo viên" (là gì?).', (d) => {
      d.tf = true;
    }),
    q('fill_blank', 'Thủ đô của nước Việt Nam là [___].', 'Thủ đô của nước Việt Nam là Hà Nội.', (d) => {
      d.blanks = ['Hà Nội | Thủ đô Hà Nội'];
      d.noAccent = [true];
    }),
    q('fill_blank', 'Công cha như núi [___],\nNghĩa mẹ như nước trong [___] chảy ra.', 'Câu ca dao: "Công cha như núi Thái Sơn, Nghĩa mẹ như nước trong nguồn chảy ra."', (d) => {
      d.blanks = ['Thái Sơn', 'nguồn'];
      d.fillMode = 'bank';
      d.distractors = ['Trường Sơn', 'biển'];
    }),
    q('fill_blank', 'Chim [___] líu lo trên cành cây.', 'Chim hót líu lo. "Sủa" là tiếng của chó, "gáy" là tiếng của gà trống.', (d) => {
      d.blanks = ['hót'];
      d.fillMode = 'menu';
      d.distractors = ['sủa', 'gáy'];
    }),
    q('reorder', 'Sắp xếp các cụm từ thành một câu đúng.', 'Câu đúng: "Mẹ em đang nấu cơm trong bếp."', (d) => {
      d.steps = cells(['Mẹ em', 'đang', 'nấu cơm', 'trong bếp.']);
    }),
    q('matching', 'Nối mỗi từ ở cột A với từ trái nghĩa ở cột B.', 'Các cặp từ trái nghĩa: cao – thấp, nóng – lạnh, ngày – đêm, vui – buồn.', (d) => {
      d.pairs = pairsOf([['cao', 'thấp'], ['nóng', 'lạnh'], ['ngày', 'đêm'], ['vui', 'buồn']]);
    }),
    q('oral', 'Em hãy nói một câu giới thiệu về trường của em.', 'Gợi ý: "Trường em là Trường Tiểu học … Trường em có nhiều cây xanh và sân chơi rộng." Giáo viên nghe và chấm.'),
  ]);
}

/** Bộ mặc định "Tiếng Anh 1": 10 câu, mỗi câu 10 điểm (tổng 100). */
export function englishDemoQuiz(): Quiz {
  const b = BUILTIN_QUIZZES[1];
  const q = (type: QuestionType, text: string, explanation: string, fill?: (d: Draft) => void) => demoQuestion(type, b.path, text, explanation, fill);
  return builtin(b, 'Bộ câu hỏi mặc định của Quickplay cho môn Tiếng Anh: đủ 7 dạng câu hỏi và 3 cách điền chỗ trống.', [
    q('single_choice', 'What colour is the ball?', 'The ball is yellow. (Quả bóng màu vàng.)', (d) => {
      d.image = BALL_IMG;
      d.image_alt = 'A drawing of a ball';
      d.plain = true; // câu hỏi về màu sắc: ô đáp án nền trắng để màu ô không gây nhầm
      d.options = picks(['Red', 'Yellow*', 'Green', 'Blue']);
    }),
    q('single_choice', 'Which animal says "meow"?', 'A cat says "meow". (Con mèo kêu "meo meo".)', (d) => {
      d.options = picks(['A dog', 'A cat*', 'A bird', 'A fish']);
    }),
    q('multiple_select', 'Which words are colours? (Choose all the correct answers)', '"Red" (màu đỏ) and "green" (màu xanh lá) are colours. "Book" is quyển sách, "pen" is cái bút.', (d) => {
      d.options = picks(['red*', 'book', 'green*', 'pen']);
    }),
    q('true_false', 'We say "Good night" when we meet our teacher in the morning.', 'Sai. Buổi sáng ta chào "Good morning". "Good night" dùng để chúc ngủ ngon.', (d) => {
      d.tf = false;
    }),
    q('fill_blank', 'The opposite of "big" is [___].', 'big (to) ↔ small (nhỏ). Có thể viết "small" hoặc "little".', (d) => {
      d.blanks = ['small | little'];
      d.noAccent = [true];
    }),
    q('fill_blank', 'This [___] a cat. These [___] dogs.', '"This is…" dùng cho một vật, "These are…" dùng cho nhiều vật.', (d) => {
      d.blanks = ['is', 'are'];
      d.fillMode = 'bank';
      d.distractors = ['am', 'be'];
    }),
    q('fill_blank', 'I [___] a student.', 'Với "I" ta dùng "am": I am a student. (Em là học sinh.)', (d) => {
      d.blanks = ['am'];
      d.fillMode = 'menu';
      d.distractors = ['is', 'are'];
    }),
    q('reorder', 'Put the words in the correct order to make a sentence.', 'My name is Nam. (Tên em là Nam.)', (d) => {
      d.steps = cells(['My', 'name', 'is', 'Nam.']);
    }),
    q('matching', 'Match each English word with its meaning.', 'dog – con chó, cat – con mèo, bird – con chim, fish – con cá.', (d) => {
      d.pairs = pairsOf([['dog', 'con chó'], ['cat', 'con mèo'], ['bird', 'con chim'], ['fish', 'con cá']]);
    }),
    q('oral', 'Introduce yourself in English: say hello, your name and your age.', 'Gợi ý: "Hello! My name is Nam. I am seven years old." Giáo viên nghe và chấm.'),
  ]);
}
