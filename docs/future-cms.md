# Visual CMS architecture

The Phase 1 static site remains independent of the CMS. The Visual CMS is a static `/cms/` route that reads and writes the existing Markdown source files using the GitHub REST API; it adds no database or public publishing API. The route is excluded from the sitemap and asks search engines not to index it. Repository write permissions remain the authorization boundary.

The editor uses the current article front matter and layout. It retains unknown YAML keys, preserves existing Markdown body bytes until visual content is edited, and keeps existing article paths fixed. Local drafts stay in browser storage. Publishing creates a normal Git commit on `main`, which starts the existing Pages workflow. Uploaded images are committed under `static/uploads/`.

See [Visual CMS setup and operations](visual-cms.md) for token permissions, Unsplash Worker configuration, and current limitations.
