# GitHub Pages deployment

The single workflow at `.github/workflows/deploy.yml` runs on pushes to `main` and manual dispatch. It uses Node.js 24 LTS, `npm ci`, `npm run build`, `actions/upload-pages-artifact@v4`, and `actions/deploy-pages@v4`.

Eleventy is configured with the `/blogmoi/` path prefix and writes to `_site/`. The artifact action must upload `_site/`, the actual build directory. The prior Hugo workflow failed because its artifact step expected `_site/` while Hugo emitted `public/`; that mismatch was confirmed in the failed Actions log and corrected when the site still used Hugo.

The workflow records Eleventy build time separately from total workflow time after checkout. GitHub-hosted runner and Pages service time vary.
