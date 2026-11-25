import { describe, expect, it } from 'vitest';
import { parseQuestions, waygroundHtmlToText } from './importer';

// Đoạn mẫu cấu trúc trang đã lưu của Wayground: đề có khi nằm trong thẻ <p>, có khi là chữ trần;
// nhãn "N giây" là nút riêng; phương án đúng có biểu tượng dấu tích xanh.
const SAMPLE = `
<div class="x"><span>MULTIPLE CHOICE</span><div>•</div><div>20 giây</div><div>•</div><div>1 Điểm</div><button>Chỉnh sửa</button>
<div class="text-w-content-base font-semibold"><div><p>Khi mượn điện thoại bố mẹ, hành động nào là đúng?</p></div></div></div>
<div class="flex items-center gap-0.5 overflow-auto cursor-pointer"><i class="icon-free-regular-circle"></i><div><p>A. Tự ý tải thêm trò chơi.</p></div></div>
<div class="flex items-center gap-0.5 overflow-auto cursor-pointer"><i class="icon-solid-circle-check"></i><div><p>B. Chỉ dùng ứng dụng đã xin phép.</p></div></div>
<div><span>MULTIPLE CHOICE</span><div>•</div><div>20 giây</div><div>•</div><div>1 Điểm</div><button>Chỉnh sửa</button>
<p>Khi chia sẻ thông tin, nên làm gì &amp; vì sao?</p></div>
<div class="flex items-center gap-0.5 overflow-auto cursor-pointer"><i class="icon-solid-circle-check"></i><div><p>A. Suy nghĩ kỹ trước khi đăng.</p></div></div>
<div class="flex items-center gap-0.5 overflow-auto cursor-pointer"><i class="icon-free-regular-circle"></i><div><p>B. Đăng thật nhiều.</p></div></div>
`;

describe('nhập bộ câu hỏi từ trang đã lưu của Wayground', () => {
  it('tách đúng từng câu, đề và phương án, đánh dấu đáp án đúng', () => {
    const text = waygroundHtmlToText(SAMPLE);
    expect(text).toContain('Câu 1. Khi mượn điện thoại bố mẹ, hành động nào là đúng?');
    expect(text).toContain('*B. Chỉ dùng ứng dụng đã xin phép.');
    expect(text).toContain('Câu 2. Khi chia sẻ thông tin, nên làm gì & vì sao?');
    expect(text).toContain('*A. Suy nghĩ kỹ trước khi đăng.');
  });

  it('bộ nhập đọc ra đúng số câu và mỗi câu có một đáp án đúng', () => {
    const rep = parseQuestions(waygroundHtmlToText(SAMPLE), 'bo-cau-hoi.html');
    expect(rep.questions).toHaveLength(2);
    for (const q of rep.questions) {
      expect(q.options.filter((o) => o.is_correct)).toHaveLength(1);
    }
  });
});

import { isPublishedFormUrl } from './googleForm';
describe('link Google Form', () => {
  it('nhận biết link làm bài (không có đáp án) và link chỉnh sửa', () => {
    expect(isPublishedFormUrl('https://docs.google.com/forms/d/e/1FAIpQLSfD3sZ/viewform?usp=sharing')).toBe(true);
    expect(isPublishedFormUrl('https://docs.google.com/forms/d/1Eu66vFdWchGuf/edit')).toBe(false);
  });
});

import { formToQuestions } from './googleForm';
describe('Google Form: câu điền chỗ trống / kéo thả có kho từ', () => {
  it('chuyển nhãn [Kéo thả] + [Ngân hàng từ] thành câu điền chỗ trống có từ nhiễu', () => {
    const r = formToQuestions({
      title: 'Thử',
      source: 'editor',
      items: [{
        kind: 'text',
        title: 'Câu 18 [Kéo thả vào chỗ trống]: Mật khẩu mạnh nên có cả chữ hoa, chữ thường để tăng tính _______. [Ngân hàng từ: bảo mật | công khai | ngẫu nhiên | ồn ào]',
        answers: ['bảo mật'],
      }],
    });
    const q = r.questions[0];
    expect(q.type).toBe('fill_blank');
    expect(q.blanks?.[0].accepted).toEqual(['bảo mật']);
    expect(q.distractors).toEqual(['công khai', 'ngẫu nhiên', 'ồn ào']);
    expect(q.stem.text).toContain('[blank_1]');
    expect(q.stem.text).not.toContain('Ngân hàng');
  });
});
