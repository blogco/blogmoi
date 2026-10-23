---
title: "Khám phá theo chủ đề trên Blogmoi hoạt động như thế nào? Giải mã thuật toán tự động phân loại nội dung"
slug: kham-pha-theo-chu-de-blogmoi-thuat-toan-phan-loai
description: "Giải mã mã nguồn Topic Discovery của Blogmoi: category lấy từ front matter, Related Posts so khớp category, còn gợi ý chủ đề dùng backlog biên tập và quy tắc JavaScript xác định."
seoTitle: "Topic Discovery trên Blogmoi: thuật toán hoạt động thế nào?"
seoDescription: "Khám phá cách Blogmoi dùng category từ front matter và backlog biên tập để gợi ý bài bằng JavaScript trong lúc Eleventy build, không cần AI hay database."
canonical: "https://blogco.github.io/blogmoi/kham-pha-theo-chu-de-blogmoi-thuat-toan-phan-loai/"
date: "2026-10-23T00:31:32+07:00"
lastModified: 2026-10-23
lang: vi
author: Blogmoi
series: "Behind the Build — Hậu trường xây dựng Blogmoi"
categories:
  - Công nghệ
  - Web Development
tags:
  - Eleventy
  - Topic Discovery
  - Content Classification
  - Recommendation System
  - JavaScript
  - Static Site Generator
  - Blogmoi
keyPoints:
  - Blogmoi không suy luận category từ nội dung: Eleventy gom các giá trị categories đã khai báo trong front matter thành trang chủ đề.
  - Related Posts lấy tối đa ba bài cùng ít nhất một category; Topic Discovery đọc backlog biên tập JSON và các điều kiện khớp metadata.
  - Bộ khớp chuẩn hóa title, slug, description, categories, tags, keyPoints và FAQ rồi yêu cầu mọi match.allTerms xuất hiện như cụm từ hoàn chỉnh.
  - Không có embedding, LLM, điểm similarity hay API trong Topic Discovery; thứ tự dùng trạng thái bài đã xuất bản, priority biên tập, title và ngày.
  - Backlog cho phép gợi ý chủ đề chưa có bài, còn trạng thái published được đồng bộ trong lúc Eleventy tạo collection posts.
faq:
  - question: "Topic Discovery trên Blogmoi có thực sự dùng AI không?"
    answer: "Không. Mã nguồn dùng JavaScript xác định, metadata và các điều kiện chuỗi trong backlog JSON. Không có lời gọi LLM, embedding hay vector search trong luồng này."
  - question: "Hệ thống phân loại bài viết dựa trên dữ liệu nào?"
    answer: "Trang category đọc categories trong front matter. Bộ khớp Topic Discovery đọc title, slug, description, categories, tags, keyPoints và FAQ của bài ứng viên; Related Posts chỉ đọc categories. Không hệ nào quét Markdown body để trích từ khóa."
  - question: "Bài mới có tự động được đưa vào chủ đề nào, và tôi có sửa được không?"
    answer: "Bài mới vào collection và category group khi build nếu không có draft: true, nhưng người viết phải khai báo categories. Có thể sửa category trong front matter; có thể biên tập đề xuất trong data/editorial-topic-suggestions.json. Không có công cụ sửa taxonomy trên giao diện."
  - question: "Topic Discovery khác Related Posts như thế nào?"
    answer: "Related Posts chọn tối đa ba bài cùng category theo thứ tự collection. Topic Discovery đối chiếu các mục backlog gắn với slug nguồn, tìm bài ứng viên theo match.allTerms hoặc hiển thị đề xuất chủ đề chưa xuất bản."
  - question: "Khi số lượng bài viết tăng, thuật toán có cần database không?"
    answer: "Hiện không. Eleventy đọc Markdown và JSON lúc build rồi ghi HTML tĩnh. Không có truy vấn theo lượt xem hay người dùng. Khi kho lớn hơn, có thể cần đo thời gian build hoặc cải thiện cách lập chỉ mục, nhưng database không phải điều kiện của cách làm hiện tại."
sourcePublisher: "Blogmoi — repository mã nguồn"
sourceUrl: "https://github.com/blogco/blogmoi/blob/main/lib/editorial-topic-discovery.js"
copyrightHolder: "Blogmoi"
editorialNote: "Bài viết đối chiếu mã nguồn Eleventy, template và backlog của Blogmoi tại ngày 23-10-2026. Ví dụ truy vết dùng metadata của bài Be Vietnam Pro hiện có; kết quả được giải thích theo các hàm đang chạy, không phải suy đoán từ giao diện."
copyrightNotice: "Các đoạn mã được trích hoặc rút gọn từ repository Blogmoi để giải thích cách triển khai; chúng không mô tả một dịch vụ AI hay cơ sở dữ liệu không tồn tại trong source."
coverSource: unsplash
cover: https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1440&q=80
coverAlt: Màn hình hiển thị nhiều biểu đồ dữ liệu.
coverCaption: Ảnh minh họa từ Unsplash; không phải ảnh chụp sự kiện trong bài.
coverAttribution:
  photoUrl: https://unsplash.com/?utm_source=blogmoi&utm_medium=referral
---

**Series:** Behind the Build — Hậu trường xây dựng Blogmoi

## Vì sao tôi xây dựng Khám phá theo chủ đề?

Khi blog còn ít bài, một danh sách “mới nhất” thường đủ để người đọc tìm thấy điều mình cần. Nhưng khi bài viết tăng lên, thứ tự thời gian chỉ trả lời được câu hỏi “bài nào mới đăng?”. Nó không giúp người đọc đi từ một câu hỏi sang những bài có cùng mối quan tâm.

Tôi muốn Blogmoi hoạt động như một thư viện nội dung có đường nối. Người đọc đang xem bài về Eleventy có thể muốn tìm hiểu thêm về static site generator; người đang đọc về font tiếng Việt có thể muốn biết cách kiểm tra subset hoặc đo layout shift. Với tôi, đó là giá trị của Khám phá theo chủ đề: mở thêm một bước đọc tiếp thay vì để bài viết kết thúc ở một danh sách theo ngày.

Tên gọi trên giao diện dễ khiến người ta nghĩ Blogmoi đọc toàn bộ bài rồi tự phát hiện chủ đề. Mã nguồn hiện tại làm việc cụ thể và khiêm tốn hơn. Có một taxonomy category lấy từ front matter, một bộ Related Posts theo category, và một luồng Topic Discovery dựa trên backlog do biên tập viên chuẩn bị. Chúng cùng giúp khám phá nội dung, nhưng không dùng chung một thuật toán.

## Topic Discovery và Related Posts khác nhau thế nào?

Trong layout bài viết, Related Posts được tính trước, sau đó kết quả được truyền vào Topic Discovery. Related Posts là phép lọc ngắn theo category. Topic Discovery dùng dữ liệu trong backlog để quyết định hiển thị bài đã xuất bản khác hay một chủ đề chưa có bài.

| Tiêu chí | Related Posts | Topic Discovery |
|---|---|---|
| Mục đích | Đưa ra bài cùng category với bài đang đọc | Nối bài nguồn với bài phù hợp trong backlog hoặc gợi ý hướng nội dung chưa xuất bản |
| Dữ liệu đầu vào | URL hiện tại, danh sách categories của bài | Collection bài, slug hiện tại, danh sách Related Posts và data/editorial-topic-suggestions.json |
| Cách khớp | Bài khác có ít nhất một category trùng chính xác | sourceArticles nối backlog với bài hiện tại; match.allTerms tìm bài đích trong metadata |
| Kết quả | Tối đa ba bài, theo thứ tự collection | Tối đa bốn mục; bài đã xuất bản được xếp trước, sau đó là gợi ý chủ đề |
| Cập nhật | Khi collection và category được dựng lại | Khi Eleventy build chạy; trạng thái backlog được đồng bộ nếu tìm thấy hoặc không còn bài khớp |

Tên “category” cũng cần hiểu đúng. [Cấu hình Eleventy](https://github.com/blogco/blogmoi/blob/main/eleventy.config.mjs) không tự đặt category bằng cách phân tích title. Hàm groupPosts đọc các giá trị categories có sẵn, nhóm chúng theo slug và tạo collection dùng cho các trang taxonomy. Vì vậy trang nhóm category được tạo tự động từ dữ liệu đã khai báo; bản thân tên category vẫn do người viết chọn.

## Thuật toán đọc dữ liệu nào?

Một bài có front matter như sau. Đây là cấu trúc rút gọn từ bài Blogmoi về Be Vietnam Pro, không phải schema mới được đề xuất:

~~~yaml
title: "Vì sao Blogmoi chọn Be Vietnam Pro? ..."
slug: vi-sao-blogmoi-chon-be-vietnam-pro
description: "Case study từ CSS và font assets ... tiếng Việt."
categories: [Công nghệ, Web Design]
tags: [Typography, Be Vietnam Pro, Web Fonts, CSS, Vietnamese Fonts, Eleventy]
keyPoints:
  - "Blogmoi tự host Be Vietnam Pro dạng WOFF2 ..."
faq:
  - question: "Blogmoi đang phân phối những trọng lượng nào?"
    answer: "Ba trọng lượng thường: 500, 700 và 800."
~~~

Đối với taxonomy và Related Posts, trường quan trọng là categories. Với phép tìm bài đích trong Topic Discovery, [hàm postMetadataText](https://github.com/blogco/blogmoi/blob/main/lib/editorial-topic-discovery.js) kết hợp title, slug, description, categories, tags, keyPoints và faq. Hàm đệ quy chuyển mảng và object thành chuỗi trước khi chuẩn hóa.

Các trường date, author, series, canonical, originalAuthor, sourcePublisher, editorialNote và phần thân Markdown không nằm trong chuỗi tìm kiếm. keywords, relatedArticles, readerSearchIntent và rationale cấp cao ở backlog cũng không được bộ khớp sử dụng. Chúng có thể hữu ích cho biên tập viên đọc lại ý tưởng, nhưng sự hiện diện trong JSON không đồng nghĩa chúng tham gia thuật toán.

Backlog là một nguồn dữ liệu khác, với các trường thực sự được luồng này đọc như id, title, sourceArticles, status, priority, connections, publishedArticleSlug và match.allTerms. Đây là dữ liệu biên tập viết sẵn, không phải bản trích xuất được tạo từ bài Markdown.

## Pipeline phân loại thực tế

~~~text
+------------------------------+
| Markdown trong src/posts/    |
| front matter + nội dung      |
+------------------------------+
               |
               v
+------------------------------+
| Eleventy collection posts    |
| bỏ bài draft, sắp xếp ngày   |
+------------------------------+
               |
               +---------------------> categoryGroups từ categories
               |
               v
+------------------------------+
| Đồng bộ trạng thái backlog   |
| tìm bài theo match.allTerms  |
+------------------------------+
               |
               v
+------------------------------+
| Nunjucks tính Related Posts  |
| rồi gọi topicSuggestions     |
+------------------------------+
               |
               v
+------------------------------+
| Khớp metadata, lọc trùng,    |
| xếp thứ tự và giới hạn mục   |
+------------------------------+
               |
               v
+------------------------------+
| HTML tĩnh trong _site/       |
| triển khai bằng Pages Action |
+------------------------------+
~~~

Không có bước trích từ khóa từ nội dung, phân cụm tự phát, sinh vector hoặc gọi dịch vụ phân loại. Có hai đầu ra khác nhau: categoryGroups tạo trang category; topicSuggestions tạo các card ở cuối từng bài. Không có file JSON Topic Discovery riêng được tải ở trình duyệt; Nunjucks đưa kết quả vào HTML ngay trong build.

## Bộ khớp hoạt động ra sao?

Hàm trung tâm là matchingPost() trong [lib/editorial-topic-discovery.js](https://github.com/blogco/blogmoi/blob/main/lib/editorial-topic-discovery.js). Có thể rút gọn phần cốt lõi thành đoạn sau:

~~~js
const terms = (suggestion.match?.allTerms || [])
  .map(normalizeText)
  .filter(Boolean);
if (terms.length < 2) return null;

return eligible
  .filter((post) => {
    const searchable = postMetadataText(post);
    return terms.every((term) => containsTerm(searchable, term));
  })
  .sort((a, b) => {
    const aTitle = normalizeText(String(a.data.title || "") + " " + String(a.data.slug || ""));
    const bTitle = normalizeText(String(b.data.title || "") + " " + String(b.data.slug || ""));
    const aMatches = terms.filter((term) => containsTerm(aTitle, term)).length;
    const bMatches = terms.filter((term) => containsTerm(bTitle, term)).length;
    return bMatches - aMatches || b.date - a.date;
  })[0] || null;
~~~

Đầu tiên, hệ thống chuẩn hóa từng điều kiện trong match.allTerms. Bài ứng viên chỉ được xét nếu mọi điều kiện đều xuất hiện trong metadata đã chuẩn hóa; một điều kiện thiếu là đủ để loại. containsTerm thêm khoảng trắng ở hai đầu chuỗi nên tìm cụm từ theo ranh giới từ, không khớp một phần tùy tiện giữa các từ.

normalizeText dùng Unicode NFKD, bỏ các dấu kết hợp trong dải U+0300–U+036F, chuyển chữ thường, đổi đ thành d, thay dấu câu/ký hiệu bằng khoảng trắng rồi trim. Quy tắc được áp dụng cho cả điều kiện backlog lẫn metadata ứng viên. Đây là chuẩn hóa chuỗi đơn giản, không phải bộ tách từ hay hiểu nghĩa.

Sau khi lọc đủ điều kiện, thứ tự chọn bài được xác định bằng số điều kiện tìm thấy trong riêng title + slug; nhiều hơn thì đứng trước. Nếu bằng nhau, ngày bài mới hơn đứng trước. Không có trọng số số học cho title, tag hay category. Chúng là một phần của cùng chuỗi metadata bắt buộc khớp, còn title/slug chỉ có vai trò phân hạng ứng viên đã vượt qua bộ lọc.

Sau khi mục có ít nhất hai điều kiện đã chuẩn hóa, có một nhánh ưu tiên trước khi tìm bài theo cụm từ: nếu backlog đặt publishedArticleSlug và bài đó nằm trong danh sách đủ điều kiện, bài được chọn trực tiếp. Trường này là một điểm ghim đích cụ thể, không phải công cụ chỉnh category tổng quát.

Ở cấp resolveTopicSuggestions(), sourceArticles xác định bài đang đọc có liên quan đến mục backlog nào. Mục rejected bị bỏ qua. Nếu tìm được bài đích, nó có thể thành card “Đã có bài viết”; nếu chưa tìm được, hệ thống dùng connections[slug hiện tại] để trình bày title và lý do của chủ đề đề xuất. Backlog có priority thủ công high/medium/low; kết quả được sắp xếp bài đã xuất bản trước, rồi theo priority, rồi theo title tiếng Việt.

Để tránh lặp, resolver bỏ ID đã thấy, URL bài đích đã thêm và title đề xuất trùng sau chuẩn hóa. Nó giới hạn tối đa hai chủ đề chưa xuất bản, sau đó lấy tối đa bốn mục tổng cộng. Nó cũng bỏ bài hiện tại và bài đã có trong Related Posts. Đây là các điều kiện lọc rõ ràng, không phải một điểm similarity ẩn.

## Truy vết một bài viết thật

Tôi dùng bài [Vì sao Blogmoi chọn Be Vietnam Pro?](https://blogco.github.io/blogmoi/vi-sao-blogmoi-chon-be-vietnam-pro/) làm case study. Bài có slug vi-sao-blogmoi-chon-be-vietnam-pro; hai mục backlog debug-vietnamese-font-subsets và measure-font-swap-cls khai báo slug này trong sourceArticles.

~~~text
INPUT ARTICLE
  title: Vì sao Blogmoi chọn Be Vietnam Pro? ...
  categories: Công nghệ, Web Design
  tags: Typography, Be Vietnam Pro, Web Fonts, CSS, Vietnamese Fonts, ...
       |
       v
BACKLOG ITEMS LINKED BY sourceArticles
  debug-vietnamese-font-subsets
  measure-font-swap-cls
       |
       v
CHECK PUBLISHED ARTICLE METADATA AGAINST allTerms
       |
       +--> no other eligible article matches every term
       |
       v
DISCOVERY OUTPUT
  Cách kiểm tra unicode-range và font fallback tiếng Việt (high)
  Đo CLS khi dùng font tự host: fallback, preload và font metrics (medium)
~~~

| Tín hiệu | Kết quả đã kiểm tra |
|---|---|
| Bài nguồn | vi-sao-blogmoi-chon-be-vietnam-pro |
| Category và tags | Đọc từ front matter; không dùng để tự tạo tên chủ đề |
| Điều kiện mục thứ nhất | unicode-range, font, tiếng việt |
| Điều kiện mục thứ hai | cls, font, font-display |
| Bài đích khớp | Không có bài ứng viên nào khác vượt qua đủ điều kiện |
| Điểm chủ đề | Không có; mã không tính điểm số |
| Kết quả | Hai gợi ý từ backlog, lần lượt priority high và medium |
| Lý do hiển thị | connections[slug] đã được biên tập cho đúng bài nguồn |

Bài nguồn không được dùng để tự đề xuất chính nó: matchingPost() loại các slug nằm trong sourceArticles. Vì không có bài đích phù hợp, hai card không có URL và không tạo liên kết tới một trang chưa tồn tại. Đó là một ví dụ có thể giải thích từ dữ liệu vào đến giao diện, nhưng không phải bằng chứng về hiểu ngữ nghĩa: mối liên hệ giữa bài font và ý tưởng kiểm tra/đo lường đã được biên tập sẵn trong JSON.

## Chủ đề chưa có bài được đề xuất thế nào?

Blogmoi hiện có backlog biên tập trong [data/editorial-topic-suggestions.json](https://github.com/blogco/blogmoi/blob/main/data/editorial-topic-suggestions.json). Mỗi mục có title, các slug nguồn, phần kết nối/rationale, priority và các điều kiện khớp tùy trường hợp. Biên tập viên quyết định chủ đề nào đáng theo đuổi và viết lý do cho từng bài nguồn.

Vì thế, backlog không phải danh sách được suy ra từ “keyword gap”, và hệ thống không tự sáng tác đề tài mới. Các trường keywords, readerSearchIntent hoặc relatedArticles có trong một số mục không được resolver hiện tại dùng để đề xuất card. Card chưa xuất bản lấy title cùng connections[currentSlug], không có href; khi một bài thật được tạo và metadata vượt điều kiện, card có thể chuyển sang dạng bài đã xuất bản.

readBacklog() kiểm tra mảng suggestions, ID phải có và duy nhất, status thuộc proposed, approved, published hoặc rejected. Trong luồng hiển thị, rejected bị loại; proposed và approved đều có thể xuất hiện nếu có kết nối với bài hiện tại. Status published không phải bộ lọc độc lập: điều quyết định là có tìm ra bài khớp hay không.

## Điều gì xảy ra khi xuất bản bài mới?

Khi một file Markdown được thêm vào src/posts/ và không có draft: true, collection posts đưa nó vào danh sách bài. Category group cũng được dựng từ categories của nó. Trong lúc collection được tạo, syncEditorialTopicStatuses(posts) dò backlog: nếu có bài đáp ứng match.allTerms, mục được đặt thành published và lưu publishedArticleSlug; nếu bài không còn khớp, mục đã published được trả về proposed.

Template bài viết sau đó tính Related Posts và Topic Discovery; Eleventy ghi HTML vào _site/. Workflow [deploy.yml](https://github.com/blogco/blogmoi/blob/main/.github/workflows/deploy.yml) cài dependency, chạy bước xử lý từ điển riêng, gọi npm run build, rồi triển khai artifact bằng GitHub Pages Actions. Từ góc nhìn Topic Discovery, không có bước phân loại offline hay API webhook riêng: cập nhật diễn ra trong build của site.

Điểm cần biết khi bảo trì: đồng bộ trạng thái dùng writeFileSync để ghi lại JSON backlog ngay trong lúc build nếu status/slug thay đổi. Workflow hiện chỉ chủ động persist hàng đợi từ điển; nó không có bước commit backlog Topic Discovery sau mỗi build. Do đó, thay đổi status có thể được tính lại từ các bài trong source ở lần build tiếp theo. Nếu cần lưu trạng thái biên tập lâu dài, nên thay đổi backlog trong commit nội dung, không dựa vào side effect build như một cơ sở dữ liệu.

Nếu muốn tìm hiểu sâu hơn về collection, Nunjucks và Pages, xem bài [Xây dựng blog tĩnh với Eleventy](https://blogco.github.io/blogmoi/xay-dung-blog-tinh-voi-eleventy-11ty/). Bài [Top 5 công nghệ tạo website tĩnh năm 2026](https://blogco.github.io/blogmoi/top-5-cong-nghe-tao-website-tinh-2026/) đặt Eleventy cạnh Hugo và Astro; [checklist chuyển blog từ Hugo sang Eleventy](https://blogco.github.io/blogmoi/chuyen-blog-tu-hugo-sang-eleventy-checklist-url-deploy/) trình bày thêm các bước giữ URL và chuyển quy trình deploy; còn [case study Be Vietnam Pro](https://blogco.github.io/blogmoi/vi-sao-blogmoi-chon-be-vietnam-pro/) là ví dụ được truy vết ở trên. Repository chưa có bài benchmark so sánh thực nghiệm riêng, nên bài so sánh SSG là liên kết gần chủ đề chứ không được gọi là benchmark.

Để khối Topic Discovery cũng có dữ liệu trên bài này, tôi nối slug của nó vào mục backlog benchmark SSG và viết một rationale riêng. Đây là quyết định biên tập, không phải thuật toán tự nhận ra mối liên hệ. Các bài nguồn đã khai báo bị loại khỏi tập đích, còn bài published khác không khớp đủ bốn điều kiện; vì vậy card hiện ra như một đề xuất chưa xuất bản, không có URL.

## Đây có phải AI không?

Không. Topic Discovery hiện tại là JavaScript chạy trong Eleventy, dựa trên điều kiện chuỗi và metadata do người viết/biên tập cung cấp. Không có LLM classification, embedding, vector database, semantic similarity hay API inference trong [lib/editorial-topic-discovery.js](https://github.com/blogco/blogmoi/blob/main/lib/editorial-topic-discovery.js).

Một số khái niệm dễ lẫn nhau:

- **Quy tắc:** điều kiện xác định, chẳng hạn mọi match.allTerms phải xuất hiện trong metadata.
- **Keyword matching:** so khớp chuỗi đã chuẩn hóa; Blogmoi dùng cách này cho bài đích.
- **Xếp hạng:** đếm điều kiện có mặt trong title/slug, ngày, rồi priority biên tập. Đây không phải semantic score.
- **Semantic similarity hoặc LLM:** cần biểu diễn/ngữ cảnh và dịch vụ hoặc mô hình riêng; code Topic Discovery hiện không có chúng.

Repository có workflow từ điển tùy cấu hình dùng OpenAI để tạo bản dịch nháp, nhưng đó là pipeline khác. Tên component ai-keypoints.njk cũng không chứng minh nội dung được sinh bởi AI: nó hiển thị keyPoints đã có trong front matter và gọi phần này là “Tóm lược biên tập”. Hai chi tiết đó không tham gia phân loại chủ đề.

## Điểm mạnh và giới hạn

Quy tắc xác định có thể đọc, chạy lại trong build và giải thích được; không cần runtime service hay credential cho từng lượt xem. Dữ liệu bài, taxonomy và backlog nằm cùng repository nên chỉnh sửa có lịch sử Git. Mặt trái là mọi quan hệ đáng kể đều phụ thuộc vào việc con người khai báo category, nối sourceArticles, viết điều kiện và rationale.

Chuẩn hóa hỗ trợ tiếng Việt ở mức bỏ dấu thông dụng và giữ chữ cái Unicode. Tuy nhiên, không có stemming, từ đồng nghĩa, sửa lỗi chính tả, phát hiện ngôn ngữ hoặc phân tích ngữ cảnh. Cách xử lý NFKD được dùng đồng đều với Hangul, nhưng mã không có tokenizer hay kiểm thử riêng cho tiếng Hàn; không nên suy ra chất lượng phân loại tiếng Hàn chỉ từ việc chuỗi được chuẩn hóa.

Điều kiện allTerms khá dễ giải thích nhưng cũng nghiêm: thiếu một từ, đổi cách viết hoặc đặt cụm từ khác đi là bài không qua. Nếu nhiều bài cùng khớp, title/slug và ngày phân hạng; đây không phải đánh giá chất lượng thực sự. ID và title trùng được lọc trong một lần render, nhưng backlog hiện không có kiểm tra gần trùng ngữ nghĩa hay kiểm tra tự động cho mọi trường.

Với kho hiện tại, thao tác là quét collection và metadata lúc build. Mã không duy trì chỉ mục tăng dần, nhưng cũng không chạy theo mỗi lượt truy cập. Nếu kho tăng lớn, cần đo thời gian build và số lần lặp thực tế trước khi chọn tối ưu; chưa có dữ liệu trong repository để khẳng định một ngưỡng hiệu năng cụ thể. Cấu trúc tĩnh không đòi hỏi database chỉ để tạo các trang category hay card này.

## Hướng cải thiện tiếp theo

Tôi sẽ ưu tiên khả năng giải thích và kiểm tra biên tập trước khi thêm hệ thống ngữ nghĩa: một lệnh read-only có thể in bài nguồn, backlog entry, metadata đã chuẩn hóa, điều kiện đạt/trượt và lý do xếp thứ tự. Tiếp theo là kiểm tra schema backlog chặt hơn, cảnh báo ID/title gần trùng và cho phép override category rõ ràng ngay trong front matter.

Nếu sau này nội dung đa ngôn ngữ tăng, có thể bổ sung quy tắc tokenization phù hợp từng ngôn ngữ và bộ ví dụ hồi quy được biên tập. Embedding hoặc LLM có thể được thử như bước enrichment tùy chọn, nhưng phải lưu kết quả có thể kiểm tra và giữ cơ chế xuất bản tĩnh. Đó là đề xuất tương lai, không phải năng lực đang có.

## Bên trong source code Blogmoi

- **Related Posts và collection category:** [eleventy.config.mjs](https://github.com/blogco/blogmoi/blob/main/eleventy.config.mjs)
- **Khớp backlog, trạng thái và danh sách gợi ý:** [lib/editorial-topic-discovery.js](https://github.com/blogco/blogmoi/blob/main/lib/editorial-topic-discovery.js)
- **Dữ liệu chủ đề biên tập:** [data/editorial-topic-suggestions.json](https://github.com/blogco/blogmoi/blob/main/data/editorial-topic-suggestions.json)
- **Trang danh sách và trang chi tiết category:** [src/categories/index.njk](https://github.com/blogco/blogmoi/blob/main/src/categories/index.njk), [src/categories/category.njk](https://github.com/blogco/blogmoi/blob/main/src/categories/category.njk)
- **Nơi template gọi hai bộ lọc:** [src/_includes/layouts/article.njk](https://github.com/blogco/blogmoi/blob/main/src/_includes/layouts/article.njk)
- **Markup card Topic Discovery:** [src/_includes/components/topic-discovery.njk](https://github.com/blogco/blogmoi/blob/main/src/_includes/components/topic-discovery.njk)
- **Bài dùng trong ví dụ:** [src/posts/vi-sao-blogmoi-chon-be-vietnam-pro.md](https://github.com/blogco/blogmoi/blob/main/src/posts/vi-sao-blogmoi-chon-be-vietnam-pro.md)
- **Build và triển khai Pages:** [.github/workflows/deploy.yml](https://github.com/blogco/blogmoi/blob/main/.github/workflows/deploy.yml)

## Kết luận

Khám phá theo chủ đề giúp Blogmoi nối bài viết thành một thư viện dễ đi tiếp, nhưng cách triển khai hôm nay không phải một hệ thống tự học nội dung. Category đến từ front matter; Related Posts lọc theo category; Topic Discovery đọc backlog biên tập, đối chiếu một số trường metadata bằng quy tắc JavaScript và dựng kết quả thành HTML tĩnh.

Tôi thích tính năng này vì nó biến việc xuất bản thành cơ hội tạo liên kết có chủ đích giữa các bài. Điều đáng giữ khi phát triển tiếp là sự minh bạch: mỗi đề xuất nên truy ngược được tới metadata, điều kiện khớp hoặc quyết định biên tập cụ thể. Với cách đó, người đọc hiểu vì sao có gợi ý, còn người bảo trì biết cần sửa dữ liệu nào khi kết quả chưa hợp lý.
