// File Word mẫu chuẩn của Quickplay: giáo viên tải về, soạn đúng mẫu rồi tải lên → nhập ngay, không cần AI.
// Tệp .docx được tự ghi bằng JSZip (document.xml tối giản), mở được bằng Word, WPS và Google Docs.

type Block =
  | { k: 'h1' | 'h2' | 'p' | 'li' | 'note'; t: string }
  | { k: 'q'; lines: string[] }; // một câu hỏi mẫu: mỗi phần tử là một dòng

const START = '=== BẮT ĐẦU CÂU HỎI ===';
const END = '=== KẾT THÚC CÂU HỎI ===';

const guide = (kind: TemplateKind): Block[] => [
  { k: 'h1', t: 'QUICKPLAY – FILE WORD MẪU SOẠN CÂU HỎI' },
  { k: 'p', t: kind === 'quiz7' ? 'Bản 7 dạng câu hỏi trắc nghiệm (máy tự chấm).' : 'Bản 8 dạng câu hỏi: 7 dạng trắc nghiệm và dạng Trả lời miệng (giáo viên chấm).' },
  { k: 'p', t: 'Soạn câu hỏi đúng theo mẫu này rồi tải tệp lên Quickplay (Tạo câu hỏi từ tài liệu → Giữ nguyên tài liệu). Phần mềm đọc được ngay toàn bộ câu hỏi, đáp án, thời gian và điểm mà không cần dùng AI.' },
  { k: 'h2', t: 'Quy tắc chung' },
  { k: 'li', t: `Phần mềm chỉ đọc các câu nằm giữa hai dòng "${START}" và "${END}". Đừng xóa hai dòng này.` },
  { k: 'li', t: 'Mỗi câu bắt đầu bằng "Câu 1:", "Câu 2:"… Mỗi phương án một dòng: "A.", "B.", "C."… (tối đa 6 phương án).' },
  { k: 'li', t: 'Đánh dấu đáp án đúng bằng dấu * ngay trước chữ cái (ví dụ: *B. Hà Nội), hoặc thêm dòng "Đáp án: B" (nhiều đáp án: "Đáp án: A, C"). Cũng có thể in đậm cả dòng phương án đúng.' },
  { k: 'li', t: 'Dòng bắt đầu bằng dấu # là ghi chú, phần mềm bỏ qua. Thầy cô có thể xóa các ghi chú và câu mẫu sau khi đã hiểu cách soạn.' },
  { k: 'li', t: 'Không in đậm, gạch chân phương án sai: chữ đậm/gạch chân trong phương án được hiểu là đáp án đúng.' },
  { k: 'h2', t: 'Các dòng tùy chọn (đặt bên dưới câu hỏi, mỗi dòng một nhãn)' },
  { k: 'li', t: `Dạng: ${TYPE_LIST[kind].replace(/, /g, ' | ')}. Bắt buộc với Sắp xếp và Kéo thả vào chỗ trống, nên ghi với các dạng khác.` },
  { k: 'li', t: 'Thời gian: 30 (số giây suy nghĩ, từ 5 đến 600). Không ghi thì dùng mức mặc định của từng dạng.' },
  { k: 'li', t: 'Điểm: 1000 (điểm của câu). Không ghi thì là 1000.' },
  { k: 'li', t: 'Giải thích: lời giải ngắn hiện cho học sinh sau khi trả lời.' },
  { k: 'h2', t: 'Hình ảnh, video, âm thanh' },
  { k: 'li', t: 'Hình ảnh của câu hỏi: chèn ảnh (Insert → Pictures) vào một dòng riêng ngay dưới dòng "Câu …". Hình của một phương án: chèn ảnh vào dòng riêng ngay dưới phương án đó. Chỉ áp dụng cho tệp .docx.' },
  { k: 'li', t: 'Hoặc dùng ảnh trên mạng: thêm dòng "Hình: https://…" (đường link trực tiếp tới tệp ảnh).' },
  { k: 'li', t: 'Video: thêm dòng "Video: https://www.youtube.com/watch?v=…" (YouTube, Vimeo hoặc link tệp .mp4 công khai).' },
  { k: 'li', t: 'Âm thanh: thêm dòng "Âm thanh: https://…" (link trực tiếp tới tệp .mp3).' },
];

const TYPE_LIST: Record<'quiz7' | 'full8', string> = {
  quiz7: 'Một đáp án, Nhiều đáp án, Đúng/Sai, Điền chỗ trống, Sắp xếp, Nối cột, Kéo thả vào chỗ trống',
  full8: 'Một đáp án, Nhiều đáp án, Đúng/Sai, Điền chỗ trống, Sắp xếp, Nối cột, Kéo thả vào chỗ trống, Trả lời miệng',
};

/** Hai bản file mẫu: 7 dạng trắc nghiệm (máy tự chấm) · 8 dạng (thêm Trả lời miệng, giáo viên chấm). */
export type TemplateKind = 'quiz7' | 'full8';
export const TEMPLATE_FILES: Record<TemplateKind, string> = {
  quiz7: 'Quickplay-mau-7-dang-trac-nghiem.docx',
  full8: 'Quickplay-mau-8-dang-co-tra-loi-mieng.docx',
};

/**
 * Các câu mẫu theo từng dạng. Dòng bắt đầu bằng # là ghi chú hướng dẫn (bộ đọc bỏ qua).
 * Câu hỏi ghi "Câu #:" và được đánh số lại liên tục khi tạo tệp.
 */
function samples(kind: TemplateKind): Block[] {
  const list: Block[] = [
    { k: 'note', t: '# DẠNG 1 – MỘT ĐÁP ÁN: học sinh chọn 1 phương án. Đánh dấu * trước phương án đúng.' },
    { k: 'q', lines: ['Câu #: Thủ đô của Việt Nam là thành phố nào?', 'Dạng: Một đáp án', 'A. Huế', '*B. Hà Nội', 'C. Đà Nẵng', 'D. Cần Thơ', 'Thời gian: 20', 'Điểm: 1000', 'Giải thích: Hà Nội là thủ đô của nước Cộng hòa xã hội chủ nghĩa Việt Nam.'] },
    { k: 'note', t: '# Cách thứ hai: không dùng dấu *, ghi dòng "Đáp án:" ở cuối câu.' },
    { k: 'q', lines: ['Câu #: 7 × 8 bằng bao nhiêu?', 'A. 54', 'B. 56', 'C. 63', 'Đáp án: B'] },
    { k: 'note', t: '# DẠNG 2 – NHIỀU ĐÁP ÁN: có từ 2 phương án đúng trở lên, đánh dấu * trước từng phương án đúng.' },
    { k: 'q', lines: ['Câu #: Những số nào sau đây là số chẵn?', 'Dạng: Nhiều đáp án', '*A. 12', 'B. 7', '*C. 30', 'D. 15', 'Thời gian: 30'] },
    { k: 'note', t: '# DẠNG 3 – ĐÚNG / SAI: không cần gõ phương án, chỉ ghi "Đáp án: Đúng" hoặc "Đáp án: Sai".' },
    { k: 'q', lines: ['Câu #: Mặt Trời mọc ở hướng Đông.', 'Dạng: Đúng/Sai', 'Đáp án: Đúng'] },
    { k: 'q', lines: ['Câu #: Cá heo là một loài cá.', 'Dạng: Đúng/Sai', 'Đáp án: Sai', 'Giải thích: Cá heo là động vật có vú, thở bằng phổi.'] },
    { k: 'note', t: '# DẠNG 4 – ĐIỀN CHỖ TRỐNG: học sinh tự gõ từ. Gõ ___ (3 dấu gạch dưới) ở chỗ cần điền. Dòng "Đáp án:" ghi từ đúng; nhiều chỗ trống thì ngăn bằng dấu ; và nhiều cách viết đúng thì ngăn bằng dấu /.' },
    { k: 'q', lines: ['Câu #: Nước sôi ở ___ độ C và đóng băng ở ___ độ C.', 'Dạng: Điền chỗ trống', 'Đáp án: 100 / một trăm; 0 / không', 'Thời gian: 45'] },
    { k: 'note', t: '# DẠNG 5 – SẮP XẾP: gõ các bước theo ĐÚNG thứ tự. Phần mềm tự xáo trộn khi học sinh làm bài. Bắt buộc có dòng "Dạng: Sắp xếp".' },
    { k: 'q', lines: ['Câu #: Sắp xếp các giai đoạn của vòng tuần hoàn nước.', 'Dạng: Sắp xếp', 'A. Nước bay hơi', 'B. Hơi nước ngưng tụ thành mây', 'C. Mưa rơi xuống', 'D. Nước chảy ra sông, biển', 'Thời gian: 45'] },
    { k: 'note', t: '# DẠNG 6 – NỐI CỘT: mỗi dòng là một cặp, viết "vế trái = vế phải".' },
    { k: 'q', lines: ['Câu #: Nối mỗi nước với thủ đô của nước đó.', 'Dạng: Nối cột', 'A. Việt Nam = Hà Nội', 'B. Nhật Bản = Tokyo', 'C. Pháp = Paris', 'Thời gian: 60'] },
    { k: 'note', t: '# DẠNG 7 – KÉO THẢ ĐÁP ÁN VÀO CHỖ TRỐNG: học sinh kéo (hoặc chạm) các thẻ từ vào đúng chỗ trống ___. Dòng "Đáp án:" là các từ đúng theo thứ tự chỗ trống, ngăn bằng dấu ;. Dòng "Từ nhiễu:" là các thẻ sai để gây nhiễu (không bắt buộc).' },
    { k: 'q', lines: ['Câu #: Con ___ kêu meo meo, con ___ kêu gâu gâu.', 'Dạng: Kéo thả vào chỗ trống', 'Đáp án: mèo; chó', 'Từ nhiễu: gà; vịt'] },
  ];
  if (kind === 'full8') list.push(
    { k: 'note', t: '# DẠNG 8 – TRẢ LỜI MIỆNG: học sinh trả lời bằng lời (ghi âm hoặc gõ chữ), giáo viên chấm Đúng/Sai. Dòng "Đáp án:" là gợi ý chấm cho giáo viên.' },
    { k: 'q', lines: ['Câu #: Em hãy nêu hai việc làm để tiết kiệm nước ở nhà.', 'Dạng: Trả lời miệng', 'Đáp án: Khóa vòi khi không dùng; dùng lại nước rửa rau để tưới cây', 'Thời gian: 60'] },
  );
  list.push(
    { k: 'note', t: '# VÍ DỤ CÓ VIDEO: thêm dòng "Video:" với đường link. Muốn có hình thì chèn ảnh vào dòng ngay dưới dòng "Câu …".' },
    { k: 'q', lines: ['Câu #: Xem video rồi cho biết: cây xanh cần gì để quang hợp?', 'Video: https://www.youtube.com/watch?v=dQw4w9WgXcQ', '*A. Ánh sáng', 'B. Bóng tối', 'C. Tiếng ồn'] },
  );
  let n = 0;
  return list.map((b) => (b.k === 'q' ? { ...b, lines: b.lines.map((l, i) => (i === 0 ? l.replace('Câu #:', `Câu ${++n}:`) : l)) } : b));
}

export const AI_PROMPT = [
  'Tôi gửi kèm (1) file Word mẫu soạn câu hỏi của phần mềm Quickplay và (2) bộ câu hỏi của tôi.',
  'Hãy trình bày lại TOÀN BỘ bộ câu hỏi của tôi theo đúng cú pháp trong file mẫu, giữ nguyên câu chữ và đáp án, không thêm bớt câu hỏi:',
  `- Đặt tất cả câu hỏi giữa hai dòng "${START}" và "${END}".`,
  '- Mỗi câu bắt đầu bằng "Câu n:", mỗi phương án một dòng "A.", "B."…; đánh dấu * ngay trước chữ cái của phương án đúng.',
  `- Dưới mỗi câu ghi dòng "Dạng:" là một trong: ${TYPE_LIST.full8}.`,
  '- Đúng/Sai: ghi "Đáp án: Đúng" hoặc "Đáp án: Sai". Điền chỗ trống: dùng ___ ở chỗ trống và dòng "Đáp án:". Kéo thả vào chỗ trống: như Điền chỗ trống, thêm dòng "Từ nhiễu:". Sắp xếp: liệt kê theo đúng thứ tự. Nối cột: mỗi dòng "vế trái = vế phải".',
  '- Nếu câu nào chưa có đáp án, hãy để nguyên và ghi thêm dòng ghi chú bắt đầu bằng dấu # để tôi bổ sung.',
  '- Không in đậm, không dùng bảng, không đánh số tự động của Word; chỉ dùng chữ thường như trong mẫu.',
  'Trả kết quả dưới dạng văn bản để tôi dán vào Word.',
];

const TAIL: Block[] = [
  { k: 'h2', t: 'Dùng với ChatGPT / Gemini' },
  { k: 'p', t: 'Nếu thầy cô đã có sẵn bộ câu hỏi trình bày theo kiểu khác, hãy gửi file mẫu này cùng bộ câu hỏi cho ChatGPT hoặc Gemini và dán lời nhắc dưới đây. AI sẽ trình bày lại theo đúng mẫu; thầy cô chép kết quả vào Word (hoặc dán thẳng vào ô nội dung của Quickplay) rồi nhập như bình thường.' },
  ...AI_PROMPT.map((t) => ({ k: 'li' as const, t })),
  { k: 'p', t: 'Lưu ý: luôn đọc lại kết quả của AI trước khi dùng trên lớp.' },
];

/** Văn bản thuần của vùng câu hỏi (đúng như bộ đọc sẽ nhận) – dùng cho ô dán nội dung và kiểm thử. */
export function templateQuestionsText(kind: TemplateKind = 'full8'): string {
  return [START, ...samples(kind).flatMap((b) => (b.k === 'q' ? [...b.lines, ''] : [b.t])), END].join('\n');
}

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);
function para(text: string, o: { bold?: boolean; size?: number; color?: string; before?: number; indent?: boolean } = {}): string {
  const rpr = `<w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${o.bold ? '<w:b/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}<w:sz w:val="${o.size ?? 24}"/><w:szCs w:val="${o.size ?? 24}"/></w:rPr>`;
  const ppr = `<w:pPr><w:spacing w:before="${o.before ?? 0}" w:after="80"/>${o.indent ? '<w:ind w:left="360" w:hanging="240"/>' : ''}</w:pPr>`;
  return `<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r></w:p>`;
}

function render(b: Block): string {
  switch (b.k) {
    case 'h1': return para(b.t, { bold: true, size: 36, color: '0B4FD0' });
    case 'h2': return para(b.t, { bold: true, size: 28, color: '0B4FD0', before: 240 });
    case 'p': return para(b.t);
    case 'li': return para('• ' + b.t, { indent: true });
    case 'note': return para(b.t, { color: '6B7280', size: 22, before: 200 });
    case 'q': return b.lines.map((l) => para(l)).join('') + para('');
  }
}

export async function buildWordTemplate(kind: TemplateKind = 'full8'): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const marker = (t: string) => para(t, { color: '0F7A3C', before: 240 });
  const body = [...guide(kind).map(render), marker(START), ...samples(kind).map(render), marker(END), ...TAIL.map(render)].join('');
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
