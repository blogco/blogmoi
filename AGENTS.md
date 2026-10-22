# Blogmoi project instructions

## Architecture
- Hugo Extended 0.163.1; static HTML, CSS and small vanilla JavaScript only.
- Vietnamese is the default language; English and Korean are configured as language roots, with no invented translations.
- Production base URL is https://blogco.github.io/blogmoi/. Build asset and navigation URLs with Hugo URL functions so /blogmoi/ remains intact.
- Content lives in Hugo page bundles under content/. Article posts use content/posts/<stable-slug>/index.md; media belongs in static/uploads/.
- Templates are under layouts/, shared pieces under layouts/partials/, site styles under static/css/, and browser code under static/js/.
- cms_server.py is a local-only publisher and is never part of Hugo output.

## Naming and content
- Use lowercase kebab-case slugs and meaningful filenames. Keep article URLs stable after first publish.
- Do not invent posts, translations, citations, author identities, or claims. Editorial suggestions must derive from supplied article content.
- Article metadata includes title, description, author, date, language, categories, tags, cover, SEO fields, Q&A, sources, and related links.
- Keep private drafts in browser IndexedDB only. Do not add draft files to the public repository.

## Design and accessibility
- Use semantic CSS custom properties from static/css/site.css.
- Use responsive spacing, readable body sizing, visible focus, semantic controls, keyboard support, and WCAG AA contrast.
- Keep header brand, navigation, and actions in separate regions. Collapse navigation before it clips.
- Give icon-only controls accessible names. Respect reduced motion and system color preferences.

## CMS and security
- Treat editor output as untrusted. Sanitize on both client and local publisher; allow only documented rich-text tags and attributes.
- Preserve rich content through save, preview, publish, and reopen. Rich HTML is stored inside the rich shortcode; Goldmark unsafe rendering stays disabled.
- Never claim publish success before the GitHub API confirms a commit. Keep drafts intact on errors and conflicts.
- Draft storage may contain article text and local image data, but never GitHub tokens or backend session credentials.
- GitHub credentials stay in the operating system's Git credential helper and are used only by the local publisher.
- Never hardcode a PAT, GitHub token, OAuth secret, private key, or session secret.
- GitHub publishing is restricted to blogco/blogmoi, branch main, content/posts/, and static/uploads/.
- Validate local origin, paths, file size, image type, metadata, and sanitized HTML in the publisher.
- Do not enable unsafe Markdown rendering globally or add untrusted inline scripts.

## Deployment and Git
- The Pages workflow is the only site deployment workflow. It runs hugo --gc --minify; no Node/npm install, Vite, browser download, or AI/OCR step.
- Keep the local publisher out of the Hugo build and Pages workflow.
- Verify origin is https://github.com/blogco/blogmoi.git before pushing. Never modify, commit to, or push to old blogco/blogco.
- Preserve unrelated changes and never force-push. Validate Hugo build, workflow YAML, base-path URLs, CMS sanitation, and git diff --check before release.
- Do not invent posts, translations, citations, author identities, or claims.
