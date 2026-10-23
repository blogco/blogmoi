# Blogmoi Editorial 2026

A fast, Vietnamese-first static editorial blog built with Eleventy 3.1.7, Nunjucks, modern CSS, and small vanilla JavaScript. Publishing is handled by GitHub Pages. Phase 1 intentionally has no CMS.

## Local development

- Use Node.js 24 LTS (`.nvmrc`).
- Install exact dependencies with `npm ci`.
- Build the production site with `npm run build`; output goes to `_site/` with `/blogmoi/` asset paths.
- Preview the generated output with `python3 -m http.server 8000 -d _site` and open `http://localhost:8000/blogmoi/`.

## Content

Create Markdown articles in `src/posts/<stable-slug>.md`. Keep existing slugs stable and use front matter for title, description, date, categories, tags, language, cover image, and SEO fields. Article URLs are `/<slug>/`.

Do not publish fabricated articles or translations. The source layout is ready for English and Korean pages under `src/en/` and `src/ko/` when real translations are provided.

## Deployment

Pushes to `main` and manual workflow dispatch run the single GitHub Pages workflow. It runs `npm ci`, builds Eleventy into `_site/`, uploads that directory, and deploys it with the official Pages actions. See [docs/deployment.md](docs/deployment.md).

The previous Hugo workflow failed because the artifact action searched for `_site/` while Hugo produced `public/`. Eleventy now produces `_site/`, matching the Pages artifact path.

Future CMS notes: [docs/future-cms.md](docs/future-cms.md).

## Bài viết nổi bật

Mục “Được chọn lọc” hiển thị tối đa 3 bài đã xuất bản. Bài có `featured: true`
trong front matter được ưu tiên, theo thứ tự ngày đăng mới nhất. Nếu chưa đủ
3 bài được chọn thủ công, các bài mới nhất còn lại sẽ bổ sung chỗ trống; không
lặp lại bài trong cùng mục và không lấy bài nháp. Đây là quy tắc biên tập kết hợp
độ mới, không dựa trên lượt xem. Mục “Bài viết gần đây” vẫn giữ thứ tự mới nhất.

## Ảnh bài viết

Ảnh đầu tiên luôn là ảnh bìa Unsplash, kể cả bài từ CMS, agent hoặc lịch tự động.
Nếu chưa chọn ảnh, hệ thống gán một ảnh minh họa từ bộ ảnh Unsplash theo slug;
ảnh giữ ổn định qua các lần build. CMS cho phép đổi ảnh bằng Random. Từ ảnh thứ
hai, người dùng có thể tải ảnh lên trong nội dung. Xem [hướng dẫn CMS](docs/visual-cms.md).
