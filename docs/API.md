# Hợp đồng API — Google Apps Script (Drive làm CSDL)

Ứng dụng web (Vercel) và bản cài đặt `.exe` (Electron) gọi **cùng một** Web App Apps Script, nên mọi
bản dùng chung một kho dữ liệu trên Google Drive.

## Giao thức

- `POST <WEB_APP_URL>` với header `Content-Type: text/plain;charset=utf-8` (tránh CORS preflight),
  thân là JSON: `{ "action": "<tên>", "teacher_key": "<khóa GV, nếu cần>", ...tham số }`.
- Phản hồi luôn là JSON: `{ "ok": true, "data": ... }` hoặc `{ "ok": false, "error": "thông báo tiếng Việt" }`.
- `GET <WEB_APP_URL>?action=ping` trả về `{ok:true,data:{name:"Quickplay",version}}`.
- Hành động có dấu 🔒 yêu cầu `teacher_key` khớp Script Property `TEACHER_KEY`.

## Lưu trữ trên Drive

```
QUICKPLAY_DATA/               (thư mục gốc; id lưu ở Script Property ROOT_FOLDER_ID)
├── quizzes/<quiz_id>.json      Quiz đầy đủ (kiểu Quiz trong src/lib/types.ts)
├── quizzes/_index.json         Mảng QuizSummary (cập nhật khi lưu/xóa)
├── sessions/<pin>.json         Session đầy đủ (ghi định kỳ + khi kết thúc)
└── media/<tên tệp>             Ảnh/âm thanh/video; chia sẻ "Anyone with link: view"
```

Trạng thái phiên đang chạy giữ trong `CacheService` (khóa `S_<pin>`, TTL 6 giờ) để thăm dò nhanh,
đồng bộ xuống `sessions/<pin>.json` mỗi ≥10 giây và khi đổi trạng thái. Mọi thao tác ghi phiên dùng
`LockService.getScriptLock()`.

## Hành động

| action | Quyền | Tham số | data trả về |
|---|---|---|---|
| `ping` | — | — | `{name, version}` |
| `verifyTeacher` | 🔒 | — | `{ok:true}` |
| `listQuizzes` | 🔒 | — | `QuizSummary[]` |
| `listPublicQuizzes` | — | — | `QuizSummary[]` (visibility = public) |
| `getQuiz` | 🔒 | `id` | `Quiz` |
| `saveQuiz` | 🔒 | `quiz` | `Quiz` (đặt `updated_at`, sinh `id` nếu thiếu) |
| `deleteQuiz` | 🔒 | `id` | `{id}` (chuyển tệp vào thùng rác) |
| `uploadMedia` | 🔒 | `name, mime, base64, hash?` | `{url, file_id, reused?}`; với ảnh có `hash` (SHA-256 hex của nội dung) tệp được đặt tên theo mã băm, đã có tệp trùng thì trả lại tệp cũ (`reused: true`) chứ không lưu bản thứ hai; url dạng `https://lh3.googleusercontent.com/d/<id>` cho ảnh, `https://drive.google.com/uc?export=download&id=<id>` cho audio/video |
| `createSession` | 🔒 | `quiz_id, settings` | `{pin, session_id}` (PIN 6 số không trùng phiên đang mở) |
| `hostState` | 🔒 | `pin` | `Session` đầy đủ |
| `hostAction` | 🔒 | `pin, op, player_id?` — op ∈ `start, pause, resume, next, lock, end, kick, unlock` | `Session` |
| `listSessions` | 🔒 | — | `{pin, quiz_title, state, mode, created_at, player_count}[]` |
| `getSessionQuiz` | — | `pin` | `{quiz, settings, state}` — quiz cho học sinh (đáp án vẫn kèm để chấm tại máy) |
| `joinSession` | — | `pin, name, class_name, avatar, player_id?` | `{player_id, player}`; `player_id` có sẵn = khôi phục kết nối. `name` và `class_name` (lớp, ≤ 20 ký tự) bắt buộc; trùng tên chỉ bị từ chối khi cùng lớp; phòng chế độ giấy không nhận học sinh vào bằng thiết bị |
| `poll` | — | `pin, player_id?` | `PollResult` |
| `submitAnswer` | — | `pin, player_id, record: AnswerRecord` | `{player}` (bỏ qua nếu câu đã nộp — chống nộp trùng) |
| `saveProgress` | — | `pin, player_id, current_index, draft` | `{saved_at}` (giao bài về nhà — auto_save) |
| `getProgress` | — | `pin, player_id` | `{current_index, draft, answers}` |
| `finishPlayer` | — | `pin, player_id` | `{player}` |
| `reportViolation` | — | `pin, player_id, kind, detail?, q_index?` | `{violations, locked}` — xem mục Chống gian lận |
| `setRootFolder` | 🔒 | `folder_url` | `{id, name}` — đặt thư mục Drive riêng của giáo viên làm nơi lưu (thư mục phải thuộc tài khoản đã cài Apps Script; dữ liệu cũ không tự chuyển) |
| `getCatalog` | 🔒 | — | `Catalog` = `{subjects: [{id, name, chapters: [{id, name, lessons: [{id, name}]}]}]}` (tệp `catalog.json` ở thư mục gốc) |
| `saveCatalog` | 🔒 | `catalog` | `Catalog` đã chuẩn hóa. Bộ đề giữ `subject_id`, `chapter_id`, `lesson_id`; id không còn trong danh mục = chưa phân loại (xóa nút không xóa bộ đề) |
| `listClasses` | 🔒 | — | `ClassRoom[]` (tệp `classes.json` ở thư mục gốc) |
| `saveClass` | 🔒 | `cls: {id?, name, students[]}` | `ClassRoom` (tối đa 100 học sinh; số thẻ = thứ tự trong danh sách) |
| `deleteClass` | 🔒 | `id` | `{id}` |
| `createPaperSession` | 🔒 | `quiz_id, class_name, students[]` | `{pin, session_id}` — phiên chế độ giấy; đề được lọc còn câu một đáp án 2–4 phương án, lưu ở `sessions/<pin>.quiz.json` |
| `paperAction` | khóa quét | `pin, key, op, q_index?, hits?` — op ∈ `state, hello, scan, remind, reveal, next, end`; `hits: {card, choice}[]` | `PaperView` — xem mục Chế độ giấy |
| `importGoogleForm` | 🔒 | `url` (link Google Form) | `{title, source:'editor', is_quiz, items[]}` khi mở được bằng FormApp (có đáp án, điểm) hoặc `{title:'', source:'public', raw}` (chuỗi `FB_PUBLIC_LOAD_DATA_` của trang công khai, không có đáp án). Cần scope `forms`. |
| `aiGenerate` | 🔒 | `prompt, system?` | `{text}` — gọi Gemini bằng Script Property `GEMINI_API_KEY` |

### Quy tắc trạng thái (máy trạng thái)

- `LOBBY_WAITING` → `start` → `IN_PROGRESS` (đặt `started_at`, `current_index=0`, `question_opened_at`).
- `IN_PROGRESS` ↔ `PAUSED` (`pause`/`resume`; cộng dồn `paused_total_ms`).
- `instructor_paced`: `lock` đặt `question_locked=true`; `next` tăng `current_index`, mở khóa, đặt
  `question_opened_at`; `next` ở câu cuối → `COMPLETED`.
- `end` hoặc mọi người `finished` (classic/homework) → `COMPLETED`.
- `homework`: học sinh chỉ vào được khi `now ≥ start_time` và `now ≤ deadline`; quá hạn → tự `COMPLETED`.
- Mất kết nối: người chơi giữ nguyên trong danh sách; `last_seen` cập nhật mỗi lần `poll`.
  Ở phòng chờ, người chơi im lặng > 60 giây bị ẩn khỏi danh sách (vẫn khôi phục được bằng `player_id`).

### Chống gian lận

- Bật bằng `settings.anti_cheat = {enabled, block_right_click, block_copy, detect_leave, require_fullscreen, max_violations}`.
- `kind` ∈ `tab_hidden, window_blur, exit_fullscreen, right_click, copy_paste, screenshot_key, devtools, shortcut, split_screen, open_link`.
- Ghi vào `session.violations[]` (tối đa 3000 dòng). Cùng `kind` từ cùng học sinh trong 3 giây chỉ ghi 1 lần.
- `open_link` (mở link tham khảo của đề) chỉ ghi nhật ký, không cộng `player.violations`.
- `max_violations` là **ngưỡng được phép**: N lần đầu chỉ cảnh báo; khi `violations − violation_base > max_violations`
  (tức lần thứ N+1) → `player.locked = true`, `submitAnswer` bị từ chối. `max_violations = 0` → không bao giờ khóa.
- `player.avatar` dạng `v2-<m|f>-<da>-<kiểu tóc>-<màu tóc>-<màu áo>-<phụ kiện>-<nét mặt>` (≤ 40 ký tự); giá trị cũ (tên con vật) vẫn hợp lệ.
- `hostAction op=unlock` → `locked=false`, `violation_base = violations` (đếm lại từ đầu).
- `poll` trả thêm `locked`, `my_violations` cho học sinh. `settings.leaderboard_top` ∈ {0, 5, 10, 15} (0 = tất cả).

### Chế độ giấy (thẻ trả lời)

- `session.settings.mode = 'paper'`, `session.paper = {class_name, scan_key, connected?, remind?, reveal?}`; người chơi tạo sẵn từ danh sách lớp
  với `player_id = 'c' + số thẻ`. Phiên bắt đầu ngay ở `IN_PROGRESS`, giáo viên điều khiển từng câu.
- `scan_key` chỉ trả về qua `hostState` (🔒) và nằm trong mã QR trên màn chiếu (`/quet?pin=…&k=…`); `paperAction` so khớp khóa này nên
  điện thoại quét thẻ không cần `teacher_key`.
- `scan`: chỉ nhận khi `q_index` trùng câu đang mở; mỗi thẻ một đáp án cho mỗi câu, quét lại với phương án khác thì thay đáp án cũ.
  Máy chủ tự chấm theo đề đã lưu: đúng được `points` của câu, sai 0 điểm (không thưởng tốc độ).
- `hello` đánh dấu điện thoại đã kết nối (màn chiếu chuyển sang câu hỏi); `remind`/`reveal` bật tắt; `next` ở câu cuối → `COMPLETED`.
- Thẻ: ô mã 6×6 (viền đen + lõi 4×4), bảng 100 mã cố định trong `src/lib/paperCard.ts`; cạnh hướng lên trên cho biết đáp án A/B/C/D.

### Làm lại bài nhiều lần và thời gian làm bài

- Trực tiếp tự do và bài về nhà: `joinSession` với cùng tên + lớp khi lượt trước đã `finished` hoặc `locked` sẽ tạo một LẦN LÀM MỚI
  (người chơi mới, `attempt_no = n + 1`) — nhưng chỉ khi gửi kèm `reuse_name: true`; không có thì trả lỗi bắt đầu bằng `[TEN_DA_DUNG]`
  để máy học sinh hỏi em đổi tên hay vẫn dùng tên cũ; các lượt cũ được đánh dấu `superseded = true`: ẩn khỏi bảng xếp hạng và `poll`, vẫn giữ trong báo cáo.
  Lượt trước còn đang làm dở thì từ chối như trùng tên. Không giới hạn số lần làm.
- Bài bị khóa do vi phạm (ngoài chế độ giáo viên điều khiển) không làm tiếp được: học sinh thoát ra và vào lại để làm lần mới.
- `player.joined_at`, `player.finished_at`: thời gian làm cả bài = `finished_at − max(started_at, joined_at)` (bài về nhà: `finished_at − joined_at`).
- Báo cáo gom các lần làm của cùng một em liền nhau, lần mới nhất ở trên; số liệu tổng chỉ tính lần mới nhất.

### Cách làm bài và nộp bài (chế độ không do giáo viên điều khiển)

- `settings.navigation` ∈ `sequential` (mặc định: trả lời xong câu này mới sang câu sau) | `free` (học sinh có bảng số câu, tự chọn câu, bấm Nộp bài).
  Ở `free` không tính giờ từng câu và không thưởng tốc độ: điểm = `round(points × ratio)`.
- `settings.require_all` (chỉ có nghĩa ở `free`): `true` → chưa trả lời hết thì không cho nộp, báo các câu còn thiếu; `false` → nhắc rồi vẫn nhận bài.
- `settings.retry_rounds` ∈ 0–20 (giáo viên tự điền) (không áp dụng cho giáo viên điều khiển): số LƯỢT làm lại các câu sai của cả bài. Làm xong bài, học sinh được
  làm lại những câu còn sai; `submitAnswer` với `record.attempt = n` (n ≤ `retry_rounds`, lớn hơn `attempt` của bản cũ, bản cũ chưa đúng hoàn toàn) sẽ THAY câu trả lời cũ.
- Giáo viên điều khiển: học sinh được chọn lại đáp án khi câu còn mở: `submitAnswer` với `record.change = true` thay câu trả lời cũ nếu câu chưa khóa
  và chưa chuyển câu. Máy chủ không còn tự khóa câu khi cả lớp đã trả lời. Hết giờ mà chưa trả lời, máy học sinh gửi `answer.kind = 'none'`:
  trạng thái "chưa trả lời" (khác với trả lời sai).
- Câu điền chỗ trống: `question.fill_mode` ∈ `type` (gõ) | `bank` (kho từ) | `menu` (menu thả xuống tại chỗ trống); `blank.accepted[]` là các cách viết
  được tính điểm, `blank.ignore_accents = true` thì bản gõ không dấu cũng được tính.

### Tính điểm (thực hiện ở máy học sinh, gửi kèm record)

`score = round(points × ratio × (0.5 + 0.5 × max(0, 1 − time_ms / (time_limit×1000))))` — trả lời
nhanh được thưởng tới 100%, chậm tối thiểu 50%; thêm thưởng chuỗi đúng khi bật power-ups.

## Máy chủ tài khoản (apps-script-admin/Code.gs — dự án Apps Script riêng của quản trị)

Cùng giao thức POST `text/plain` JSON. Không lưu bộ câu hỏi hay kết quả.

| action | Quyền | Tham số | data trả về |
|---|---|---|---|
| `login` | — | `username, password` | `{username, name, token, vault}`; sai quá 8 lần trong 15 phút thì tạm khóa |
| `check` | phiên | `username, token` | `{username, name}`; lỗi nếu phiên hết hạn hoặc tài khoản bị khóa |
| `saveVault` | phiên | `username, token, vault` | `{saved}` — `vault` là chuỗi đã mã hóa AES-GCM ở trình duyệt (khóa suy từ mật khẩu bằng PBKDF2) |
| `changePassword` | phiên | `username, token, password, new_password, vault` | `{changed}` |
| `adminList` / `adminCreate` / `adminSetLocked` / `adminResetPassword` / `adminDelete` | `admin_key` | theo tên | danh sách hoặc bản ghi tài khoản (không kèm mật khẩu, không kèm két) |

