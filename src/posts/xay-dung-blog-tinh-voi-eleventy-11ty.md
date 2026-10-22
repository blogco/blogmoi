---
title: "Xây dựng blog tĩnh với Eleventy (11ty): Tech Stack, kiến trúc và hướng dẫn từ A–Z"
slug: xay-dung-blog-tinh-voi-eleventy-11ty
description: "Hướng dẫn Eleventy 3.1.7 từ mã nguồn Blogmoi: cấu trúc Nunjucks, collections, bài Markdown, GitHub Actions, GitHub Pages, SEO và quy trình xuất bản."
seoTitle: "Xây dựng blog tĩnh với Eleventy (11ty): hướng dẫn A–Z"
seoDescription: "Tìm hiểu cách Blogmoi dùng Eleventy 3.1.7, Nunjucks và GitHub Pages để tạo blog tĩnh: từ cấu trúc mã nguồn, viết bài đến build và triển khai."
canonical: "https://blogco.github.io/blogmoi/xay-dung-blog-tinh-voi-eleventy-11ty/"
date: 2026-10-22
lastModified: 2026-10-22
lang: vi
author: Blogmoi
categories:
  - Công nghệ
  - Web Development
tags:
  - Eleventy
  - 11ty
  - Static Site Generator
  - JavaScript
  - GitHub Pages
  - Blogmoi
featured: true
---

Blog tĩnh có thể phục vụ nội dung mà không cần máy chủ ứng dụng hay cơ sở dữ liệu. Blogmoi lưu bài bằng Markdown, dùng Eleventy tạo HTML rồi để GitHub Pages phân phối tệp. Hướng dẫn này giải thích cách hệ thống hiện tại hoạt động và cách bảo trì.

> **Phạm vi:** Các phiên bản, lệnh và tính năng được nêu dưới đây đối chiếu với repository và workflow hiện tại. Không có số liệu benchmark hiệu năng trong repo, vì vậy bài không đưa ra tuyên bố định lượng.

## Mục lục

- [Eleventy và cách tạo trang tĩnh](#eleventy-va-cach-tao-trang-tinh)
- [Tech stack đang chạy Blogmoi](#tech-stack-dang-chay-blogmoi)
- [Cấu trúc thư mục](#cau-truc-thu-muc)
- [Templates, dữ liệu và collections](#templates-du-lieu-va-collections)
- [Trang chủ, bài viết và chủ đề](#trang-chu-bai-viet-va-chu-de)
- [Chạy Blogmoi trên máy cá nhân](#chay-blogmoi-tren-may-ca-nhan)
- [Viết và xuất bản bài viết](#viet-va-xuat-ban-bai-viet)
- [Từ Git đến GitHub Pages](#tu-git-den-github-pages)
- [SEO, tìm kiếm và hiệu suất](#seo-tim-kiem-va-hieu-suat)
- [Lỗi thường gặp](#loi-thuong-gap)
- [Phase 2: Visual CMS](#phase-2-visual-cms)
- [Câu hỏi thường gặp](#cau-hoi-thuong-gap)

## Eleventy và cách tạo trang tĩnh

**Eleventy (11ty)** là SSG (*Static Site Generator*), công cụ đọc nội dung và template lúc build rồi xuất HTML, CSS, JavaScript cùng dữ liệu tĩnh. Trình duyệt nhận các tệp đã tạo, không cần máy chủ dựng lại từng trang cho mỗi lượt đọc.

Ở Blogmoi, luồng chính là:

```text
src/posts/*.md + front matter ─┐
src/*.njk + layouts/includes ───┼─> Eleventy build ─> _site/ ─> Pages artifact ─> GitHub Pages
static/* ──────────────────────┘
```

Front matter là YAML đầu file Markdown để khai báo tiêu đề, slug, ngày và metadata. Eleventy chuyển nội dung thành HTML, đưa qua layout Nunjucks rồi ghi vào `_site/`; người đọc không cần Eleventy để xem trang.

### Vì sao Blogmoi dùng Eleventy thay Hugo?

Repo hiện tại cho thấy Blogmoi đã chuyển từ Hugo sang Eleventy. Tài liệu triển khai ghi nhận workflow Hugo trước đây tải sai thư mục: artifact trông đợi `_site/` trong khi Hugo xuất `public/`. Đây là lỗi khớp cấu hình triển khai, không phải bằng chứng Hugo không phù hợp hay Eleventy nhanh hơn.

Có thể suy ra Eleventy phù hợp với JavaScript ESM, Nunjucks và hàm tùy biến trong `eleventy.config.mjs`; cấu hình hiện tại cũng xuất `_site/` đúng nơi workflow Pages tìm artifact. Đây là suy luận từ source, không phải lý do chính thức đã được ghi lại. Hugo dùng Go và template riêng; cả hai đều tạo site tĩnh. Repo không có benchmark so sánh.

| Tiêu chí | Blogmoi với Eleventy | Hugo |
| --- | --- | --- |
| Ngôn ngữ xử lý template | JavaScript ESM, Nunjucks, Markdown | Go template, Markdown |
| Cấu hình trong repo | `eleventy.config.mjs`, dependency npm | Không còn cấu hình Hugo trong workflow hiện hành |
| Đầu ra triển khai hiện tại | `_site/`, khớp Pages artifact | Repo ghi nhận workflow cũ từng xuất `public/` |
| So sánh tốc độ | Chưa đo trong repo | Chưa đo cùng điều kiện trong repo |

## Tech stack đang chạy Blogmoi

- **Node.js:** `.nvmrc` chọn 24; `package.json` yêu cầu từ 24 trở lên; GitHub Actions cài Node 24.
- **JavaScript ESM:** `package.json` đặt `"type": "module"`; cấu hình dùng `export default`.
- **Eleventy:** dependency trực tiếp duy nhất là `@11ty/eleventy@3.1.7`, khóa trong `package-lock.json` và cài bằng `npm ci`.
- **Markdown và Nunjucks:** bài viết dùng `.md`, template dùng `.njk`; cấu hình chọn Nunjucks cho HTML lẫn Markdown.
- **CSS:** `static/css/site.css` dùng CSS thuần, biến giao diện, media query và các lớp component; không có Tailwind hay framework CSS.
- **JavaScript trình duyệt:** hai script thuần điều khiển menu, giao diện sáng/tối và tìm kiếm trên chỉ mục tĩnh.
- **Triển khai:** GitHub Actions chạy `npm ci`, `npm run build`, tải `_site/` làm Pages artifact rồi triển khai bằng GitHub Pages Actions.

`package.json` không khai báo framework giao diện, máy chủ ứng dụng hay CMS. Dependency gián tiếp nằm trong lockfile; khi thêm package, cập nhật cả manifest lẫn lockfile.

## Cấu trúc thư mục

```text
blogmoi/
├── .github/workflows/deploy.yml  # build và deploy GitHub Pages
├── eleventy.config.mjs           # thư mục, collections, filters, path prefix
├── package.json                  # lệnh npm và dependency trực tiếp
├── package-lock.json             # phiên bản dependency đã khóa
├── src/
│   ├── _data/                    # site.json, dữ liệu tính toán
│   ├── _includes/
│   │   ├── layouts/              # article.njk, base.njk
│   │   └── partials/             # header, footer, head, article card
│   ├── posts/                    # bài Markdown và posts.11tydata.js
│   ├── categories/               # trang danh mục và mẫu trang chủ đề
│   ├── tags/                     # trang thẻ và mẫu trang tag
│   ├── archives/                 # kho bài viết
│   ├── search/                   # giao diện tìm kiếm
│   ├── index.njk                 # trang chủ
│   ├── search-index.njk          # search-index.json
│   ├── index.xml.njk             # RSS
│   └── sitemap.njk               # sitemap.xml
├── static/
│   ├── css/site.css              # giao diện
│   ├── js/                       # nâng cấp tương tác
│   └── images/                   # ảnh và dấu hiệu thương hiệu
└── _site/                        # đầu ra build, không sửa thủ công
```

`src/` là đầu vào. `_includes/` chứa layout và partial dùng lại; `static/` được sao chép nguyên trạng. `_site/` là đầu ra tạo lại được, không sửa nội dung trực tiếp ở đó.

## Templates, dữ liệu và collections

`src/posts/posts.11tydata.js` đặt layout, ngôn ngữ, tác giả mặc định và permalink `/<slug>/`. Front matter từng bài có thể ghi đè mặc định. `src/_data/site.json` cung cấp tên, mô tả, origin, ngôn ngữ và prefix toàn site.

Eleventy hợp nhất dữ liệu theo **data cascade** (thứ tự ưu tiên): computed data và front matter có thể ghi đè giá trị mặc định cấp thư mục hoặc toàn site. `eleventyComputed.js` cung cấp năm hiện tại và dữ liệu điều hướng.

`eleventy.config.mjs` định nghĩa ba collection tùy chỉnh:

- `posts`: tìm Markdown trong `src/posts/**/*.md`, bỏ bài có `draft`, sắp xếp mới nhất trước.
- `categoryGroups`: gom bài theo `categories` và tạo slug URL cho từng nhóm.
- `tagGroups`: gom theo `tags`, đồng thời bỏ nhãn nội bộ `posts` khỏi danh sách tag hiển thị.

Collection là danh sách nội dung để template duyệt. Trang chủ, kho bài, chủ đề và tag dùng các danh sách này; metadata nằm trong `post.data`, còn URL do Eleventy cung cấp.

**Layout** là khung HTML; `layouts/article.njk` bọc nội dung bằng `layouts/base.njk`. **Include** là đoạn giao diện dùng lại, như `partials/head.njk` và `partials/article-card.njk`. Nunjucks cung cấp vòng lặp và điều kiện để tránh lặp markup.

**Filter** biến đổi dữ liệu trong template. Repo định nghĩa `dateReadable`, `readingTime`, `relatedPosts`, `searchData`, `xmlEscape`, `slugify` và `toc`. `{{ date | dateReadable }}` định dạng ngày; `{{ content | toc | safe }}` tạo mục lục H2/H3. Chỉ dùng `safe` với HTML có chủ đích, không dùng để chèn dữ liệu không đáng tin cậy.

## Trang chủ, bài viết và chủ đề

`src/index.njk` hiển thị bài nổi bật, chủ đề và bài mới. `archives/index.njk` là kho bài; `categories/index.njk` liệt kê chủ đề; `category.njk` dùng pagination (tạo một trang cho mỗi mục) để sinh trang category. Trang tag dùng mẫu tương tự.

Mỗi file trong `src/posts/` thành trang `/<slug>/`. Layout hiển thị metadata, mục lục, nội dung, tag và bài liên quan. Homepage và taxonomy dùng chung partial thẻ bài.

## Chạy Blogmoi trên máy cá nhân

Cần Node.js 24 trở lên. Trong thư mục repo, chạy:

```sh
npm ci
npm run build
```

Build gọi Eleventy với `--pathprefix=/blogmoi/` và ghi vào `_site/`. Để xem bản dựng bằng máy chủ tĩnh:

```sh
python3 -m http.server 8000 -d _site
```

Mở `http://localhost:8000/blogmoi/`. Đây chỉ là máy chủ tĩnh cục bộ; `npm run build:local` chạy Eleventy không thêm prefix.

## Viết và xuất bản bài viết

Tạo file tên kebab-case trong `src/posts/`, chẳng hạn `huong-dan-moi.md`. Dùng front matter tương tự:

```yaml
---
title: "Tiêu đề bài viết"
slug: huong-dan-moi
description: "Tóm tắt nội dung bài viết."
date: 2026-10-22
lang: vi
author: Blogmoi
categories:
  - Công nghệ
tags:
  - Eleventy
seoTitle: "Tiêu đề SEO"
seoDescription: "Mô tả hiển thị trên công cụ tìm kiếm."
canonical: "https://blogco.github.io/blogmoi/huong-dan-moi/"
---

## Tiêu đề phần

Viết nội dung bằng Markdown.
```

Giữ slug ổn định để URL không đổi. Đặt ảnh trong `static/`, dùng đường dẫn như `/images/ten-anh.webp`; template thêm prefix khi render. Không sửa `_site/` bằng tay.

Phase 1 chưa có CMS. Sửa Markdown, kiểm tra thay đổi, build, commit rồi push; workflow Pages tự chạy trên `main`. Bài xuất bản khi deployment xong và URL production có nội dung mới.

## Từ Git đến GitHub Pages

Quy trình là **One Feature → One Commit → One Push → One Deployment → One ASCII Report**. Với một bài, kiểm tra `git status`, stage đúng file, commit riêng, push lên `main`, theo dõi workflow và ghi kết quả vào báo cáo ASCII. Commit đơn mục tiêu giúp lịch sử thay đổi dễ rà soát.

`.github/workflows/deploy.yml` chạy khi push vào `main` hoặc thủ công: checkout, cài Node 24, chạy `npm ci` và `npm run build`. `actions/upload-pages-artifact@v4` đóng gói `_site/`; `actions/deploy-pages@v4` phát hành. Pages phục vụ file tĩnh, không chạy Eleventy cho mỗi lượt đọc.

GitHub Pages đặt site repository dưới `/blogmoi/`. Cấu hình path prefix và filter `url` thêm đoạn này vào liên kết; permalink source vẫn là `/slug/`. Artifact chứa `_site/<slug>/index.html`, URL công khai là `https://blogco.github.io/blogmoi/<slug>/`.

## SEO, tìm kiếm và hiệu suất

Layout xuất meta description, canonical, Open Graph, Twitter card, RSS và sitemap. Bài viết có JSON-LD `BlogPosting`. `sitemap.njk`, `index.xml.njk` và `search-index.njk` tạo sitemap, RSS và `search-index.json` từ source tại build.

Tìm kiếm tải chỉ mục và tạo kết quả bằng `document.createElement` cùng `textContent`, không chèn chuỗi tìm thấy thành HTML; liên kết bị giới hạn trong origin và `/blogmoi/`. Media query điều chỉnh giao diện; bảng và code block cuộn ngang ở màn hình hẹp. JS xử lý menu, phím tắt, theme theo cài đặt hệ thống; CSS tôn trọng reduced motion.

HTML tĩnh, JavaScript tối giản, CSS thuần, ảnh lazy-load trên thẻ và không tải font ngoài là các lựa chọn hiện có. Chúng không phải benchmark; repo chưa có số liệu Core Web Vitals hoặc thời gian tải.

## Lỗi thường gặp

1. **Liên kết thiếu `/blogmoi/`:** kiểm tra template có dùng filter `url`, và build có `--pathprefix=/blogmoi/`.
2. **Bài không xuất hiện trong danh sách:** kiểm tra file nằm trong `src/posts/`, front matter không đặt `draft: true`, và có metadata YAML hợp lệ.
3. **Bài có URL sai:** dùng slug ổn định, lowercase kebab-case; kiểm tra `slug` và permalink được kế thừa từ `posts.11tydata.js`.
4. **Ảnh 404:** xác nhận file nằm trong `static/`, tên chữ hoa/thường đúng và đường dẫn bắt đầu từ `/`.
5. **Trang tìm kiếm trống:** kiểm tra `_site/search-index.json` đã được tạo cùng trang `/search/`; tìm kiếm chỉ có dữ liệu của các bài trong collection.
6. **Workflow báo thiếu artifact:** xác nhận build tạo `_site/` và bước upload dùng đúng thư mục đó. Lỗi Hugo trước đây bắt nguồn từ việc artifact chờ `public/`/`_site/` không khớp đầu ra.
7. **`npm ci` thất bại:** dùng Node tương thích với yêu cầu trong `package.json`, không tự sửa lockfile để né lỗi; đọc log cài dependency rồi cập nhật manifest và lockfile có chủ đích.

Chạy `npm run build`, rồi kiểm tra HTML trong `_site/`, sitemap, RSS và `search-index.json`. Build thành công xác nhận file được tạo, không thay thế kiểm tra giao diện trình duyệt.

## Phase 2: Visual CMS

Visual CMS WYSIWYG là roadmap, chưa hoạt động. Tài liệu repo dự kiến editor tạo bundle Markdown, metadata và media đã xác thực trong source tree; phát hành vẫn tạo commit trong `blogco/blogmoi` để Actions triển khai.

Hiện tại chỉ xuất bản qua Git. Phase 1 không có route admin, đăng nhập, API publish, lưu nháp trên trình duyệt hay chức năng publish trực tiếp từ Pages.

## Câu hỏi thường gặp

### Tôi có thể viết bài trên trình duyệt không?

Hiện không có editor trên site. Hãy tạo hoặc sửa Markdown trong repo rồi đưa thay đổi qua Git.

### URL bài viết có chứa `/blogmoi/` không?

Có. Slug được giữ ở dạng `/<slug>/` trong source, còn GitHub Pages phục vụ site tại `/blogmoi/`, nên URL đầy đủ gồm prefix đó.

### Thay CSS có cần cài framework không?

Không. CSS giao diện nằm trong `static/css/site.css`; hiện tại repo dùng CSS thuần.

### Build thành công có nghĩa bài đã online chưa?

Chưa. Build chỉ tạo `_site/`. Bài online sau khi push, GitHub Actions hoàn tất deployment và URL trên Pages trả bài mới.

### Tôi xem tài liệu Eleventy ở đâu?

Tham khảo [tài liệu Eleventy chính thức](https://www.11ty.dev/docs/), đặc biệt các trang về [cấu hình](https://www.11ty.dev/docs/config/), [collections](https://www.11ty.dev/docs/collections/), [dữ liệu](https://www.11ty.dev/docs/data/), [layouts](https://www.11ty.dev/docs/layouts/) và [filters](https://www.11ty.dev/docs/filters/). Với Hugo, xem [giới thiệu template chính thức](https://gohugo.io/templates/introduction/).

## Kết luận

Blogmoi kết hợp nội dung Markdown, metadata front matter, template Nunjucks và cấu hình JavaScript của Eleventy để tạo một site tĩnh có thể triển khai qua GitHub Pages. Để duy trì site, hãy sửa source trong `src/` hoặc `static/`, giữ URL ổn định, chạy build và đưa thay đổi qua một commit riêng. Cách làm này khiến bài viết, giao diện và quy trình deploy cùng nằm trong lịch sử Git có thể kiểm tra; Visual CMS vẫn là kế hoạch cho một phase sau.

Để khám phá site, xem [kho bài viết](https://blogco.github.io/blogmoi/archives/), [chủ đề Công nghệ](https://blogco.github.io/blogmoi/categories/cong-nghe/), [tìm kiếm](https://blogco.github.io/blogmoi/search/) hoặc [giới thiệu Blogmoi](https://blogco.github.io/blogmoi/about/).
