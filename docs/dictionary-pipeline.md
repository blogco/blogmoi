# Từ điển VI-KR-EN

## Quy trình

GitHub Actions quét bài Markdown đã xuất bản trong `src/posts/`, `src/en/` và `src/ko/`. Bộ trích xuất không gọi dịch vụ AI: nó lấy mục có trong `dictionaryTerms`, cụm được nhấn mạnh trong Markdown và tag có mặt trong nội dung. Mỗi mục giữ Content ID, đường dẫn bài gốc, ngôn ngữ nguồn, content hash và câu chứa từ.

Trang `/tu-dien-vi-kr/` có hai phần làm việc:

1. Chọn bài, xem danh sách từ/cụm và ngữ cảnh gốc. Có thể sao chép danh sách đã chọn để dịch bên ngoài.
2. Điền ba cột VI/KR/EN, đánh dấu từng mục đã kiểm tra, rồi gửi cho workflow bằng fine-grained GitHub token.

Workflow xác nhận token dispatch chỉ mở đúng một bài trong hàng chờ, hash bài còn hiện hành, các candidate ID hợp lệ, mọi bản dịch đã được đánh dấu và đủ ba ngôn ngữ. Workflow dùng `GITHUB_TOKEN` của Actions để ghi `src/_data/dictionary-data.json`, xóa các mục đã duyệt khỏi hàng chờ, chạy Eleventy rồi deploy. Mục từ cũ đã duyệt không bị ghi đè; mục trùng được giữ nguyên.

## Cấp token cho giao diện

Tạo fine-grained personal access token giới hạn vào repository `blogco/blogmoi`, cấp quyền repository `Actions: Read and write`, sau đó nhập token vào ô trong trang từ điển. Trang chỉ gửi token tới GitHub REST API để gọi `workflow_dispatch`; không lưu token trong local storage, session storage, JSON hay repository. Có thể thu hồi token trong GitHub bất cứ lúc nào.

Workflow chỉ nhận payload bản dịch tối đa 60 mục cho một bài và từ chối payload quá lớn. Token không có quyền sửa nội dung repository trực tiếp; workflow xác thực payload và ghi đúng hai file dữ liệu từ điển.

## Lệnh cục bộ

```sh
npm run dictionary:sync
npm run dictionary:import # chỉ chạy trong workflow_dispatch có dictionary_payload
npm run build
```

Danh sách candidate công khai được build thành `dictionary-candidates.json` để giao diện đọc. Chỉ mục tra cứu `dictionary-index.json` chỉ chứa mục có đủ ba ngôn ngữ và trạng thái `reviewed` hoặc `published`.

## Lưu dữ liệu và chống workflow loop

Workflow commit `data/dictionary/pending.json` và `src/_data/dictionary-data.json` về `main` trước khi build. Push-trigger bỏ qua đúng hai file dữ liệu này nên commit tự động không tạo vòng lặp; build hiện tại vẫn dùng ngay dữ liệu vừa lưu.
