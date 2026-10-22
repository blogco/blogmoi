---
title: "Vì sao Blogmoi chọn Be Vietnam Pro? Hành trình xây dựng Typography mạnh mẽ và tối ưu cho tiếng Việt"
slug: vi-sao-blogmoi-chon-be-vietnam-pro
description: "Case study từ CSS và font assets của Blogmoi: lý do dùng Be Vietnam Pro, subset tiếng Việt, thang chữ responsive, tải WOFF2 và cách typography đi qua Eleventy."
seoTitle: "Vì sao Blogmoi chọn Be Vietnam Pro? Typography cho tiếng Việt"
seoDescription: "Tìm hiểu cách Blogmoi tự host Be Vietnam Pro bằng WOFF2, chia subset Latin/Vietnamese, preload weight 500, dùng font-display: swap và tổ chức typography trong Eleventy."
canonical: "https://blogco.github.io/blogmoi/vi-sao-blogmoi-chon-be-vietnam-pro/"
date: 2026-10-22
lastModified: 2026-10-22
lang: vi
author: Blogmoi
categories:
  - Công nghệ
  - Web Design
tags:
  - Typography
  - Be Vietnam Pro
  - Web Fonts
  - CSS
  - Vietnamese Fonts
  - Eleventy
  - UI/UX
keyPoints:
  - Blogmoi tự host Be Vietnam Pro dạng WOFF2, gồm ba trọng lượng thường 500, 700 và 800, mỗi trọng lượng có subset Latin và Vietnamese.
  - "CSS dùng @font-face với unicode-range và font-display: swap; phần head preload hai subset weight 500 dùng cho body."
  - Thang chữ tách body, tiêu đề, điều hướng, card và metadata, dùng clamp() cùng breakpoint mobile; CSS weight ngoài 500/700/800 được ghép về face gần nhất.
  - Be Vietnam Pro phù hợp với định hướng tiếng Việt theo thiết kế và metadata của font; repository không ghi nhận benchmark hay kiểm thử người dùng so sánh với Inter hoặc IBM Plex Sans.
  - Eleventy sao chép font và stylesheet trong static/ vào _site; Nunjucks head/layout gắn chúng vào trang mà không cần dịch vụ font ngoài.
sourcePublisher: "Google Fonts — Be Vietnam Pro"
sourceUrl: "https://github.com/google/fonts/blob/main/ofl/bevietnampro/METADATA.pb"
copyrightHolder: "Blogmoi"
editorialNote: "Case study được đối chiếu với source và font assets của Blogmoi tại ngày 22-10-2026. Nhận định về hiệu năng chỉ dựa trên cấu hình; repository không có benchmark, CLS hay nghiên cứu người dùng."
faq:
  - question: "Blogmoi đang phân phối những trọng lượng Be Vietnam Pro nào?"
    answer: "Ba trọng lượng thường: 500, 700 và 800. Mỗi trọng lượng có WOFF2 Latin và Vietnamese. Đây là tập con được chọn cho site; catalog font upstream có nhiều weight hơn."
  - question: "Tại sao chỉ preload weight 500?"
    answer: "Body dùng weight 500 nên hai subset Latin và Vietnamese được ưu tiên tải. Weight 700 và 800 vẫn được khai báo và tải khi cần cho tiêu đề, nhãn hoặc nút."
  - question: "Blogmoi có file italic hoặc variable font không?"
    answer: "Các file đang phân phối là style normal ở weight 500, 700 và 800; chưa có file italic hay variable được khai báo. CSS cho phép tổng hợp style italic, còn weight tổng hợp bị tắt; weight yêu cầu ngoài ba face sẽ được ghép với face gần nhất."
  - question: "font-display: swap có bảo đảm không dịch chuyển layout không?"
    answer: "Không. swap cho chữ fallback xuất hiện trong lúc font tải rồi đổi sang Be Vietnam Pro. Nếu metrics khác nhau, dòng có thể xuống hàng lại. Repo chưa có đo CLS hoặc font metric overrides để khẳng định layout shift đã được loại bỏ."
  - question: "Bài nào giải thích pipeline Eleventy của Blogmoi?"
    answer: "Xem bài Xây dựng blog tĩnh với Eleventy (11ty): Tech Stack, kiến trúc và hướng dẫn từ A–Z để đọc về Markdown, Nunjucks, thư mục static, _site và GitHub Pages."
---

Typography là một phần của trải nghiệm đọc kỹ thuật. Một font cần phân biệt tốt chữ cái gần nhau, giữ dấu tiếng Việt rõ ở cỡ nhỏ, đồng thời tạo nhịp nhất quán giữa tiêu đề, đoạn văn, metadata và code. Bài này lần theo quyết định của Blogmoi từ font stack và WOFF2 đến cách stylesheet được đưa qua Eleventy. Các cấu hình dưới đây được đọc trực tiếp từ mã nguồn; hiệu năng và tính dễ đọc không được mô tả như kết quả benchmark khi chưa có phép đo.

## Hướng thiết kế: Bold Editorial / Masculine Corporate

Có thể mô tả hướng hình ảnh của Blogmoi là **Bold Editorial / Masculine Corporate**: navy làm màu nền và màu chữ chính, teal tạo điểm nhấn, còn các tiêu đề và điều hướng dùng trọng lượng đậm. Typography.css áp dụng cùng họ sans-serif cho body, heading, logo và card, thay cho cách tách serif hệ thống cho tiêu đề như phiên bản trước. Kết quả hướng đến cảm giác hiện đại, rõ ràng và tự tin mà vẫn nhất quán ở các thành phần giao diện.

Đây là nhận định thiết kế rút ra từ token và component hiện có, không phải nhãn thương hiệu được chứng minh bằng nghiên cứu người dùng. Phần kỹ thuật quan trọng là hệ thống chỉ định cụ thể font, weight, line-height, cỡ chữ và breakpoint thay vì dựa vào kiểu mặc định của trình duyệt.

## Chọn Be Vietnam Pro, cân nhắc Inter và IBM Plex Sans

Be Vietnam Pro được chọn vì đây là sans-serif có mục tiêu sử dụng tiếng Việt rõ ràng. Metadata của dự án trong Google Fonts liệt kê các weight 100–900, kiểu thường/nghiêng và subset Vietnamese; mô tả font đề cập đến việc tinh chỉnh letterform có dấu. Blogmoi tự host một tập con phù hợp với giao diện thay vì tải cả họ font: normal 500, 700 và 800. [Metadata chính thức trên Google Fonts](https://github.com/google/fonts/blob/main/ofl/bevietnampro/METADATA.pb), [mô tả font](https://github.com/google/fonts/blob/main/ofl/bevietnampro/DESCRIPTION.en_us.html).

**Inter** là ứng viên đối chứng đa dụng, có thiết kế cho UI lẫn nội dung hiển thị, optical size và dải weight rộng. **IBM Plex Sans** có cá tính kỹ thuật và hệ subfamily phong phú; IBM ghi nhận hỗ trợ Extended Latin, gồm tiếng Việt. Có thể đánh giá chúng qua độ rõ của dấu, hình dáng chữ, độ rộng dòng, cách thể hiện số và code. Đây là so sánh dựa trên đặc tính font và phán đoán thiết kế, không phải báo cáo thử nghiệm: repository không có bản render song song, benchmark hay khảo sát đọc giữa ba lựa chọn. [Inter](https://rsms.me/inter/), [IBM Plex](https://www.ibm.com/design/language/typography/typeface/).

## Hỗ trợ tiếng Việt: Unicode và subset dấu

Tiếng Việt dùng chữ Latin mở rộng với dấu thanh và dấu phụ. Một nguyên âm có thể là ký tự dựng sẵn hoặc kết hợp chữ cái nền với dấu Unicode; font vì thế cần đủ glyph và bố trí dấu phù hợp. Câu kiểm tra nên có chữ thường, chữ hoa, các nguyên âm ơ/ư và nhiều dấu như: **“ă â đ ê ô ơ ư Á Ắ Ặ Ề Ể Ữ Ỷ”**.

Trong `static/css/fonts.css`, mỗi weight có hai face: subset Latin và subset Vietnamese. `unicode-range` của phần tiếng Việt bao gồm các ký tự như `U+0102–U+0103`, `U+0110–U+0111`, dấu kết hợp `U+0300–U+0329`, dải `U+1EA0–U+1EF9` và ký hiệu đồng `U+20AB`. Cách chia này cho phép trình duyệt lấy đúng glyph theo văn bản; tên file và danh sách range có thể kiểm tra trực tiếp trong source. Nếu subset thiếu combining mark, dấu có thể bị fallback sang font khác, lệch vị trí hoặc không xuất hiện. Google Fonts liệt kê Vietnamese như một subset riêng của family. [Google Fonts metadata](https://github.com/google/fonts/blob/main/ofl/bevietnampro/METADATA.pb).

## Thang chữ thực tế

Các giá trị dưới đây đọc từ `static/css/typography.css` và `static/css/article.css`. `rem` quy đổi theo root mặc định 16px; cỡ `clamp()` thay đổi theo viewport. CSS layer `typography` được khai báo sau layer `article`, nên quy tắc scale trong file typography quyết định style cuối khi cùng selector.

| Thành phần | Desktop | Mobile | Weight / line-height |
| --- | --- | --- | --- |
| Body toàn site | `clamp(1.0625rem, 1.02rem + .16vw, 1.125rem)` (17–18px) | 1.0625rem (17px) | 500 / 1.75 |
| H1 bài viết | `clamp(42px, 3.4vw, 48px)` | `clamp(30px, 8vw, 34px)` | 800 / 1.2; mobile 1.22 |
| H2 bài viết | `clamp(30px, 2.2vw, 34px)` | `clamp(25px, 4vw, 28px)` | 800 / 1.25 |
| H3 bài viết | `clamp(23px, 1.8vw, 26px)` | `clamp(21px, 3.2vw, 23px)` | 700 / 1.3 |
| Nội dung bài | `clamp(1.1875rem, 1.12rem + .2vw, 1.25rem)` (19–20px) | `clamp(1.0625rem, 4.5vw, 1.125rem)` (17–18px) | 500 / 1.75 |
| Điều hướng | 1rem (16px) | 1rem | 700 / kế thừa 1.75 |
| Tiêu đề card | `clamp(1.25rem, 1.1rem + .4vw, 1.5rem)` | cùng công thức fluid | 700 / 1.3 |
| Metadata bài | 0.9375rem (15px) | 0.875rem (14px) | 500 / 1.5 |

Trang nội dung dùng cỡ chữ lớn hơn body toàn site để hỗ trợ đọc dài. `clamp(min, preferred, max)` cho phép cỡ chữ co giãn trong khoảng đã đặt; breakpoint 767px thay H1–H3 và nội dung bài, còn breakpoint 620px điều chỉnh brand, nav và heading của các khu vực khác. Font files hiện chỉ có weight 500, 700, 800; CSS tắt tổng hợp weight nên các yêu cầu như 650/750/850 được ghép về face gần nhất, thay vì tạo giả độ đậm. Style italic vẫn có thể được tổng hợp vì cấu hình giữ `font-synthesis: style`.

## Cách nạp font và CSS

Một face tiêu biểu trong `static/css/fonts.css`:

```css
@font-face {
  font-family: "Be Vietnam Pro";
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("../fonts/be-vietnam-pro-500-vietnamese.woff2") format("woff2");
  unicode-range: U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169,
    U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309,
    U+0323, U+0329, U+1EA0-1EF9, U+20AB;
}
```

Các rule tương tự khai báo weight 500, 700, 800 cho cả hai subset. WOFF2 là định dạng được chọn; không có request tới Google Fonts CDN khi trang chạy. Token chung trong `typography.css`:

```css
:root {
  --font-sans: "Be Vietnam Pro", "Noto Sans KR", "Apple SD Gothic Neo",
    ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-display: var(--font-sans);
  --type-article: clamp(1.1875rem, 1.12rem + .2vw, 1.25rem);
  --weight-medium: 500;
  --weight-bold: 700;
  --weight-heavy: 800;
  --leading-body: 1.75;
}
```

`font-display: swap` giữ chữ fallback hiển thị trong khi font đang tải, rồi thay bằng Be Vietnam Pro khi sẵn sàng. Phần `<head>` preload hai file 500-weight dùng cho body:

```html
<link rel="preload" href="/blogmoi/fonts/be-vietnam-pro-500-vietnamese.woff2"
      as="font" type="font/woff2" crossorigin="anonymous">
<link rel="preload" href="/blogmoi/fonts/be-vietnam-pro-500-latin.woff2"
      as="font" type="font/woff2" crossorigin="anonymous">
```

Trong template, đường dẫn đi qua filter `url` của Eleventy để gắn path prefix. Đây là cấu hình đang dùng; trang không preload weight 700/800.

## Hiệu năng và layout stability

Blogmoi tự host sáu file WOFF2: ba weight nhân hai subset. Chỉ hai file 500 được preload; weight 700 và 800 tải khi thành phần cần đến. Cách này tránh phụ thuộc dịch vụ font bên ngoài và không phải gửi những weight chưa dùng. Các tệp nằm trong `static/fonts/`, có license OFL kèm theo. Repository không đặt cache header riêng hoặc tên file có hash; cache thực tế do host quyết định.

`swap` ưu tiên nội dung hiển thị sớm, nhưng không tự bảo đảm layout đứng yên: metrics khác nhau giữa fallback và Be Vietnam Pro có thể thay đổi độ dài dòng. Source chưa đặt `size-adjust`, `ascent-override`, `descent-override` hay `line-gap-override`, và không ghi nhận CLS hoặc thời gian tải. Vì vậy có thể xác nhận cơ chế nạp và số tài nguyên, không thể tuyên bố một mức cải thiện hiệu năng đã đo được. Nếu tối ưu tiếp, cần kiểm tra font request, kích thước artifact và CLS trên cùng thiết bị/mạng.

## Accessibility và đọc dài

Body bài khoảng 19–20px ở màn lớn, 17–18px trên mobile, weight 500 và line-height 1.75. Cột bài giới hạn 720px; khoảng cách đoạn và heading được tính theo đơn vị tương đối. HTML layout đặt `lang="vi"`; CSS có `:focus-visible` với viền 3px, theme sáng/tối và media query `prefers-reduced-motion`.

Màu chữ chính dùng navy trên nền sáng và trắng ngà trên nền tối; màu phụ đổi theo theme, link dùng teal. Đây là token có chủ đích nhưng repository không lưu báo cáo đo contrast. Cần xác minh cặp teal/nền tối, metadata và focus state riêng, đặc biệt khi đổi theme. Metadata hiện 14–15px và nên giữ vai trò phụ, không mang thông tin thiết yếu duy nhất.

## Eleventy và pipeline asset

`static/css/fonts.css` khai báo các face; `static/css/site.css` giữ nền tảng và `static/css/typography.css` tập trung font stack, scale, weight và responsive overrides. `src/_includes/partials/head.njk` preload subset body và gắn stylesheet; article layout gắn thêm `article.css`. Cấu hình Eleventy dùng `addPassthroughCopy({ static: "." })`, vì vậy font và CSS được sao chép nguyên trạng vào `_site/` cùng HTML sinh từ Markdown/Nunjucks.

Xem [bài kiến trúc Eleventy đã xuất bản của Blogmoi](https://blogco.github.io/blogmoi/xay-dung-blog-tinh-voi-eleventy-11ty/) để đọc chi tiết tech stack, front matter, Nunjucks và GitHub Pages. Font system là một phần của cùng pipeline tĩnh: chỉnh source, chạy build, rồi kiểm tra asset ở output; trình duyệt không cần runtime JavaScript để chọn font.

## Trước và sau

Trước thay đổi typography, stack có tên Be Vietnam Pro nhưng không có font file hay `@font-face`; tiêu đề dùng serif hệ thống, còn cách hiển thị phụ thuộc font cài trên thiết bị. Sau thay đổi, production có WOFF2 local, subset Latin/Vietnamese cho ba weight, preload 500, `font-display: swap` và scale dùng chung theo breakpoint. Đây là khác biệt kiểm chứng được trong Git và build artifact.

Không có ảnh chụp trước/sau, khảo sát hoặc benchmark để kết luận trang đẹp hơn bao nhiêu, nhanh hơn bao nhiêu hay CLS giảm thế nào. Cải thiện có thể khẳng định là kiểm soát được nguồn font, tập weight và quy tắc responsive; hiệu quả với người đọc cần được đo riêng.

## Bài học cho blog tiếng Việt

1. Xác minh font file và CSS nạp font, không chỉ nhìn tên trong `font-family`.
2. Chọn subset dựa trên glyph tiếng Việt thực tế; thử dấu dựng sẵn, dấu kết hợp, chữ hoa và code.
3. Chỉ tải các weight cần dùng, khai báo đúng weight và preload tài nguyên cần cho phần đầu trang.
4. Đặt scale, line-height và độ rộng dòng theo nội dung; kiểm tra desktop, tablet và mobile.
5. Đo contrast, CLS và tải font trước khi tuyên bố cải thiện; fallback vẫn là một phần của trải nghiệm.

## Kết luận

Blogmoi dùng Be Vietnam Pro vì bộ chữ có định hướng tiếng Việt, còn cách triển khai phản ánh các yêu cầu thực tế của site: WOFF2 tự host, subset riêng cho Latin/Vietnamese, ba weight, fallback hệ thống, preload có chọn lọc và scale responsive. CSS quyết định vai trò và kích thước; font assets cung cấp glyph/metrics; Eleventy đưa toàn bộ file đến Pages.

Những lớp này khiến typography trở thành một phần của kiến trúc kỹ thuật, không chỉ là trang trí. Khi cập nhật font hoặc scale, cần giữ mapping subset, license, fallback và path prefix đồng bộ, rồi kiểm tra artifact và trải nghiệm thực tế trước khi công bố kết quả.
