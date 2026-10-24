# Từ điển thủ công VI · KR · EN

Trang `/tu-dien-vi-kr/` có hai chế độ: **Tra cứu & học** và **Nhập mục mới**.
Không cần chọn bài, Content ID hoặc mục trích xuất để nhập. Các trường gồm:
Tiếng Việt, tiếng Hàn, tiếng Anh, ví dụ sử dụng bằng tiếng Hàn, ghi chú và lĩnh vực.
Ba ngôn ngữ và lĩnh vực là bắt buộc; ví dụ, ghi chú và liên kết bài nguồn tùy chọn.

Tất cả ô văn bản dùng textarea nhiều dòng, không có giới hạn ký tự ứng dụng,
không cắt nội dung hoặc giới hạn từ/câu. Dữ liệu giữ nguyên Unicode và xuống dòng.
Thẻ kết quả chỉ hiển thị bản xem trước; hộp chi tiết và sao chép giữ toàn bộ nội dung.
Dung lượng thực tế vẫn phụ thuộc bộ nhớ trình duyệt và giới hạn file/API GitHub.
Có thể tải bản nháp JSON, kể cả khi chưa điền xong. Không lưu token trong bản nháp.

## Lưu dữ liệu

Người nhập xác nhận đã kiểm tra nội dung trước khi xuất bản. Dùng fine-grained
GitHub token giới hạn `blogco/blogmoi`, quyền **Contents: Read and write**.
Token chỉ nằm trong bộ nhớ và được gửi tới `api.github.com`; không ghi vào
storage/repository. Trường token được xóa khi bắt đầu gửi.

UI đọc HEAD hiện tại và Git blob của `src/_data/dictionary-data.json`, giữ dữ
liệu cũ và thêm mục mới. Git Data API không dùng payload workflow 65 KB hay
Contents content đọc giới hạn 1 MB. Một commit chỉ sửa file dữ liệu từ điển.
Ref cập nhật không force: thay đổi đồng thời sẽ bị từ chối, giữ nguyên biểu mẫu
để tải bản nháp hoặc thử lại với bản dữ liệu mới. Retry mục có cùng ID/nội dung
không tạo bản trùng. Không ghi đè mục cũ có ID trùng nhưng nội dung khác.

Commit từ người dùng kích hoạt workflow Pages hiện có. UI phân biệt lưu trên
GitHub với việc triển khai hoàn tất; liên kết commit cho phép kiểm tra kết quả.
Bộ trích xuất/import cũ vẫn tồn tại để tương thích, nhưng không còn là điều kiện
cho nhập thủ công. Các mục cũ cùng nguồn bài viết không bị xóa hoặc chuyển đổi.

## Tra cứu

Tìm trên VI/KR/EN, ví dụ tiếng Hàn, ghi chú và lĩnh vực. Có thể lọc lĩnh vực hoặc
độ dài nội dung. Mục thủ công không bắt buộc có bài nguồn hay ví dụ để xuất hiện
trong chỉ mục. Nguồn bài chỉ hiển thị nếu có liên kết nội bộ hợp lệ. Chỉ nội dung
đã xác nhận được đưa vào chỉ mục công khai; giao diện hiển thị dưới dạng text,
không thực thi HTML nhập trong các trường.
