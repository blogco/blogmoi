# Read-only audit: BlogCo CMS

Audited from a shallow read-only checkout of blogco/blogco at /private/tmp/blogco-reference. No files in that repository were edited.

| Capability | Old implementation | Blogmoi |
|---|---|---|
| New and existing posts | Hash routes for list, new, and edit | Real /admin/ view with list, new, edit |
| Rich text | contenteditable surface, headings, lists, quotes, links, undo/redo | Kept with an accessible toolbar |
| Tables | Visual insertion, cell editing, row/column add/delete, explicit Delete Table | Kept with explicit delete control |
| Images | Inline and cover upload, alt text, caption, alignment, resizing, preview | Kept with local image draft recovery and server upload |
| Drafts | Debounced localStorage autosave | IndexedDB drafts; no credentials stored |
| Preview | Slide-over article preview | Responsive modal preview |
| Metadata | Title, tags, author, cover, generated slug | Adds excerpt, categories, date, language, SEO, Open Graph, Q&A, sources, related links |
| Editorial help | Deterministic heuristic score and suggestions | Content-derived Q&A prompts; no fabricated sources |
| Publishing | Browser called GitHub Contents API directly; token persisted in localStorage | Local-only Python publisher uses the OS Git credential helper; no token enters browser code |

The old browser token flow is not carried forward. The old local Flask CMS has password/session controls and Git staging safeguards, but it is not reused.
