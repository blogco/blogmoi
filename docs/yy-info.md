# YY info

Trang `/yy-info/` dùng nguồn miễn phí, không cần API key hoặc agent trả phí.
Tra lịch/giá vé mở Google Flights; tra số hiệu mở Google Search. Trang không
scrape Google Flights và không hiển thị trạng thái từng chuyến toàn cầu giả.

FAA NAS cung cấp thông báo điều hành tại Mỹ, không phải toàn thế giới. Các
hạn chế sân bay/NOTAM không đồng nghĩa mọi chuyến thương mại bị hủy. METAR từ
Aviation Weather Center là quan trắc tại 30 sân bay được hỗ trợ. Open-Meteo
cung cấp dữ liệu mô hình thời tiết ngay khi người dùng chọn sân bay; giữ liên
kết ghi công nguồn. RSS FlightGlobal chỉ hiển thị tiêu đề gốc và liên kết.

Workflow Pages hiện có thêm cron `*/30 * * * *` để làm mới
`static/data/yy-info.json`, build rồi deploy cùng workflow. GitHub có thể chạy
trễ; trang luôn hiển thị timestamp và báo dữ liệu cũ/lỗi. Lịch bản tin lúc
07:00 GMT+7 vẫn riêng biệt; job 30 phút không tải/chạy model AI hoặc trích từ
điển. Tắt `schedule` tương ứng để ngừng cập nhật. Có thể chạy thủ công bằng
input `refresh_yy_info`. Nguồn lỗi được giữ bản thành công gần nhất cùng timestamp
cũ; không đổi thành số 0 hoặc dữ liệu mới giả. Snapshot đầu tiên đã được lấy thật.

Chạy local: `node --use-env-proxy scripts/refresh-yy-info.mjs`, sau đó
`npm run build`. Cần Node.js 24; không cần thêm dependency. Open-Meteo có điều
khoản và hạn mức sử dụng API miễn phí riêng, cần xem lại trước khi dùng thương
mại. Các sân bay/địa điểm được khai báo trong `static/js/yy-airports.js`.
