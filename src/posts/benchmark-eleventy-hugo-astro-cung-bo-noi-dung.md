---
title: "Benchmark Eleventy, Hugo và Astro: Công cụ nào build blog tĩnh nhanh hơn trên cùng một bộ nội dung?"
slug: benchmark-eleventy-hugo-astro-cung-bo-noi-dung
description: "Đo cold build, warm build, RAM và dung lượng HTML của Eleventy, Hugo, Astro trên cùng bộ Markdown 50, 250 và 1.000 bài, với mã benchmark và dữ liệu có thể tái chạy."
seoTitle: "Benchmark Eleventy, Hugo và Astro trên cùng bộ nội dung"
seoDescription: "90 lần build trên cùng máy Mac M2, cùng bộ Markdown và route tương đương: xem thời gian, RAM, dung lượng output, giới hạn đo và lý do Blogmoi vẫn chọn Eleventy."
canonical: "https://blogco.github.io/blogmoi/benchmark-eleventy-hugo-astro-cung-bo-noi-dung/"
date: "2026-10-23T00:00:00+07:00"
lastModified: "2026-10-23T00:00:00+07:00"
lang: vi
author: Blogmoi
categories:
  - Công nghệ
  - Web Development
tags:
  - Eleventy
  - Hugo
  - Astro
  - Benchmark
  - Static Site Generator
  - Performance
  - Blogmoi
keyPoints:
  - Hugo có cold build trung vị nhanh nhất trong cả ba cỡ dữ liệu đã đo; ở 1.000 bài, median là 255,837 ms, so với 836,544 ms của Eleventy và 1.979,004 ms của Astro.
  - Cả ba fixture tạo cùng tập route HTML và được kiểm tra nội dung, metadata, taxonomy, bảng, code block, mẫu đa ngôn ngữ và liên kết nội bộ.
  - Các con số mô tả một benchmark tổng hợp trên MacBook Air M2 với template tối giản, không đại diện cho mọi website hoặc trải nghiệm tải trang thực tế.
  - Warm build vẫn là full production build; incremental rebuild không được đưa vào so sánh vì ba công cụ có hành vi watcher khác nhau.
  - Tôi vẫn chọn Eleventy cho Blogmoi vì Nunjucks, HTML trực tiếp, CSS/JavaScript thuần và quy trình GitHub Pages phù hợp với cách tôi muốn duy trì blog.
faq:
  - question: "Vậy Hugo có nhanh nhất trong benchmark này không?"
    answer: "Có. Hugo có median thấp nhất ở cả 50, 250 và 1.000 bài trong năm lần cold build đo được cho mỗi cỡ. Kết luận này chỉ áp dụng cho fixture, cấu hình và máy được ghi lại trong bài."
  - question: "Warm build có phải incremental build không?"
    answer: "Không. Mỗi lượt warm vẫn gọi lệnh production build đầy đủ. Output và cache framework được giữ lại; phép đo không bật chế độ theo dõi file hay chỉ dựng lại một bài."
  - question: "Vì sao dung lượng HTML giữa các framework khác nhau?"
    answer: "Các trang có cùng route và trường nội dung cần thiết, nhưng serializer Markdown và cách template xuất khoảng trắng khác nhau. Vì vậy, số byte là kết quả của ba fixture HTML tối giản, không phải phép đo kích thước lý thuyết của framework."
  - question: "Benchmark này có cho biết website nào tải nhanh hơn hoặc SEO tốt hơn không?"
    answer: "Không. Bài đo thời gian build, bộ nhớ của tiến trình build và kích thước HTML tạo ra. Không có phép đo Core Web Vitals, trải nghiệm người dùng thực tế hay thứ hạng tìm kiếm."
  - question: "Tôi có thể chạy lại benchmark không?"
    answer: "Có. Repository lưu generator có seed cố định, fixture của ba framework, script runner, dữ liệu thô, phiên bản công cụ và hướng dẫn trong thư mục benchmarks/. Cần dùng đúng Node.js, Hugo và các package đã pin để đối chiếu sát nhất."
sourcePublisher: "Tài liệu chính thức Eleventy, Hugo và Astro; số liệu là phép đo gốc của Blogmoi"
sourceUrl: "https://www.11ty.dev/docs/"
copyrightHolder: "Blogmoi"
editorialNote: "Kết quả được đo tuần tự trên một máy vào ngày 22-10-2026 UTC. Đây là benchmark tổng hợp của fixture Blogmoi, không phải số liệu chính thức do các framework công bố. Phiên bản runtime, mẫu chạy, cách tính và giới hạn được lưu trong thư mục benchmarks."
copyrightNotice: "Bộ dữ liệu là nội dung tổng hợp xác định được tạo riêng cho phép thử; bài viết, biểu đồ và phép đo do Blogmoi biên soạn. Có thể tái chạy theo hướng dẫn trong repository."
coverSource: unsplash
cover: https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1440&q=80
coverAlt: Cận cảnh linh kiện trên một bảng mạch điện tử.
coverCaption: Ảnh minh họa từ Unsplash; không phải ảnh chụp sự kiện trong bài.
coverAttribution:
  photoUrl: https://unsplash.com/?utm_source=blogmoi&utm_medium=referral
---

Sau khi chọn Eleventy cho Blogmoi, tôi từng mô tả Hugo là công cụ nổi tiếng về tốc độ build. Nhưng nếu chưa chạy cùng nội dung trên cùng một máy, đó mới chỉ là nhận định phổ biến chứ chưa phải dữ liệu của dự án. Tôi muốn thay câu “công cụ nào nhanh hơn?” bằng một phép đo có thể lặp lại, có raw data và có giới hạn được nói rõ.

Vì vậy, tôi dựng một benchmark nhỏ cho Eleventy, Hugo và Astro. Đây không phải bài kiểm tra mọi tính năng của ba dự án. Mục tiêu là so sánh công việc cốt lõi của một blog tĩnh: nhận các bài Markdown, dùng layout chung, tạo trang bài viết cùng trang danh sách và xuất HTML.

Kết quả của phép đo này khá rõ: **Hugo có thời gian build thấp nhất ở cả ba quy mô**. Điều đó không tự quyết định framework nào phù hợp nhất cho Blogmoi. Phần còn lại giải thích cách đo, những gì kết quả cho thấy và những gì chúng không thể chứng minh.

## Câu hỏi nghiên cứu

Ở đây, câu hỏi không phải framework nào “tốt nhất” theo mọi nghĩa. Câu hỏi hẹp hơn: **với cùng một bộ nội dung Markdown, cùng tập route và yêu cầu HTML tương đương, mỗi công cụ mất bao lâu để tạo một blog tĩnh production, dùng bao nhiêu bộ nhớ ở tiến trình build và ghi ra bao nhiêu HTML?**

### Eleventy, Hugo và Astro trong fixture

**Eleventy 3.1.7** dùng Markdown và Nunjucks; **Hugo extended 0.168.0** dùng Markdown và Go templates; **Astro 7.4.2** dùng page cùng content collection. Astro không bật hydration hay gửi component frontend tới trình duyệt. Tôi giữ mỗi công cụ trong chế độ tạo HTML tĩnh để không trộn thêm chi phí phía client.

## Bộ dữ liệu và đầu ra cần tương đương

Generator tạo các bộ **50, 250 và 1.000 bài** bằng seed cố định 20261023. Bài tổng hợp dựa trên dạng metadata mà Blogmoi sử dụng, nhưng nội dung được sinh mới, không sao chép bài đã xuất bản. Mỗi bài có tiêu đề, ngày, category, tag, đoạn Markdown, H2/H3, bảng, code block và liên kết nội bộ. Văn bản có dấu tiếng Việt, mẫu Hangul tiếng Hàn và tiếng Anh để kiểm tra dữ liệu Unicode qua parser và template.

Ba framework đọc cùng một tập file Markdown tại mỗi cỡ dữ liệu. Mỗi fixture có layout dùng lại, trang chủ liệt kê bài, trang bài viết, chỉ mục category/tag và trang danh sách theo từng category/tag. HTML có title, description, canonical, Open Graph, link điều hướng và nội dung bài. Mã nguồn fixture đều giữ tối giản; tôi không lấy giao diện production đầy đủ của một công cụ rồi so với template sơ sài của hai công cụ còn lại.

Trước khi chấp nhận thời gian chạy, script kiểm tra danh sách route mong đợi, số trang, chỉ có file HTML trong output, metadata, heading, bảng, code, mẫu ngôn ngữ và liên kết bài nội bộ. Mỗi cỡ dữ liệu tạo lần lượt **62, 262 và 1.012 file HTML** ở cả ba framework: số bài cộng thêm trang chủ và các trang taxonomy chung. Manifest SHA-256 của dữ liệu được gắn với từng bản ghi raw để biết phép đo nào dùng bộ nội dung nào.

Tính tương đương có giới hạn: cả ba tạo cùng URL và trường nội dung, còn engine Markdown/serializer có thể khác nhau về khoảng trắng. Slug category được chuẩn hóa về URL ASCII.

## Máy thử và phương pháp

Tôi chạy toàn bộ phép đo tuần tự trên **MacBook Air Apple M2**, macOS Darwin 23.6.0, kiến trúc arm64, RAM 16 GiB và 8 CPU logic. Môi trường dùng Node.js 24.22.1, npm 11.19.1, Eleventy 3.1.7, Hugo 0.168.0 extended và Astro 7.4.2. Ngày ghi nhận trong raw data là 22-10-2026 UTC. Các fixture và package riêng nằm trong thư mục benchmarks; dependency Eleventy/Astro không được thêm vào package production của Blogmoi.

Ở mỗi cỡ dữ liệu và framework, runner chạy một lượt warm-up không tính giờ, rồi đo **năm cold build và năm warm build**. Tổng cộng có 90 lượt build được ghi vào JSON. Thứ tự framework được xáo trộn xác định theo từng vòng, và thứ tự cold/warm luân phiên để giảm khả năng một công cụ luôn chạy trước hoặc sau. Đo thời gian bằng đồng hồ monotonic độ phân giải cao process.hrtime.bigint().

**Cold build** xóa output và cache build riêng của framework trước khi chạy. Dependency đã cài vẫn giữ nguyên; tôi không xóa cache filesystem của macOS. Do vậy, “cold” ở đây nghĩa là trạng thái output/cache của fixture sạch, không phải máy vừa khởi động. **Warm build** giữ output và cache framework có thể tái sử dụng, rồi vẫn chạy lệnh full production build. Eleventy không có persistent fixture build cache; Hugo và Astro giữ cache của mình. Warm không đồng nghĩa với dựng lại riêng file vừa thay đổi.

Kích thước output lấy tổng byte của các file được sinh; vì fixture chỉ xuất HTML, tổng output bằng tổng HTML. Bộ nhớ là maximum resident set size từ macOS /usr/bin/time -l cho **tiến trình build trực tiếp**, không phải tổng RSS của toàn bộ cây tiến trình. Điều này cần lưu ý khi so sánh các công cụ chạy qua Node và những tiến trình con của chúng.

Mỗi bảng dùng median của năm mẫu; summary còn lưu mean, min, max, độ lệch chuẩn mẫu và coefficient of variation (CV = độ lệch chuẩn mẫu / mean). Incremental rebuild không được đo vì ba watcher/dev server có semantics khác nhau và chưa có đầu ra chung đáng tin cậy. Tôi không thay số đo đó bằng thời gian khởi động server hay request đầu tiên.

## Kết quả đo được

### Thời gian build

Các số trong bảng là median, đơn vị giây. Năm lượt cold và năm lượt warm đều là full production build theo định nghĩa trên.

| Số bài | Framework | Cold median | Warm median | Cold min–max | Cold CV |
| ---: | --- | ---: | ---: | ---: | ---: |
| 50 | Hugo | 0,044 | 0,042 | 0,042–0,072 | 25,1% |
| 50 | Eleventy | 0,221 | 0,214 | 0,219–0,229 | 1,9% |
| 50 | Astro | 0,886 | 0,751 | 0,881–0,899 | 1,0% |
| 250 | Hugo | 0,084 | 0,082 | 0,083–0,117 | 16,4% |
| 250 | Eleventy | 0,337 | 0,325 | 0,334–0,339 | 0,6% |
| 250 | Astro | 1,094 | 0,950 | 1,082–1,132 | 1,7% |
| 1.000 | Hugo | 0,256 | 0,252 | 0,239–0,298 | 9,9% |
| 1.000 | Eleventy | 0,837 | 0,786 | 0,800–0,860 | 2,6% |
| 1.000 | Astro | 1,979 | 1,600 | 1,811–2,347 | 9,9% |

Ở 50 bài, median cold của Hugo thấp hơn Eleventy khoảng 5,0 lần; ở 250 bài khoảng 4,0 lần; ở 1.000 bài khoảng 3,3 lần. Tỷ lệ này chỉ áp dụng cho fixture hiện tại. Astro có cold median cao nhất ở cả ba cỡ.

Ở 1.000 bài, cold build Hugo mất median 255,837 ms, Eleventy 836,544 ms và Astro 1.979,004 ms. Warm median cũng xếp theo thứ tự Hugo, Eleventy, Astro.

![Biểu đồ cold build median của ba framework ở 50, 250 và 1.000 bài viết](/blogmoi/images/benchmark-sgg-build-time.svg)

*Hình 1. Cold build median trong năm lượt cho mỗi framework/cỡ dữ liệu. Trục tung của từng panel dùng thang giây phù hợp với giá trị tối đa của panel; các nhãn cột ghi số đo cụ thể. Nguồn: phép đo gốc trong repository Blogmoi.*

CV Hugo cao ở cỡ nhỏ: 25,1% với 50 bài và 16,4% với 250 bài. Ở 50 bài, lượt 72,235 ms kéo mean lên 52,870 ms, trong khi median là 44,354 ms. Thời gian tuyệt đối ngắn khiến vài mili giây tạo CV lớn; bảng ghi cả khoảng min–max để thể hiện dao động. Ở 1.000 bài, CV cold của Eleventy là 2,6%, Hugo 9,9% và Astro 9,9%.

### Bộ nhớ đỉnh và dung lượng HTML

Bảng tiếp theo lấy peak RSS median của năm lượt cold và kích thước output cố định ở mỗi framework/cỡ dữ liệu. RSS dùng MiB; output dùng MB thập phân để dễ hình dung.

| Bài viết | Framework | Peak RSS median | File HTML | Tổng HTML |
| ---: | --- | ---: | ---: | ---: |
| 50 | Hugo | 57,7 MiB | 62 | 0,263 MB |
| 50 | Eleventy | 120,1 MiB | 62 | 0,221 MB |
| 50 | Astro | 423,1 MiB | 62 | 0,250 MB |
| 250 | Hugo | 80,3 MiB | 262 | 1,274 MB |
| 250 | Eleventy | 137,2 MiB | 262 | 1,068 MB |
| 250 | Astro | 501,8 MiB | 262 | 1,214 MB |
| 1.000 | Hugo | 144,9 MiB | 1.012 | 5,067 MB |
| 1.000 | Eleventy | 275,6 MiB | 1.012 | 4,245 MB |
| 1.000 | Astro | 685,6 MiB | 1.012 | 4,828 MB |

Trong cách đo RSS của tiến trình trực tiếp, Hugo có median thấp nhất ở cả ba quy mô; Astro cao nhất, còn Eleventy nằm giữa. Tuy nhiên, số RSS này không cộng bộ nhớ của tiến trình con nên không thể dùng để khẳng định mức tiêu thụ của toàn bộ process tree trên mọi cách khởi chạy. Nó là số đo đúng với runner hiện tại, cần được diễn giải cùng phương pháp.

Dung lượng HTML cho một cỡ dữ liệu không đổi giữa năm lượt nhưng khác nhau giữa fixture: Eleventy ghi ít byte nhất, Hugo nhiều nhất. Chênh lệch 4,245 MB so với 5,067 MB ở 1.000 bài không phải lợi thế tốc độ. Nó có thể đến từ khoảng trắng, quy tắc serialize Markdown hoặc markup nhỏ trong layout. Route và nội dung cần thiết đã được kiểm tra tương đương; kích thước byte tuyệt đối không được ép bằng minifier riêng cho một framework.

## Vì sao kết quả như vậy?

**Đo trực tiếp:** thời gian tăng khi số bài tăng ở cả ba fixture. Hugo có median thấp nhất ở mọi quy mô; Astro dùng peak RSS trực tiếp lớn nhất; Eleventy tạo output nhỏ nhất trong ba fixture. Những câu này mô tả chính xác các số lưu trong raw.json và summary.json dưới benchmarks/results.

**Diễn giải có điều kiện:** một giả thuyết hợp lý là Hugo có chi phí xử lý thấp cho tác vụ Markdown và template tối giản này, đồng thời chạy dưới dạng binary được biên dịch. Nhưng benchmark không tách thời gian parse front matter, Markdown, template hay ghi file, nên tôi không xem đó là nguyên nhân đã được chứng minh. Tương tự, Astro fixture chạy trên Node và đi qua content collection/build pipeline; thời gian quan sát được là toàn bộ cấu hình đó, không phải phép đo riêng của một module Astro.

Ba fixture không dùng chung parser hay template engine, nên khác biệt thời gian và số byte phản ánh cả framework lẫn cách template được viết. Mã benchmark được giữ trong repository để người đọc kiểm tra cấu hình thay vì suy diễn kết quả cho mọi site.

## Đổi tốc độ lấy gì?

Build nhanh có ích khi site lớn hoặc CI chạy thường xuyên. Việc chọn công cụ còn tùy người sửa template, quản lý nội dung, môi trường host và phần muốn tự xây. Benchmark template ngắn này không đo trải nghiệm phát triển, hệ sinh thái plugin hay thời gian hoàn thành tính năng.

Mỗi công cụ có mô hình riêng: Hugo dùng Go templates, Astro có cú pháp page và content collections, còn Eleventy kết hợp được Nunjucks với dữ liệu JavaScript. Nên cân nhắc các lựa chọn này theo nhóm và loại nội dung thực tế.

Với Blogmoi, source production đang dùng Eleventy 3.1.7, Node.js 24, Nunjucks cho layout, Markdown cho bài viết, CSS thuần và JavaScript ESM tối giản. Site deploy ra HTML tĩnh trên GitHub Pages với tiền tố /blogmoi/. Tôi muốn HTML dễ kiểm tra, URL có thể kiểm soát ở front matter/config và giao diện có thể phát triển mà không phải đưa ứng dụng client vào toàn bộ trang.

Nếu mục tiêu ưu tiên duy nhất của tôi là rút ngắn thời gian build cho fixture tương tự, phép đo này khiến Hugo đáng được cân nhắc nghiêm túc. Nhưng Blogmoi đã có hệ thống Eleventy, template Nunjucks, pipeline nội dung, URL và workflow đang phục vụ các nhu cầu hiện tại. Chuyển framework chỉ vì một chênh lệch build chưa cho thấy lợi ích đủ lớn để bù chi phí chuyển đổi, kiểm thử lại URL và bảo trì một hệ thống mới. Đây là lựa chọn kỹ thuật cá nhân gắn với repo này, không phải kết luận Eleventy phù hợp hơn cho mọi blog.

Người muốn hiểu sâu hơn có thể đọc [bài so sánh Static Site Generator và lý do Blogmoi chọn Eleventy](/blogmoi/top-5-cong-nghe-tao-website-tinh-2026/), [cấu trúc blog tĩnh với Eleventy](/blogmoi/xay-dung-blog-tinh-voi-eleventy-11ty/) và [checklist chuyển từ Hugo sang Eleventy](/blogmoi/chuyen-blog-tu-hugo-sang-eleventy-checklist-url-deploy/). Đây là các URL bài đã xuất bản trong chính site.

## Giới hạn của benchmark

Đây là bộ nội dung tổng hợp có cấu trúc lặp lại, không phải bản sao thống kê hoàn hảo của một kho nội dung thực. Site thật có thể có shortcode phức tạp, nhiều loại layout, hình ảnh, xử lý asset, plugin, cú pháp khác nhau, sitemap/feed, search index, code highlighting, redirect hoặc bước tối ưu riêng. Các tính năng này bị loại khỏi fixture để tập trung vào cùng tác vụ nội dung và HTML; vì vậy kết quả không thể dự báo thời gian build production nếu chưa đo pipeline production.

Chỉ có một máy M2, một hệ điều hành và một cấu hình template; storage, runtime và tải máy khác có thể cho kết quả khác. Các build chạy tuần tự nhưng vẫn chịu scheduling và cache hệ điều hành. Năm mẫu giúp ghi nhận phân bố cơ bản, không phải nghiên cứu thống kê lớn; với tác vụ dưới 100 ms, vài mili giây đã là tỷ lệ đáng kể.

Peak memory giới hạn ở tiến trình trực tiếp do cách thu thập bằng /usr/bin/time -l; kích thước HTML gồm khác biệt formatting giữa fixture. Chúng tôi chưa đo thời gian cài dependency, không benchmark RAM của watcher, không đo lần sửa một Markdown, không đánh giá tốc độ tải trang, Core Web Vitals, độ truy cập hay thứ hạng SEO. Không có kết luận nào trong bài nên được chuyển thành tuyên bố về các chỉ số đó.

Thư mục benchmarks/ lưu seed, manifest, package lock, fixture, runner, log từng lượt và kết quả JSON/CSV. README có phiên bản, lệnh chạy và cleanup; output phát sinh nằm trong benchmarks/.work, được Git ignore. Benchmark không tham gia npm run build bình thường.

## Kết luận: vì sao tôi vẫn chọn Eleventy?

Kết quả không cần né tránh: Hugo build nhanh hơn Eleventy trong benchmark này, khoảng 3,3–5,0 lần theo cold median giữa ba cỡ dữ liệu. Hugo cũng có median RSS trực tiếp thấp hơn. Astro mất thời gian và RSS cao hơn trong fixture Node hiện tại. Eleventy ghi output HTML ít byte nhất, nhưng số byte không thay cho tốc độ build.

Tôi vẫn chọn Eleventy vì nó hợp với kiến trúc và thói quen biên tập của Blogmoi: Nunjucks cho layout có thể tái sử dụng, nội dung Markdown, HTML đầu ra dễ kiểm soát, CSS và JavaScript tối giản, URL ổn định, cùng quy trình triển khai GitHub Pages đã cấu hình. Những lý do đó là cân nhắc bảo trì và biên tập, không phải thành tích benchmark.

Nếu quy mô, quy trình xuất bản hoặc chi phí CI thay đổi, tôi có thể chạy lại bộ đo hoặc benchmark pipeline production có kiểm soát hơn. Đối với Blogmoi hôm nay, tôi hiểu rõ hơn cái giá hiệu năng của lựa chọn hiện tại và vẫn thấy trade-off này phù hợp với dự án.

**Eleventy không nhất thiết là công cụ build nhanh nhất, nhưng là lựa chọn phù hợp nhất với cách tôi muốn xây dựng và phát triển Blogmoi.**

## Tài liệu và dữ liệu gốc

- [Tài liệu chính thức Eleventy](https://www.11ty.dev/docs/)
- [Tài liệu chính thức Hugo](https://gohugo.io/documentation/)
- [Tài liệu chính thức Astro](https://docs.astro.build/)
- [README benchmark, fixture và hướng dẫn tái chạy](https://github.com/blogco/blogmoi/tree/main/benchmarks)
- [Raw JSON của 90 lượt build](https://github.com/blogco/blogmoi/blob/main/benchmarks/results/raw.json) và [summary thống kê](https://github.com/blogco/blogmoi/blob/main/benchmarks/results/summary.json)
