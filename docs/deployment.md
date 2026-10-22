# GitHub Pages deployment

The only site workflow is .github/workflows/deploy.yml. It runs on pushes to main and manual dispatch, pins Hugo Extended 0.163.1, builds with hugo --gc --minify, then uses the official configure-pages, upload-pages-artifact, and deploy-pages actions.

The repository Pages source must be set to GitHub Actions. The workflow reports Hugo build time and total runtime in its summary.

The production URL is https://blogco.github.io/blogmoi/.
