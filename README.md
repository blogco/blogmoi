# Blogmoi Editorial 2026

Fast static Vietnamese-first editorial site built with Hugo. Production publishing uses GitHub Pages. The authoring interface lives at /blogmoi/admin/; drafts stay in this browser.

Install Hugo Extended 0.163.1 and run hugo server for local preview. No Node/npm step is part of the site build or Pages deployment.

Secure publishing uses cms_server.py on the author's computer. It binds only to localhost and uses that computer's existing Git credential helper; no GitHub token enters browser JavaScript. Follow docs/cms-publishing.md.

Pushes to main and manual dispatch build with hugo --gc --minify. See docs/deployment.md.

Vietnamese is the default language. English and Korean language configuration is ready, but no translations or sample articles are fabricated.
