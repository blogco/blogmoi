# Secure CMS publishing setup

GitHub Pages is static, so the hosted admin cannot safely write to GitHub directly. The CMS publishes through cms_server.py on the author's computer. It binds to 127.0.0.1, checks the local browser origin, verifies the Git remote and main branch, and uses that computer's existing OS Git credential helper. No PAT or GitHub token is exposed to JavaScript or stored by the CMS.

1. Keep the new repository checked out at ~/Desktop/blogmoi and confirm origin is https://github.com/blogco/blogmoi.git.
2. Install Hugo Extended 0.163.1 and use the existing macOS GitHub credential helper.
3. Run python3 cms_server.py from the repository root.
4. Open http://127.0.0.1:4173/blogmoi/admin/. The same Hugo admin bundle sends publish requests only to this local process.
5. Publish from the editor. It writes the Hugo page bundle and uploaded images, creates a scoped Git commit, and pushes main. GitHub Actions then deploys the site.

The publisher refuses any branch other than main, any remote other than blogco/blogmoi, or a checkout with unrelated changes. It stages only the specific post and image paths. If GitHub rejects the push, the editor keeps its draft and shows the failure.

The hosted GitHub Pages admin remains useful for authoring and previewing local drafts, but cannot publish on its own. Open the local URL above for secure publishing.
