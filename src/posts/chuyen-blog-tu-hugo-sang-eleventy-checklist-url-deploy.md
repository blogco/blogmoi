---
title: "Chuyển blog từ Hugo sang Eleventy (11ty): Checklist giữ URL và quy trình deploy không gián đoạn"
slug: chuyen-blog-tu-hugo-sang-eleventy-checklist-url-deploy
description: "Checklist chuyển blog từ Hugo sang Eleventy: giữ permalink, Markdown và front matter, chuyển Nunjucks, kiểm tra /blogmoi/, SEO, GitHub Actions và rollback."
seoTitle: "Checklist chuyển Hugo sang Eleventy: giữ URL và deploy"
seoDescription: "Checklist chuyển blog từ Hugo sang Eleventy: giữ permalink, Markdown và front matter, chuyển Nunjucks, kiểm tra /blogmoi/, SEO, GitHub Actions và rollback."
canonical: "https://blogco.github.io/blogmoi/chuyen-blog-tu-hugo-sang-eleventy-checklist-url-deploy/"
date: "2026-10-23T00:00:00+07:00"
lastModified: "2026-10-23T00:00:00+07:00"
lang: vi
author: Blogmoi
categories:
  - Công nghệ
  - Web Development
tags:
  - Hugo
  - Eleventy
  - 11ty
  - Static Site Generator
  - GitHub Pages
  - SEO
  - Website Migration
dictionaryTerms:
  - Hugo
  - Eleventy
  - permalink
  - GitHub Pages
  - GitHub Actions
keyPoints:
  - Chuyển từ Hugo sang Eleventy cần kiểm soát cả nội dung, template, URL, tài nguyên tĩnh và quy trình triển khai.
  - Giữ nguyên URL đã xuất bản là ưu tiên hàng đầu để hạn chế liên kết gãy và ảnh hưởng đến khả năng tìm kiếm.
  - Hugo sử dụng hệ thống template của Go, trong khi Eleventy hỗ trợ nhiều ngôn ngữ template, bao gồm Nunjucks.
  - GitHub Pages cần được cấu hình chính xác đường dẫn `/blogmoi/` để CSS, JavaScript, hình ảnh và liên kết hoạt động.
  - Một checklist kiểm thử trước và sau deploy giúp phát hiện lỗi sớm hơn so với chỉ dựa vào trạng thái thành công của GitHub Actions.
faq:
  - question: "Chuyển từ Hugo sang Eleventy có làm mất SEO không?"
    answer: "Không nhất thiết. Tuy nhiên, việc thay đổi URL, canonical, metadata hoặc khả năng thu thập dữ liệu có thể ảnh hưởng đến hiệu suất tìm kiếm. Cần kiểm tra kỹ trước và sau migration."
  - question: "Có thể giữ nguyên bài viết Markdown từ Hugo không?"
    answer: "Phần lớn nội dung Markdown có thể được tái sử dụng, nhưng front matter, shortcode và các tính năng phụ thuộc Hugo có thể cần điều chỉnh."
  - question: "Eleventy có build nhanh hơn Hugo không?"
    answer: "Không có kết luận chung cho mọi dự án. Tốc độ phụ thuộc nội dung, template, cấu hình và môi trường build. Repository Blogmoi không có benchmark chạy Hugo và Eleventy trên cùng điều kiện."
  - question: "GitHub Pages có hỗ trợ redirect 301 không?"
    answer: "GitHub Pages triển khai các tệp tĩnh; workflow của Blogmoi không khai báo máy chủ hay quy tắc redirect HTTP. Nếu phải đổi URL, hãy xác minh giải pháp redirect của host hoặc proxy đang dùng; trang HTML tự chuyển hướng không đồng nghĩa với HTTP 301. Với Blogmoi, nên giữ nguyên permalink để tránh phát sinh ánh xạ mới."
  - question: "Có cần xây lại CMS khi chuyển sang Eleventy không?"
    answer: "Không bắt buộc. Có thể xuất bản bài Markdown qua Git. CMS là lớp biên tập riêng, không phải điều kiện để Eleventy tạo website tĩnh."
sourcePublisher: "Tài liệu chính thức của Eleventy, Hugo, GitHub Pages, GitHub Actions và Google Search Central"
copyrightHolder: "Blogmoi"
editorialNote: "Lịch sử Git ghi nhận Blogmoi thay cấu hình và template Hugo bằng Eleventy ngày 22-10-2026. Điều đó xác nhận thay đổi mã nguồn, nhưng không chứng minh production cutover không gián đoạn hoặc kết quả kiểm thử sau deploy. Checklist dưới đây là hướng dẫn thực hành, không phải báo cáo kiểm thử migration."
copyrightNotice: "Ví dụ và checklist mang tính hướng dẫn; hãy đối chiếu permalink, đường dẫn và workflow với repository thực tế trước khi triển khai."
---

*Chuyển đổi Static Site Generator không đơn giản là thay một công cụ build. Đó còn là quá trình bảo toàn cấu trúc nội dung, đường dẫn, SEO và trải nghiệm của người đọc.*

- **Chuyên mục:** Công nghệ / Web Development
- **Series:** Behind the Build — Hậu trường xây dựng Blogmoi
- **Tags:** Hugo, Eleventy, 11ty, Static Site Generator, GitHub Pages, SEO, Website Migration

## 1. Vì sao tôi quyết định chuyển từ Hugo sang Eleventy?

Khi bắt đầu xây dựng một blog tĩnh, Hugo là lựa chọn đáng cân nhắc. Công cụ này xử lý Markdown, có hệ thống template riêng và cho phép cấu hình permalink theo section. Cấu hình Hugo cũ của Blogmoi đặt `baseURL` là `https://blogco.github.io/blogmoi/`, khai báo permalink bài viết `/:slug/`, cùng taxonomy category và tag.

Lịch sử Git ghi nhận một commit migration vào ngày 22-10-2026: repository bỏ `hugo.toml` và các layout Hugo, thêm `eleventy.config.mjs`, package npm và template Nunjucks trong `src/`. Đây là bằng chứng về việc chuyển mã nguồn trong repository; commit đó không tự chứng minh thời điểm production được đổi, tình trạng uptime hay kết quả kiểm thử sau deploy. [Xem commit migration của Blogmoi](https://github.com/blogco/blogmoi/commit/14f1870a1f40aa57af5c69f3965205b06e778f38).

Trong bài so sánh SSG đã xuất bản, Blogmoi ghi nhận lý do chọn Eleventy là khả năng tự thiết kế giao diện và quy trình GitHub Pages phù hợp với giai đoạn hiện tại. Eleventy tích hợp JavaScript và nhiều ngôn ngữ template, trong đó Blogmoi cấu hình Nunjucks. Đây là lựa chọn theo nhu cầu của dự án, không phải kết luận Hugo kém hơn hay Eleventy build nhanh hơn.

Vấn đề quan trọng hơn là: **Làm thế nào để thay đổi công nghệ mà không làm mất những gì website đã xây dựng?**

> **Phạm vi bài viết:** Checklist dưới đây mô tả cách lập kế hoạch và kiểm tra một migration. Source history của Blogmoi xác nhận thay đổi mã nguồn, nhưng không có báo cáo chứng minh migration production đã hoàn tất không gián đoạn.

## 2. Những gì cần giữ lại khi thay đổi Static Site Generator

Một website không chỉ bao gồm mã nguồn. Sau khi xuất bản, website còn có các URL được công cụ tìm kiếm lập chỉ mục, liên kết được chia sẻ và hình ảnh được sử dụng trong nhiều bài viết.

Vì vậy, trước khi chuyển đổi, tôi chia các thành phần thành năm nhóm cần kiểm tra.

| Thành phần | Mục tiêu chuyển đổi |
|---|---|
| Bài viết | Giữ nội dung, tiêu đề, ngày đăng, tác giả và metadata |
| URL | Giữ nguyên đường dẫn công khai nếu có thể |
| Template | Tái tạo giao diện bằng Nunjucks và CSS |
| Tài nguyên | Giữ đường dẫn hợp lệ cho hình ảnh, CSS và JavaScript |
| Deploy | Build và xuất bản ổn định qua GitHub Actions |

Đây là nguyên tắc tôi sử dụng xuyên suốt quá trình migration: **thay đổi hệ thống bên trong, hạn chế thay đổi địa chỉ mà người đọc nhìn thấy.**

## 3. Bước 1 — Kiểm kê toàn bộ URL trước khi chuyển đổi

Đây là bước dễ bị bỏ qua nhưng có ảnh hưởng lớn đến SEO.

Ví dụ giả định, nếu bài viết cũ có URL:

```text
https://blogco.github.io/blogmoi/huong-dan-eleventy/
```

Sau khi chuyển sang Eleventy, đường dẫn lý tưởng vẫn phải là:

```text
https://blogco.github.io/blogmoi/huong-dan-eleventy/
```

Không nên vô tình chuyển thành:

```text
https://blogco.github.io/blogmoi/posts/huong-dan-eleventy/
```

Hai đường dẫn trên là hai URL khác nhau, ngay cả khi nội dung giống hệt nhau.

### Checklist URL

- [ ] Xuất danh sách URL từ sitemap hoặc dữ liệu website cũ.
- [ ] Lưu lại URL của từng bài viết và chuyên mục.
- [ ] Ghi nhận canonical URL.
- [ ] Kiểm tra URL chứa dấu tiếng Việt, ký tự đặc biệt hoặc đường dẫn lồng nhau.
- [ ] Xác định URL nào cần giữ nguyên.
- [ ] Tạo bảng ánh xạ URL cũ và mới nếu có thay đổi.
- [ ] Kiểm tra lại toàn bộ URL sau khi build.

Tôi khuyên tạo một file kiểm kê như sau:

```csv
old_url,new_url,status
/blogmoi/bai-viet-a/,/blogmoi/bai-viet-a/,preserved
/blogmoi/bai-viet-b/,/blogmoi/bai-viet-b/,preserved
/blogmoi/bai-cu/,/blogmoi/bai-moi/,redirect-required
```

Với URL không thể giữ nguyên, cần có phương án chuyển hướng hoặc trang điều hướng thay thế. GitHub Pages trong workflow hiện tại của Blogmoi nhận artifact tĩnh; repository không khai báo máy chủ hay quy tắc redirect HTTP. Vì vậy, đừng mặc định rằng chỉ cần đổi permalink trong Eleventy là có redirect 301. Hãy xác minh khả năng của host hoặc proxy đang phục vụ site. Google khuyến nghị lập URL mapping, cập nhật canonical và internal links, rồi dùng permanent server-side redirect khi host hỗ trợ.

## 4. Bước 2 — Chuyển nội dung Markdown và Front Matter

Cả Hugo và Eleventy đều có thể sử dụng Markdown, nhưng cách xử lý metadata và cấu trúc nội dung có thể khác nhau.

Ví dụ, một bài viết Hugo có front matter:

```yaml
---
title: "Tối ưu blog tĩnh"
date: 2026-10-20
draft: false
tags:
  - Eleventy
  - SEO
---
```

Khi chuyển sang Eleventy, cần kiểm tra cách dự án mới sử dụng các trường này.

Đặc biệt, không nên mặc định rằng mọi trường front matter của Hugo đều có tác dụng tương đương trong Eleventy.

Các trường cần quan tâm gồm tiêu đề, ngày đăng, tác giả, slug, mô tả SEO, chuyên mục, tag, ảnh đại diện và trạng thái xuất bản.

Một lỗi thường gặp là chuyển được nội dung Markdown nhưng làm mất metadata, khiến bài viết không xuất hiện đúng trong danh sách bài mới hoặc chuyên mục.

### Checklist nội dung

- [ ] Không mất đoạn văn, bảng, danh sách hoặc code block.
- [ ] Giữ ngày xuất bản gốc.
- [ ] Giữ slug hoặc permalink.
- [ ] Chuyển đúng categories và tags.
- [ ] Không công khai bài draft.
- [ ] Kiểm tra shortcode Hugo không còn được hỗ trợ.
- [ ] Kiểm tra đường dẫn hình ảnh trong Markdown.

## 5. Bước 3 — Chuyển từ Hugo Template sang Eleventy Nunjucks

Đây là một trong những thay đổi kỹ thuật quan trọng nhất.

Hugo sử dụng hệ thống template Go. Eleventy hỗ trợ nhiều ngôn ngữ template; repository Blogmoi chọn Nunjucks cho Markdown và HTML thông qua `markdownTemplateEngine` và `htmlTemplateEngine` trong `eleventy.config.mjs`.

Ví dụ minh họa với Hugo:

{% raw %}
```go-html-template
{{ range .Site.RegularPages }}
  <a href="{{ .RelPermalink }}">
    {{ .Title }}
  </a>
{{ end }}
```
{% endraw %}

Trong Eleventy, cách tiếp cận có thể sử dụng collection:

{% raw %}
```njk
{% for post in collections.posts %}
  <a href="{{ post.url }}">
    {{ post.data.title }}
  </a>
{% endfor %}
```
{% endraw %}

Điều cần lưu ý là `collections.posts` phải được định nghĩa hoặc hình thành từ dữ liệu thực tế của dự án. Nó không tự động tồn tại trong mọi cấu hình Eleventy. Blogmoi tự định nghĩa collection `posts` bằng các file Markdown trong `src/posts/**/*.md` và loại bài được đánh dấu `draft`.

Tôi ưu tiên chia giao diện thành các thành phần có thể tái sử dụng như header, footer, article layout, key points, bảng mục lục, bài viết liên quan và Q&A.

Nhờ đó, một thay đổi trong component có thể được áp dụng nhất quán trên nhiều trang.

### Checklist template

- [ ] Trang chủ hiển thị đúng bài viết mới.
- [ ] Trang chi tiết bài viết có đầy đủ metadata.
- [ ] Chuyên mục và tag hoạt động.
- [ ] Bảng mục lục liên kết đúng heading.
- [ ] Key Points hiển thị đúng nội dung.
- [ ] Footer bài viết giữ đủ ba phần: nguồn, liên kết nội bộ và Q&A.
- [ ] Không còn template hoặc shortcode Hugo bị bỏ sót.

## 6. Bước 4 — Kiểm soát đường dẫn `/blogmoi/` trên GitHub Pages

Blogmoi được cấu hình xuất bản tại:

`https://blogco.github.io/blogmoi/`

Đây là một GitHub Pages project site, có đường dẫn con `/blogmoi/`.

Điều đó có nghĩa những tài nguyên được tham chiếu từ root `/` có thể không trỏ đến vị trí mong muốn.

Ví dụ:

```html
<link rel="stylesheet" href="/assets/css/site.css">
```

Trình duyệt sẽ tìm tài nguyên tại:

```text
https://blogco.github.io/assets/css/site.css
```

Trong khi tài nguyên của Blogmoi có thể nằm tại:

```text
https://blogco.github.io/blogmoi/assets/css/site.css
```

Giải pháp là quản lý base path nhất quán, thông qua cấu hình Eleventy, filter URL hoặc cơ chế đường dẫn đang được dự án sử dụng. Trong source hiện tại, lệnh build thêm `--pathprefix=/blogmoi/`; template dùng filter `url`, còn permalink bài viết vẫn ở dạng `/<slug>/`. Không nên nối prefix thủ công trong nhiều chỗ vì dễ tạo đường dẫn lặp `/blogmoi/blogmoi/`.

### Checklist đường dẫn

- [ ] CSS tải thành công.
- [ ] JavaScript tải thành công.
- [ ] Ảnh đại diện hiển thị.
- [ ] Internal links hoạt động.
- [ ] RSS và sitemap chứa URL chính xác.
- [ ] Canonical không bị thiếu `/blogmoi/`.
- [ ] Không xuất hiện đường dẫn `/blogmoi/blogmoi/`.

## 7. Bước 5 — Thiết lập lại GitHub Actions Deployment

Sau khi chuyển công nghệ, workflow cũ dùng để build Hugo không còn phù hợp.

Eleventy sử dụng Node.js và các dependency được quản lý qua npm.

Một quy trình triển khai điển hình gồm:

```text
+----------------------------+
| PUSH TO MAIN               |
+----------------------------+
             |
             v
+----------------------------+
| GITHUB ACTIONS             |
| Checkout repository        |
+----------------------------+
             |
             v
+----------------------------+
| SETUP NODE.JS              |
| Install dependencies       |
| npm ci                     |
| Extract dictionary terms   |
+----------------------------+
             |
             v
+----------------------------+
| BUILD ELEVENTY             |
| npm run build              |
+----------------------------+
             |
             v
+----------------------------+
| UPLOAD PAGES ARTIFACT      |
+----------------------------+
             |
             v
+----------------------------+
| DEPLOY GITHUB PAGES        |
+----------------------------+
             |
             v
+----------------------------+
| VERIFY PRODUCTION          |
+----------------------------+
```

Trong workflow hiện tại của Blogmoi, push lên `main` kích hoạt cài Node.js 24, `npm ci`, trích xuất candidate từ điển, `npm run build`, upload thư mục `_site/` và deploy bằng các GitHub Pages Actions. Bước cuối trong sơ đồ là kiểm tra production sau workflow; đó là bước xác minh riêng, không phải kết quả được workflow hiện tại tự khẳng định.

Lệnh `npm run build` cần được kiểm tra trong `package.json`; không nên mặc định dự án nào cũng có script cùng tên.

Một workflow báo build thành công không có nghĩa toàn bộ deployment đã thành công.

Chẳng hạn, bước tạo artifact có thể gặp lỗi, khiến bước deploy bị bỏ qua.

Vì vậy, checklist nên kiểm tra riêng ba kết quả: build, upload artifact và deploy Pages. Sau deployment, cần mở URL production và thử một số trang để xác nhận nội dung thực tế.

## 8. Bước 6 — Kiểm tra SEO sau migration

Khi chuyển đổi hệ thống, giao diện có thể nhìn giống trước nhưng metadata bên trong đã thay đổi.

Đó là lý do SEO cần một checklist riêng.

| Hạng mục | Cần kiểm tra |
|---|---|
| Canonical | URL tuyệt đối chính xác |
| Sitemap | Chứa các trang được phép lập chỉ mục |
| Robots.txt | Không vô tình chặn nội dung |
| Meta description | Không bị mất sau migration |
| Open Graph | Đúng tiêu đề, ảnh và URL |
| Internal links | Không dẫn đến trang 404 |
| Structured data | Phản ánh đúng thông tin bài viết |
| RSS | Giữ feed hợp lệ nếu website cung cấp |

Tôi cũng lưu ý rằng việc giữ URL không tự động bảo đảm thứ hạng tìm kiếm. Nội dung, khả năng thu thập dữ liệu, hiệu suất và các tín hiệu khác vẫn có vai trò quan trọng. Google khuyên cập nhật canonical và liên kết nội bộ khi chuyển URL; sitemap mới giúp công cụ tìm kiếm phát hiện URL nhưng không bảo đảm lập chỉ mục tức thì.

## 9. Bước 7 — Kiểm thử trước khi chuyển sang production

Thay vì chỉ mở trang chủ để xem giao diện, tôi sử dụng một ma trận kiểm thử.

| Kiểm thử | Kết quả mong muốn |
|---|---|
| Trang chủ | Danh sách bài viết hiển thị |
| URL bài cũ | Truy cập được hoặc có phương án chuyển hướng |
| Bài viết dài | Heading, bảng và code không lỗi |
| Mobile | Không tràn ngang |
| TOC | Điều hướng đến đúng mục |
| Hình ảnh | Không có tài nguyên bị thiếu |
| Tìm kiếm | Trả về bài viết đã xuất bản |
| Related Posts | Không có liên kết gãy |
| Build | Hoàn tất không lỗi |
| GitHub Pages | Website được xuất bản thành công |

Đối với URL, có thể viết một script Node.js để so sánh danh sách trước và sau migration.

Đây là một dạng regression test hữu ích: thay vì nhớ thủ công từng trang, hệ thống tự báo URL nào đã biến mất hoặc thay đổi.

Danh sách trên là checklist đề xuất, không phải kết quả kiểm thử đã chạy cho migration lịch sử của Blogmoi.

## 10. Rollback — Điều gì xảy ra nếu deploy lỗi?

Migration cần có kế hoạch quay lại trạng thái ổn định.

Tôi ưu tiên giữ lịch sử Git rõ ràng và triển khai theo các thay đổi nhỏ, độc lập.

Nếu một phiên bản gây lỗi, có thể xác định commit liên quan, revert thay đổi và triển khai lại phiên bản đã được kiểm tra.

Không nên xóa toàn bộ lịch sử Git hoặc force-push chỉ để khôi phục website.

Ngoài ra, cần phân biệt hai tình huống: deployment mới thất bại và deployment mới thành công nhưng nội dung website có lỗi. Hai tình huống này đòi hỏi cách xác minh và khắc phục khác nhau.

## 11. Checklist tổng hợp khi chuyển Hugo sang Eleventy

### Trước migration

- [ ] Sao lưu repository và nội dung.
- [ ] Kiểm kê toàn bộ URL công khai.
- [ ] Lưu sitemap và cấu trúc chuyên mục.
- [ ] Ghi nhận front matter và tài nguyên.
- [ ] Xác định template cần chuyển.

### Trong migration

- [ ] Chuyển Markdown và metadata.
- [ ] Chuyển Hugo template sang Nunjucks.
- [ ] Kiểm tra collections và permalink.
- [ ] Cấu hình base path.
- [ ] Chuyển các component cần thiết.
- [ ] Xử lý shortcode không tương thích.

### Trước deploy

- [ ] Build Eleventy thành công.
- [ ] So sánh URL cũ và mới.
- [ ] Kiểm tra SEO metadata.
- [ ] Kiểm tra responsive.
- [ ] Kiểm tra CSS, JS và hình ảnh.
- [ ] Kiểm tra workflow GitHub Actions.

### Sau deploy

- [ ] Xác nhận GitHub Pages deployment thành công.
- [ ] Truy cập thử các URL cũ.
- [ ] Kiểm tra sitemap và canonical trên production.
- [ ] Kiểm tra liên kết nội bộ.
- [ ] Ghi nhận lỗi và phương án rollback.

## 12. Những bài học tôi rút ra

Điều tôi học được khi xây dựng Blogmoi là việc thay đổi công nghệ cần được nhìn nhận như một quá trình quản lý rủi ro, không chỉ là công việc viết lại mã nguồn.

Một hệ thống template mới có thể đẹp hơn. Một pipeline mới có thể đơn giản hơn. Nhưng nếu làm mất URL cũ, sai canonical hoặc khiến hình ảnh không tải được, quá trình migration vẫn chưa đạt yêu cầu.

Vì vậy, tôi ưu tiên ba nguyên tắc:

**Thứ nhất, bảo toàn những gì người đọc đang sử dụng.** URL, nội dung và trải nghiệm truy cập quan trọng hơn tên framework.

**Thứ hai, kiểm thử bằng dữ liệu thực tế.** Một checklist có thể thực thi và một báo cáo URL cụ thể hữu ích hơn cảm giác rằng website trông có vẻ ổn.

**Thứ ba, triển khai có thể kiểm chứng và quay lại.** Mỗi thay đổi nên có commit rõ ràng, kết quả build và trạng thái deploy thực tế.

## Bản quyền và dẫn nguồn

Bài viết do Blogmoi biên soạn dưới góc nhìn kỹ thuật và kinh nghiệm thiết kế hệ thống. Các ví dụ mã nguồn mang tính minh họa; cấu hình thực tế cần đối chiếu với repository.

Tài liệu tham khảo:

- [Eleventy Documentation](https://www.11ty.dev/docs/)
- [Eleventy — Nunjucks](https://www.11ty.dev/docs/languages/nunjucks/)
- [Eleventy — Collections](https://www.11ty.dev/docs/collections/)
- [Eleventy — Permalinks](https://www.11ty.dev/docs/permalinks/)
- [Hugo — Configure permalinks](https://gohugo.io/configuration/permalinks/)
- [GitHub Pages — Using custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Google Search Central — Site moves](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)

## Liên kết nội bộ

- [Xây dựng blog tĩnh với Eleventy (11ty): Tech Stack, kiến trúc và hướng dẫn từ A–Z](https://blogco.github.io/blogmoi/xay-dung-blog-tinh-voi-eleventy-11ty/)
- [Top 5 công nghệ tạo website tĩnh năm 2026: Astro, Eleventy, Hugo, SvelteKit hay Next.js?](https://blogco.github.io/blogmoi/top-5-cong-nghe-tao-website-tinh-2026/)
- [Vì sao Blogmoi chọn Be Vietnam Pro? Hành trình xây dựng Typography mạnh mẽ và tối ưu cho tiếng Việt](https://blogco.github.io/blogmoi/vi-sao-blogmoi-chon-be-vietnam-pro/)

## Kết luận — Migration thành công là khi người đọc không bị gián đoạn

Tôi chọn Eleventy (11ty) cho Blogmoi vì muốn một nền tảng tĩnh linh hoạt, dễ kiểm soát và phù hợp với hệ thống thiết kế riêng.

Nhưng bài học lớn nhất không nằm ở việc chọn Hugo hay Eleventy.

**Một cuộc chuyển đổi website thành công là khi công nghệ bên trong thay đổi, còn người đọc vẫn tìm được đúng nội dung họ cần, tại đúng địa chỉ quen thuộc.**

Đó là lý do tôi xem việc giữ URL, kiểm tra template và xác minh deployment là ba phần không thể tách rời trong quá trình xây dựng Blogmoi.
