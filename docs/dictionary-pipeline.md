# Từ điển VI-KR: backfill, dịch, duyệt và xuất bản

## Quét bài cũ trong GitHub Actions

Trong repository, mở **Actions → Deploy Eleventy site to GitHub Pages → Run workflow**, chọn nhánh đang xuất bản và để `Mode` là **backfill**. Workflow đọc toàn bộ Markdown trong `src/posts/`, `src/en/` và `src/ko/`, bỏ bài có `draft: true`, `published: false` hoặc ngày xuất bản trong tương lai. `lang` trong front matter được ưu tiên; nếu không có, script dùng thư mục ngôn ngữ và dấu hiệu trong nội dung.

Mỗi bài được nhận diện bằng SHA-256 của nội dung. Bài có hash không đổi dùng lại kết quả trích xuất; bài lỗi hoặc mục chưa dịch vẫn nằm trong hàng chờ để thử lại. Candidate lưu thuật ngữ nguyên văn, ngôn ngữ nguồn, ngữ cảnh, lĩnh vực, route bài viết, hash và trạng thái.

Workflow dùng `GITHUB_TOKEN` với `contents: write` để commit `data/dictionary/pending.json` trở lại đúng nhánh. Nếu quyền token hoặc branch protection chặn ghi, bước lưu hàng chờ thất bại và workflow báo lỗi; artifact `dictionary-review-queue` 90 ngày là bản cứu hộ. Commit chỉ thay file hàng chờ nên bị `paths-ignore`, không tạo vòng lặp deployment. Sau khi build, workflow báo riêng số bài quét, cache, candidate, bản dịch, chờ duyệt, mục trong chỉ mục build và tình trạng Pages.

Quét cục bộ:

```sh
npm run dictionary:extract
```

Hàng chờ nằm trong `data/dictionary/pending.json`; file này không được xuất ra website. Trạng thái `extracted` nghĩa là mới lấy thuật ngữ, `translation_failed` có thể chạy lại, `translated` là bản nháp chưa duyệt. Các trạng thái này không được đưa vào tìm kiếm công khai.

## Cấu hình bản dịch tự động (tùy chọn)

Workflow hiện chưa có thông tin credential dịch. Để bật dịch, đặt trong **Settings → Secrets and variables → Actions**:

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
