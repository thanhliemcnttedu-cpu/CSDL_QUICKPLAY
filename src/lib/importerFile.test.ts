import { describe, expect, it } from 'vitest';
import { extractText, sniff } from './importer';

const file = (name: string, bytes: number[] | string) => new File([typeof bytes === 'string' ? bytes : new Uint8Array(bytes)], name);
const fail = async (f: File) => extractText(f).then(() => '', (e: Error) => e.message);

describe('đọc tệp đề tải lên: nhận dạng và báo lỗi dễ hiểu', () => {
  it('nhận dạng loại tệp theo byte đầu', async () => {
    expect(await sniff(file('a', [0x50, 0x4b, 3, 4]))).toBe('zip');
    expect(await sniff(file('a', [0xd0, 0xcf, 0x11, 0xe0, 0xa1]))).toBe('ole');
    expect(await sniff(file('a', String.raw`{\rtf1\ansi Xin chào}`))).toBe('rtf');
    expect(await sniff(file('a', '<html><body><p>Câu 1</p></body></html>'))).toBe('html');
    expect(await sniff(file('a', 'Câu 1: Thủ đô của Việt Nam là?\nA. Huế'))).toBe('text');
    expect(await sniff(file('a', [0, 1, 2, 3, 200, 201]))).toBe('unknown');
  });
  it('tệp Word đời cũ đổi đuôi thành .docx: hướng dẫn lưu lại, không hiện lỗi tiếng Anh của bộ giải nén', async () => {
    const msg = await fail(file('de.docx', [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    expect(msg).toMatch(/Word đời cũ/);
    expect(msg).not.toMatch(/central directory|zip/i);
    expect(await fail(file('de.doc', [1, 2, 3]))).toMatch(/Lưu thành/);
  });
  it('tệp tạm của Word, tệp rỗng, tệp hỏng: nói rõ nguyên nhân', async () => {
    expect(await fail(file('~$de thi.docx', [1, 2, 3]))).toMatch(/tệp tạm/);
    expect(await fail(file('de.docx', []))).toMatch(/Tệp rỗng/);
    expect(await fail(file('bang.xlsx', [0, 1, 2, 3, 200]))).toMatch(/không đúng định dạng \.xlsx/);
  });
  it('tệp .docx thực chất là trang web hoặc văn bản thường: vẫn đọc được nội dung', async () => {
    expect(await extractText(file('de.docx', '<html><body><p>Câu 1: 1 + 1 = ?</p><p><b>A. 2</b></p></body></html>'))).toContain('Câu 1: 1 + 1 = ?');
    expect(await extractText(file('de.docx', 'Câu 1: Thủ đô của Việt Nam là?\nA. Huế\nB. Hà Nội'))).toContain('B. Hà Nội');
  });
});
