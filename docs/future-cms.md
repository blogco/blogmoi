# Future visual CMS integration

Phase 1 intentionally has no admin route, editor, authentication, local publisher, API endpoint, or browser draft store.

The future CMS can generate standard Markdown article files in `src/posts/` with front matter for stable slug, title, description, date, language, author, categories, tags, cover, and SEO metadata. Uploaded media can be committed under `static/uploads/`; Eleventy copies it into `_site/uploads/`. A secure publishing mechanism must keep write credentials outside public JavaScript and produce a normal commit to `blogco/blogmoi`; GitHub Actions remains the only deployment path.

The post directory data file at `src/posts/posts.11tydata.js` defines the article layout, language default, and clean permalink. Keep article rendering independent of the future editor so existing Markdown remains readable and buildable without CMS dependencies.
