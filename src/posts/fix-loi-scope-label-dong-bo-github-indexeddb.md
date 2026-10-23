---
title: "Một biến thiếu, ba thông báo sai: chuyện sửa lỗi đồng bộ chi tiêu trên Blogmoi"
slug: fix-loi-scope-label-dong-bo-github-indexeddb
description: "Từ lỗi scopeLabel đến luồng đồng bộ GitHub và IndexedDB: cách Blogmoi tìm nguyên nhân, giữ dữ liệu và kiểm chứng bản sửa bằng 105 bài kiểm thử."
seoTitle: "Sửa lỗi scopeLabel, đồng bộ GitHub và IndexedDB trên Blogmoi"
seoDescription: "Hậu trường sửa lỗi Expense Dashboard: biến ngoài scope, thông báo IndexedDB gây hiểu nhầm, xác minh ghi GitHub và giữ hàng chờ để retry an toàn."
canonical: "https://blogco.github.io/blogmoi/fix-loi-scope-label-dong-bo-github-indexeddb/"
date: "2026-10-23T06:31:00+07:00"
lastModified: "2026-10-23T06:31:00+07:00"
lang: vi
author: Blogmoi
categories:
  - Công nghệ
  - Web Development
tags:
  - JavaScript
  - IndexedDB
  - GitHub
  - Testing
  - Blogmoi
editorialNote: "Bài viết ghi lại hotfix 62732ce ngày 23-10-2026. Kết quả kiểm thử và triển khai có phạm vi cụ thể; phiên đồng bộ có xác thực và IndexedDB thực tế trong trình duyệt người dùng chưa được xác minh."
coverSource: unsplash
cover: https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1440&q=80
coverAlt: Trái Đất về đêm nhìn từ không gian.
coverCaption: Ảnh minh họa từ Unsplash; không phải ảnh chụp sự kiện trong bài.
coverAttribution:
  photoUrl: https://unsplash.com/?utm_source=blogmoi&utm_medium=referral
---

Trang [chi phí hàng tháng của Blogmoi](/blogmoi/chi-phi-hang-thang/) từng hiển thị một tổ hợp thông báo rất khó hiểu: đã kết nối tài khoản GitHub, không có giao dịch chờ, có thời điểm đồng bộ thành công gần nhất, nhưng đồng thời lại báo không thể mở kho dữ liệu cục bộ và đồng bộ thất bại.

Nhìn từ giao diện, người dùng khó biết nên kiểm tra mạng, token hay dữ liệu trên thiết bị. Trong mã nguồn, một dấu hiệu cụ thể hơn xuất hiện:

```text
ReferenceError: scopeLabel is not defined
```

Đợt sửa này bắt đầu từ biến `scopeLabel`, nhưng công việc cần làm rộng hơn việc thêm một dòng khai báo. Phải tìm ra vì sao lỗi giao diện bị báo thành lỗi IndexedDB, và vì sao một lần ghi GitHub có thể thành công nhưng cả quy trình vẫn bị trình bày như thất bại.

## Biến có tồn tại, nhưng ở những hàm khác

`scopeLabel` là nhãn mô tả phạm vi thống kê: toàn bộ thời gian hoặc tháng đang chọn. Repository đã có những biến cùng tên trong các hàm khác, nhưng hàm `getInsightRecords()` lại dùng tên này mà không tự khai báo.

Các biến `const` bên trong một hàm không trở thành biến dùng chung cho những hàm còn lại. Vì vậy, việc tìm thấy `scopeLabel` ở nơi khác không có nghĩa các tham chiếu trong `getInsightRecords()` là hợp lệ.

Lỗi còn phụ thuộc dữ liệu. Khi không có giao dịch trong phạm vi đang xem, hàm trả về sớm. Khi có dữ liệu, những nhánh tạo nhận xét về cà phê hoặc cơ cấu chi tiêu mới chạm tới biến chưa được định nghĩa.

Điều đó giải thích tại sao một trang trống có thể không bộc lộ lỗi, còn dashboard có dữ liệu lại gặp sự cố ngay khi tải lên hoặc sau đồng bộ.

Bản sửa đặt nhãn đúng trong hàm cần sử dụng nó. Đoạn dưới đây rút gọn phần thay đổi:

```js
function getInsightRecords(transactions, summary, comparison, selection) {
  const scopeLabel = selection.period === "all"
    ? "toàn bộ thời gian"
    : monthLabel(selection.period).toLocaleLowerCase("vi-VN");

  if (!summary.count) return [];
  // Các nhận xét bên dưới sử dụng nhãn của chính phạm vi đang xem.
}
```

Không cần kiểm tra `typeof scopeLabel` hay thêm một giá trị dự phòng để tránh exception. Ý nghĩa của biến đã rõ; phần thiếu là khai báo ở đúng lexical scope.

## Vì sao lỗi render lại mang tên IndexedDB?

Quá trình khởi tạo trang gồm nhiều việc: mở IndexedDB, đọc giao dịch, lấy metadata rồi dựng dashboard. Catch ở cuối quá trình này lại gắn mọi exception với thông báo không thể mở kho giao dịch cục bộ.

Vì vậy, ngay cả khi lỗi phát sinh trong bước tạo nhận xét, thông báo vẫn hướng người dùng về kho lưu trữ. Dòng chữ trên giao diện không chứng minh được rằng thao tác mở IndexedDB đã thất bại.

Đây là phần gây hiểu nhầm đáng kể của sự cố. Một lỗi JavaScript có địa chỉ tương đối rõ đã bị chuyển thành tín hiệu chẩn đoán sai tầng.

Bản sửa phân biệt lỗi lưu trữ với lỗi giao diện và gắn thông báo với mã lỗi, thao tác cụ thể. Lỗi đọc dữ liệu cục bộ và lỗi render dashboard cần được ghi nhận riêng để người sửa có thể đi tới đúng bước bị hỏng.

## “Đã kết nối” trả lời một câu hỏi khác với “đã đồng bộ”

Những thông tin từng xuất hiện cùng nhau thực ra thuộc bốn tầng trạng thái độc lập:

| Tầng | Thông tin cần thể hiện |
|---|---|
| Xác thực GitHub | Có kết nối tài khoản hay gặp lỗi xác thực |
| IndexedDB | Kho cục bộ đang được đọc, sẵn sàng, lỗi hoặc không khả dụng |
| Đồng bộ cloud | Đang chạy, đã xác minh, không có thay đổi, thất bại hoặc chưa xác minh |
| Hàng chờ | Có bao nhiêu thay đổi và quá trình xử lý đã tới đâu |

Một token hợp lệ chưa chứng minh rằng dữ liệu đã được ghi. Thời điểm xác minh trước đó chỉ là lịch sử. Số giao dịch chờ bằng không được tính so với baseline cục bộ cũng chưa chứng minh GitHub không có thay đổi từ thiết bị khác.

Sau khi sửa, số lượng chờ được mô tả rõ là so với lần xác minh trước. Luồng Sync vẫn đọc cloud khi số này bằng không, thay vì dùng nó làm lý do bỏ qua đối chiếu.

## Ghi được GitHub rồi, nhưng bước tiếp theo hỏng thì sao?

Luồng cũ đặt thao tác đồng bộ, cập nhật IndexedDB và render trong cùng một khối xử lý lỗi. Nếu GitHub nhận dữ liệu nhưng bước sau bị lỗi, giao diện có thể chỉ còn một thông báo thất bại chung.

Bản sửa lưu checkpoint trước khi gọi đồng bộ. Sau khi đọc cloud và SHA hiện tại, chương trình hợp nhất dữ liệu theo ID, dùng baseline để nhận biết phía nào đã thay đổi. Nếu cùng một giao dịch bị sửa khác nhau ở hai phía, quá trình dừng để người dùng chọn cách xử lý. Không tự chọn bản có thời gian mới hơn để giải quyết mọi xung đột.

Chỉ khi có thay đổi cần ghi, ứng dụng mới gửi PUT. Sau phản hồi ghi, một GET tiếp theo kiểm tra lại SHA và nội dung đã chuẩn hóa. Nếu chưa đối chiếu được, kết quả được giữ ở trạng thái chưa xác minh; baseline cục bộ chưa được cập nhật để coi hàng chờ là đã xử lý.

Khi đã xác minh cloud, chương trình giữ lại kết quả đó ngay cả khi cập nhật metadata hoặc render thất bại. Người dùng cần biết cả hai sự thật: GitHub đã được xác nhận, còn bước cục bộ hoặc giao diện chưa hoàn tất.

Việc áp dụng dữ liệu và metadata trên thiết bị nằm trong một transaction IndexedDB. Những chỉnh sửa phát sinh trong lúc yêu cầu mạng đang chạy được giữ lại để tiếp tục đồng bộ. Checkpoint chỉ được xóa khi bước áp dụng hoàn tất.

## Kiểm thử phải đi qua đường từng gây lỗi

Đợt hotfix bổ sung lint để phát hiện biến chưa khai báo trong JavaScript tĩnh. Bộ kiểm thử được mở rộng sang IndexedDB giả lập, GitHub giả lập và DOM của bản build production.

Các tình huống được kiểm tra gồm dữ liệu có sẵn khi khởi động, cloud file chưa tồn tại hoặc đã tồn tại, hai phía giống nhau, thay đổi riêng ở mỗi phía, xung đột, offline rồi online, nhấn Sync liên tiếp và reload.

Những nhánh quan trọng khác là GitHub trả về 401, 403, 409, 422 hoặc 5xx; ghi thành công nhưng cập nhật metadata thất bại; ghi thành công nhưng UI lỗi; và hàng chờ cục bộ bằng không trong khi cloud có dữ liệu khác. Kiểm thử transaction bị abort cũng xác nhận dữ liệu và metadata được rollback cùng nhau.

Kết quả tại thời điểm chốt hotfix: **105 bài kiểm thử đạt**, lint đạt và production build thành công. Con số 105 là tổng của bộ kiểm thử chạy trong phiên đó, bao gồm cả các bài kiểm thử sẵn có của repository.

Các yêu cầu ghi trong kiểm thử đều đi vào dịch vụ GitHub giả lập. Không tạo commit thử trên giao dịch thật, không reset hay xóa IndexedDB của người dùng, không thay đổi phiên bản database hoặc schema cloud. Checkpoint là trường tùy chọn trong metadata hiện có và có kiểm thử tương thích.

## Đã deploy, còn phần nào chưa xác minh?

Hotfix được ghi nhận tại commit [`62732ce`](https://github.com/blogco/blogmoi/commit/62732cee24baf0538d0a5845c6bfb5a044b7771c). [GitHub Actions run 39872065193](https://github.com/blogco/blogmoi/actions/runs/39872065193) triển khai thành công. HTML của trang chi tiêu và ba module JavaScript public đã được đối chiếu, khớp với bản build được kiểm thử. SHA của file dữ liệu cloud cũng không đổi giữa hai lần kiểm tra trước và sau triển khai.

Tuy nhiên, kiểm thử DOM dùng jsdom và fake-indexeddb không phải kiểm thử trình duyệt thật. Kết nối Browser trong phiên sửa lỗi không khả dụng, nên chưa xác minh được phiên Sync có xác thực hoặc IndexedDB thực tế trên thiết bị người dùng. Vì giới hạn đó, báo cáo cuối vẫn ghi `PARTIAL`.

Đợt sửa này cho thấy một thông báo lỗi cần phản ánh đúng thao tác đã thất bại. Khi phần đọc dữ liệu, ghi cloud và render có kết quả riêng, người dùng mới biết dữ liệu đã đi tới đâu và bước nào cần thử lại. Còn người sửa có thể bắt đầu từ bằng chứng cụ thể, thay vì đoán theo một dòng cảnh báo gây hiểu nhầm.

Chi tiết kỹ thuật và phạm vi kiểm chứng được lưu trong [biên bản hotfix của repository](https://github.com/blogco/blogmoi/blob/62732cee24baf0538d0a5845c6bfb5a044b7771c/docs/expense-sync-hotfix.md).
