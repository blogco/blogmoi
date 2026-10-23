# Blogmoi project instructions

## Phase 1 architecture
- Eleventy 3.1.7, Node.js 24 LTS, ESM, Nunjucks layouts and Markdown articles.
- This phase is the static blog and UI only. Do not add CMS routes, editor code, authentication, publishing APIs, or draft storage.
- The build command is `npm run build`; Eleventy writes to `_site/` and uses `/blogmoi/` as its path prefix.
- Production origin is `https://blogco.github.io`; the deployed site is `https://blogco.github.io/blogmoi/`.
- Templates and source pages live in `src/`; shared layouts and partials live in `src/_includes/`; global data lives in `src/_data/`; article Markdown lives in `src/posts/`; passthrough assets live in `static/`.
- Use Nunjucks for templates and minimal vanilla JavaScript for progressive enhancement. Do not add React, Vite, Tailwind, or a client-side app framework.

## Naming and content
- For new articles, record the actual publication time as a quoted ISO 8601 `date` with an explicit timezone (for example `2026-10-23T08:23:57+07:00`), not a date-only value. Do not invent publication times or use a source article's time as the blog publication time.
- Keep public article URLs stable at `/<slug>/`. Use lowercase kebab-case source filenames and explicit `slug` front matter when a legacy URL requires it.
- Preserve existing content, media, metadata, and URLs during migrations. Do not delete valuable published content.
- Do not invent articles, translations, citations, author identities, contacts, or claims. English and Korean content can be added under `src/en/` and `src/ko/` with explicit language metadata; do not create placeholder translations.
- Article metadata may also provide `keyPoints` (3–5 editor-reviewed items), `faq` (3–5 question/answer objects), `originalAuthor`, `sourcePublisher`, `sourceUrl`, `sourcePublicationDate`, `copyrightHolder`, `editorialNote`, and `copyrightNotice`. Render supplied facts only; never imply AI generation or invent sources, answers, or authorship.
- Future CMS integration should write validated article bundles and media into the source tree, then trigger the existing GitHub Actions deployment. Do not implement CMS code during Phase 1.

## Design and accessibility
- Use semantic design tokens and components in `static/css/site.css`.
- Centralized type scales live in `static/css/typography.css`; self-host only the Latin and Vietnamese Be Vietnam Pro WOFF2 subsets in `static/fonts/` and keep their OFL license. Avoid remote font requests, unsupported faux weights, and font declarations below weight 400.
- Keep typography readable, support Vietnamese and Korean system font fallbacks, and use accessible contrast and visible focus states.
- Keep brand, navigation, and actions in distinct header regions. Collapse the navigation before it clips; prevent horizontal overflow and content obstruction.
- Give icon-only controls accessible names. Support keyboard navigation, reduced motion, and light/dark preferences.
- Avoid external fonts and scripts unless there is a measured benefit.

## Security and performance
- Treat Markdown and front matter as source content; never inject untrusted values as raw HTML or inline JavaScript.
- Keep search static and DOM-safe. Do not include credentials, tokens, secrets, private drafts, or authentication state in the public site.
- Keep dependencies minimal and pinned in `package-lock.json`. CI uses `npm ci`; do not add browser downloads, Playwright, Chromium, AI, OCR, or unrelated build steps.
- Do not create fake CMS authentication or imply that static GitHub Pages can publish content by itself.

## Deployment and Git
- Maintain exactly one Pages deployment workflow in `.github/workflows/`. It builds with Eleventy into `_site/`, uploads `_site/`, and deploys using official GitHub Pages actions.
- Validate `npm ci`, `npm run build`, output paths, sitemap/feed, search JSON, and `git diff --check` before release. Never claim visual/browser testing that was not performed.
- Follow one feature, one commit, one push, one deployment, one ASCII report. Keep unrelated changes separate; never force-push.
- After code work, return exactly one ASCII-only terminal report in this format. Keep lines within 78 columns; wrap long summary or change details on indented continuation lines. Use only verified statuses, write NOT RUN or N/A when applicable, and never invent a SHA, duration, commit time, test result, or deploy state. If any field is FAIL, add exactly one concise ERROR line. Do not add prose after the report.

```text
+----------------------------------------------------------------------------+
| BLOGMOI CODEX REPORT                                                       |
+----------------------------------------------------------------------------+
| RESULT    : <SUCCESS / PARTIAL / FAILURE>                                  |
| SUMMARY   : <what was completed>                                           |
| CHANGES   : <what changed>                                                 |
| COMMIT    : <actual SHA or N/A (no commit created)>                        |
| DURATION  : <elapsed time or N/A (not measured)>                           |
| COMMIT AT : <YYYY-MM-DD HH:MM:SS GMT+7 or N/A (no commit)>                 |
| BUILD     : <PASS / FAIL / NOT RUN>                                        |
| TESTS     : <PASS / FAIL / NOT RUN>                                        |
| DIFF CHECK: <PASS / FAIL / NOT RUN>                                        |
| PUSH      : <PASS / FAIL / NOT RUN>                                        |
| DEPLOY    : <PASS / FAIL / NOT RUN>                                        |
+----------------------------------------------------------------------------+
```
- After a successful push, return the ASCII report immediately. Do not watch or poll GitHub Actions or wait for deployment unless the user explicitly asks; mark deployment and production URL as unverified when they were not checked.
- Verify `origin` is `https://github.com/blogco/blogmoi.git` before pushing. Never modify, commit to, or push to the old `blogco/blogco` repository.
