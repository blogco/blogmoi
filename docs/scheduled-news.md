# Bản tin doanh nghiệp hằng ngày

## Lịch và chi phí

Workflow Pages hiện có (`.github/workflows/deploy.yml`) chạy cron `0 0 * * *`:
00:00 UTC, tương đương **07:00 GMT+7**, mỗi ngày. GitHub Actions có thể chạy
trễ khi hàng đợi đông; đây không phải cam kết xuất bản đúng từng phút. Scheduled
workflows chỉ chạy từ default branch. Bật Actions và bảo đảm workflow có quyền
`contents: write` cùng quyền triển khai Pages. GitHub có thể tắt lịch của repo
công khai sau thời gian dài không có hoạt động; kiểm tra Actions nếu lịch dừng.

Không cần thuê Codex/agent hoặc mua API AI. Hai mô hình tải từ Hugging Face và
chạy trên CPU của runner:

- `sshleifer/distilbart-cnn-12-6`: tóm lược nội dung tiếng Anh.
- `Helsinki-NLP/opus-mt-en-vi`: chuyển bản tóm lược sang tiếng Việt.

Không gửi bài viết tới dịch vụ suy luận AI. Lần đầu tải model có thể mất vài
phút và vài GB lưu trữ; các lần sau dùng cache của Actions. Mô hình được tải
bằng Transformers, không chạy mã tùy ý của model (`trust_remote_code=False`).
Hai model được ghim SHA revision trong `scripts/news/local_brief.py`; script
in revision đã tải vào log để truy vết. Dependency Python trực tiếp được ghim phiên bản.

GitHub có hạn mức runner, lưu trữ và quy định tính phí riêng. Runner tiêu chuẩn
cho repo công khai thường không tính phút; repo riêng có hạn mức theo gói.
Tính năng không đòi trả tiền API nhưng không thể bảo đảm hạ tầng miễn phí vĩnh
viễn. Không dùng runner lớn hay GPU, không tự cấu hình ngân sách trả phí.

## Quy trình

1. Kiểm tra bài Markdown: nếu đã có `scheduledNewsDate` của hôm nay theo GMT+7,
   dừng mà không tạo thêm bài.
2. Đọc trang Companies của The Korea Times; lấy bài mới nhất chưa từng dùng,
   ngày trên URL không ở tương lai và không cũ quá 3 ngày. Cùng ngày giữ thứ tự
   trên trang chuyên mục.
3. Chỉ chấp nhận URL HTTPS của `www.koreatimes.co.kr/business/companies/...`.
   Redirect sang host khác bị từ chối. Không vượt paywall hoặc CAPTCHA.
4. Đọc nội dung công khai và ngày đăng. Chỉ có tiêu đề, lỗi HTTP, thiếu nội dung,
   nguồn quá dài, model lỗi hoặc bằng chứng không đạt thì **không tạo bài**.
5. Tóm lược ngắn bằng model chạy local rồi dịch tiếng Việt. Mỗi đoạn phải có
   câu bằng chứng tồn tại trong nguồn và vượt kiểm tra độ tương đồng; số liệu
   trong đoạn dịch phải xuất hiện trong bằng chứng. Giới hạn 180 từ và tối đa
   35% số từ của nguồn; không đăng bản dịch toàn văn tự động.
6. Tạo Markdown có link nguồn, ngày nguồn, thông báo biên soạn tự động; không lấy
   ảnh của báo. Không bịa tên tác giả nếu không xác minh được.
7. Build và kiểm tra đầu ra trước khi commit. Commit bài mới cùng dữ liệu từ
   điển và trạng thái chủ đề do build đồng bộ bằng `GITHUB_TOKEN`, rebase thay đổi mới rồi build lại trước khi deploy
   trong **cùng workflow**. Không cần PAT hoặc workflow triển khai thứ hai:
   push bằng `GITHUB_TOKEN` không tự kích hoạt workflow push khác.

Chống trùng dùng cả URL nguồn và ngày xuất bản của bản tin, lưu trong front
matter. Workflow dùng concurrency của Pages; tối đa một job xuất bản trong cùng
nhóm chạy tại một thời điểm. Không có bài phù hợp thì bỏ qua tạo bài, vẫn có thể
build/deploy site hiện có. Nếu job thất bại, xem Actions log và chạy lại sau khi
khắc phục; không đăng nội dung dự phòng tự bịa. Kiểm tra bằng chứng tự động không
thay thế biên tập viên và không bảo đảm model không mắc lỗi dịch.

## Bài ngày 23-10-2026

Bài `src/posts/sk-hynix-dung-xem-xet-niem-yet-solidigm-tai-my.md` được biên tập từ
nội dung đầy đủ do chủ blog cung cấp, tác giả gốc Kang Seung-woo. Bài có
`scheduledNewsDate: "2026-10-23"`, nên không tạo thêm một bản tin tự động cùng
ngày. Không sử dụng lại ảnh Yonhap.

## Chạy thủ công

Trong GitHub: **Actions → Deploy Eleventy site to GitHub Pages → Run workflow**.
Để `news_source_url` trống nếu chỉ build/deploy hoặc nhập URL bài Companies để
viết một bản tin cho ngày hiện tại. Giới hạn một bản tin/ngày và chống trùng URL
vẫn áp dụng. Không ghép input vào lệnh shell; workflow truyền bằng biến môi
trường. Bài của hôm nay đã được viết sẵn, không cần chạy tạo lại.

Trên máy local (Node 24, Python 3.11; không thêm model vào repository):

```sh
cd /workspace/blogmoi
npm ci
python3 -m venv /workspace/blogmoi/.cache/news-venv
.cache/news-venv/bin/python -m pip install torch==2.8.0 --index-url https://download.pytorch.org/whl/cpu
.cache/news-venv/bin/python -m pip install -r scripts/news/requirements.txt
NEWS_PYTHON=.cache/news-venv/bin/python node scripts/publish-scheduled-news.mjs --dry-run
```

`--dry-run` vẫn đọc nguồn và chạy model nhưng không ghi Markdown. Nếu hôm nay đã
có bản tin thì bỏ qua trước khi tải model. Không có chế độ bỏ qua kiểm tra nguồn.
Trong môi trường cloud giới hạn mạng, cần cho phép host báo, Hugging Face và các
host tải model bên cạnh registry Python/PyTorch đã có. Google hoặc Internet
Archive không được dùng tự động: kết quả tìm kiếm có thể thiếu/ngày cũ và bản
lưu có thể khác bài hiện tại. Có thể dùng bản nguồn công khai do chủ blog cung
cấp để biên tập thủ công, như bài ngày 23-10-2026.

## Kiểm tra

```sh
npm run build
node --test --test-concurrency=1 tests/*.test.mjs
python3 -m unittest discover -s tests -p 'scheduled_news_test.py'
npm run lint
git diff --check
```

Các bài test dùng fixtures hư cấu kiểm tra chọn nguồn, timezone, chống trùng,
nguồn lỗi/paywall, bằng chứng, dữ liệu không an toàn và thứ tự build/commit.
Test fixture không xác nhận khả năng đọc website thật hay suy luận model thật.
Muốn xác nhận end-to-end cần một lần chạy thực tế có mạng và đủ tài nguyên;
không gọi tính năng đã vận hành thành công chỉ vì đã cấu hình cron.

Hai model đều khai báo giấy phép Apache-2.0 trong metadata Hugging Face tại
revision đã ghim. Không commit trọng số model, cache hoặc môi trường Python
vào Git.
