# Từ điển VI-KR: quy trình biên tập

## Quét bài viết

Mỗi lần Pages workflow chạy, `npm run dictionary:extract` quét tất cả Markdown đã xuất bản trong `src/posts/`, `src/en/` và `src/ko/`. Bản nháp bị bỏ qua. Candidate lấy từ `dictionaryTerms` (nếu bài khai báo), cụm được nhấn mạnh và tag có xuất hiện trong nội dung. Mỗi candidate lưu ngôn ngữ nguồn, lĩnh vực, URL bài gốc, ngữ cảnh trích dẫn ngắn, hash nội dung và trạng thái xử lý.

Workflow lưu `data/dictionary/pending.json` thành artifact **dictionary-review-queue** trong 30 ngày. Nút “Cập nhật từ bài viết cũ” mở trang workflow; người có quyền repository chọn **Run workflow** để quét lại toàn bộ bài cũ. Việc quét không tự phát hành mục từ.

Để quét cục bộ trước khi gửi bài:

```sh
npm run dictionary:extract
```

Lệnh cập nhật hàng chờ tại `data/dictionary/pending.json`. Không đặt file hàng chờ trong `src/`; nó không được đưa vào trang tĩnh hoặc chỉ mục tìm kiếm.

## Bản dịch tùy chọn

Thiết lập key trong môi trường máy cá nhân, không thêm key vào repository. Chọn model được cấp quyền cho tài khoản API:

```sh
export OPENAI_API_KEY="…"
export DICTIONARY_OPENAI_MODEL="<model-id>"
npm run dictionary:translate
```

Lệnh gửi thuật ngữ cùng ngữ cảnh ngắn tới OpenAI Responses API, ghi kết quả dưới dạng `translationDraft` với trạng thái `pending_review`, và giữ nguyên candidate nguồn. Model chỉ chạy khi chủ biên tập gọi lệnh này; build Eleventy và Pages không cần key, không gọi API. Kết quả có cấu trúc nhưng vẫn cần người kiểm tra nghĩa, ví dụ, lĩnh vực và nguồn.

## Duyệt và xuất bản

Sau khi kiểm tra candidate, thêm mục từ đã hoàn thiện vào `src/_data/dictionary-data.json` với các trường `id`, `vi`, `ko`, `en`, `definition`, `examples` (đủ `vi`, `ko`, `en`), `field`, `sourceLanguage`, `sourceArticle`, `sourceContext`, `updatedAt` và `status: "reviewed"`. `sourceArticle` là route nội bộ, ví dụ `/slug/`. Chỉ các mục có đủ ba bản dịch, ba ví dụ, định nghĩa, nguồn và trạng thái `reviewed` được xuất vào `dictionary-index.json`.

`dictionaryTerms` có thể được thêm vào front matter để chủ động chỉ định thuật ngữ quan trọng:

```yaml
dictionaryTerms:
  - "Thuật ngữ có trong bài"
```

Không ghi candidate chưa được duyệt vào dữ liệu công khai. Build chỉ đọc dữ liệu reviewed; nội dung trong hàng chờ và bản dịch nháp không nằm trong website.
