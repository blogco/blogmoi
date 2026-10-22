# Từ điển VI-KR: backfill, dịch, duyệt và xuất bản

## Quét bài cũ từ trang từ điển

Ở trang `/tu-dien-vi-kr/`, chọn **Cập nhật từ vựng từ bài viết cũ**. Liên kết mở **Actions → Deploy Eleventy site to GitHub Pages**; nó không tự chạy workflow. Người vận hành phải đăng nhập GitHub, có quyền ghi repository, chọn nhánh đang xuất bản và chọn **Run workflow** với `Mode` là **backfill**. Khách truy cập công khai không có quyền khởi chạy job.

Push tự động và lần chạy thủ công gọi cùng `scripts/extract-dictionary.mjs`; không có thuật toán riêng cho bài cũ. Script đọc Markdown trong `src/posts/`, `src/en/` và `src/ko/`, bỏ bài có `draft: true`, `published: false`, `type` không phải `article` hoặc ngày xuất bản trong tương lai. `lang` trong front matter được ưu tiên; nếu không có, script dùng thư mục ngôn ngữ và dấu hiệu trong nội dung. Cả hai cách chạy đều chuyển các candidate qua cùng script dịch và quy tắc duyệt hiện tại.

Mỗi bài được nhận diện bằng SHA-256 của nội dung. Bài có hash không đổi dùng lại kết quả trích xuất; bài có nội dung mới hoặc candidate lỗi/chưa dịch được thử lại. Candidate lưu thuật ngữ nguyên văn, ngôn ngữ nguồn, ngữ cảnh, lĩnh vực, route bài viết, hash và trạng thái. `lastRun` trong hàng chờ lưu thời điểm và số liệu của lần quét gần nhất; trang từ điển hiển thị các số liệu đó cùng số mục đang chờ dịch, chờ biên tập, lỗi và đã xuất bản. Đây là bản ghi đã lưu, không phải tiến độ trực tiếp.

Workflow dùng `GITHUB_TOKEN` với `contents: write` để commit `data/dictionary/pending.json` trở lại đúng nhánh. Nếu quyền token hoặc branch protection chặn ghi, bước lưu hàng chờ thất bại và workflow báo lỗi; artifact `dictionary-review-queue` 90 ngày là bản cứu hộ. Commit chỉ thay file hàng chờ nên bị `paths-ignore`, không tạo vòng lặp deployment. Sau khi build, workflow báo riêng số bài quét, cache, candidate, bản dịch, chờ duyệt, mục trong chỉ mục build và tình trạng Pages. Trang từ điển liên kết tới lần chạy gần nhất để người vận hành xem log và báo cáo.

## Ánh xạ trạng thái

- Chưa xử lý: chưa có hash bài viết trong `articleCache`.
- Đã trích xuất: hash được lưu trong `articleCache`; candidate ở trạng thái `extracted` hoặc `pending_translation` đang chờ dịch.
- Chờ duyệt: candidate ở `translated` hoặc `pending_review`; bản nháp chưa xuất hiện trong tìm kiếm.
- Lỗi: `translation_failed`; lần chạy tiếp theo có thể thử lại. Lỗi của job được ghi trong báo cáo GitHub Actions.
- Hoàn tất: mục hợp lệ có `status: "reviewed"` trong `src/_data/dictionary-data.json`; Eleventy mới đưa mục này vào chỉ mục công khai.

Không lưu trạng thái `PROCESSING` vào dữ liệu công khai. Trong lúc job chạy, trang tiếp tục hiển thị bản ghi gần nhất; log GitHub Actions là nơi xem tiến trình của job đang chạy.

Quét cục bộ:

```sh
npm run dictionary:extract
```

Hàng chờ nằm trong `data/dictionary/pending.json`; file này không được xuất ra website. Trạng thái `extracted` nghĩa là mới lấy thuật ngữ, `translation_failed` có thể chạy lại, `translated` là bản nháp chưa duyệt. Các trạng thái này không được đưa vào tìm kiếm công khai.

## Cấu hình bản dịch tự động (tùy chọn)

Để bật dịch tự động, cấu hình trong **Settings → Secrets and variables → Actions**:

- Secret `OPENAI_API_KEY` chứa key riêng của repository; không ghi key vào source, log hoặc front end.
- Variable `DICTIONARY_OPENAI_MODEL` chứa model ID được tài khoản API sử dụng cho Responses API.

Không có một trong hai giá trị, workflow lưu các từ ở trạng thái chờ dịch và ghi cách xử lý vào log/report; không giả lập bản dịch. Lỗi request cũng giữ candidate ở `translation_failed` để lần sau thử lại. Build Eleventy vẫn chạy mà không cần credential.

Chạy dịch cục bộ khi đã cấu hình biến môi trường:

```sh
export OPENAI_API_KEY="…"
export DICTIONARY_OPENAI_MODEL="<model-id>"
npm run dictionary:translate
```

Kết quả AI luôn là bản nháp. Workflow không tự duyệt và không tự đưa bản nháp ra website.

## Duyệt và xuất bản

Đọc `data/dictionary/pending.json` và kiểm tra thủ công bản dịch, định nghĩa, ví dụ ba ngôn ngữ, lĩnh vực, ngữ cảnh và bài nguồn. Nếu dịch thủ công, điền `translationDraft.vi`, `.ko`, `.en`, `.definition`, `.examples.vi`, `.examples.ko`, `.examples.en`; đặt `candidate.status` là `translated` sau khi đủ dữ liệu. Không đánh dấu một bản dịch AI là reviewed chỉ vì request thành công.

Sau khi thực sự duyệt mục từ, chạy lệnh xác nhận rõ ID:

```sh
npm run dictionary:approve -- --id=<candidate-id> --approve
```

Lệnh kiểm tra đủ ba ngôn ngữ, ví dụ, định nghĩa, nguồn và trùng lặp; sau đó ghi vào `src/_data/dictionary-data.json` với `status: "reviewed"` và loại candidate khỏi hàng chờ. Candidate có cờ `uncertain` phải được biên tập xử lý trước. Commit hai file dữ liệu lên `main`; Pages workflow sẽ build lại `dictionary-index.json`. Chỉ entry `reviewed` hợp lệ trong dữ liệu nguồn mới được xuất vào chỉ mục tĩnh và tìm kiếm công khai.

## Dữ liệu và URL

`sourceArticle` lưu route nội bộ như `/slug/`; template xử lý path prefix `/blogmoi/` khi tạo chỉ mục. Build chỉ đọc `src/_data/dictionary-data.json`; dữ liệu hàng chờ và bản nháp không vào `_site/`. Xác nhận `dictionary-index.json` sau build có đúng số entry đã duyệt trước khi coi mục từ là đã xuất bản.
