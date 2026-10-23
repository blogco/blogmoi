# Blogmoi Visual CMS

The CMS is published at `https://blogco.github.io/blogmoi/cms/`. It is a static editor for the existing `src/posts/*.md` article format. It reuses Blogmoi’s article layout in the live preview, keeps existing article slugs fixed, and keeps local drafts in the current browser.

## GitHub access

Create a fine-grained Personal Access Token restricted to `blogco/blogmoi`, with **Contents: Read and write**. The token is held in page memory, sent only in GitHub API `Authorization` headers, and cleared on reload or logout. The CMS checks the GitHub API’s repository write permission before loading posts. Add **Actions: Read** if you want to inspect the build run from the CMS. Repository or branch protection rules can still reject a commit.

Publishing validates metadata, checks the current article file SHA, creates blobs and a commit, then updates `main` without force. If an article changed since it was loaded, the CMS stops and asks you to reload. GitHub Actions status is available from the Posts page after publishing.

## Unsplash setup

The browser never receives the Unsplash Access Key. The Cloudflare Worker in `cms-proxy/` checks the exact Blogmoi origin and confirms that the supplied GitHub token has write permission before forwarding search, random-photo and selection-tracking requests.

1. Create or approve an Unsplash API application and obtain its Access Key. Keep the Access Key confidential; do not put it in repository files or browser code.
2. From `cms-proxy/`, authenticate Wrangler to the Cloudflare account, then set the Worker secret interactively and deploy:

   ```sh
   npx wrangler secret put UNSPLASH_ACCESS_KEY
   npx wrangler deploy
   ```

3. Copy the deployed Worker URL into `static/js/cms-config.js` as `unsplashProxyUrl`, commit and deploy the site.
4. Keep `CMS_ORIGIN` set to `https://blogco.github.io` in `wrangler.jsonc`. For a different production origin, update that setting before deploying.

Without the Worker URL and secret, Unsplash search shows a setup message; manual cover URLs and validated uploads continue to work. The picker uses the API-returned `small` and `regular` image URLs directly, tracks the API-provided `download_location` when a photo is selected, and records photographer and Unsplash photo links with Blogmoi referral parameters. It does not download or rehost Unsplash photos. The Worker does not expose the Unsplash Secret Key.

Unsplash requires applications to keep keys confidential, use API-returned hotlinked image URLs, track image selections through `download_location`, and attribute the photographer with a profile link and referral parameters. Check the [current API guidelines](https://help.unsplash.com/en/articles/2511245-unsplash-api-guidelines) and [API documentation](https://unsplash.com/documentation) before requesting production rate limits.

## Local checks

Run `npm run build` to generate the site and `npm run test:cms` for Markdown round-trip and proxy tests. The CMS can only verify real token authorization, GitHub commits and deployment status when you sign in with a correctly scoped token. Unsplash actions require the configured Cloudflare Worker and an approved API application.

## First image and uploaded content images

The first image is always an Unsplash cover. The CMS shows a checked, locked
“Chọn ảnh từ Unsplash” option; cover URLs are read-only. Without the optional
API proxy, a shared catalog of verified public Unsplash photos supplies a
stable pseudo-random cover based on the article slug. The Random button can
choose another catalog photo. Existing Unsplash selections and their recorded
credits are preserved. No API key or paid agent is required for this default.
Full Unsplash search still requires the proxy described above.

The same cover rule applies during Eleventy builds to Markdown created by CMS,
agents and scheduled jobs, including older articles without covers. Non-Unsplash
cover references stay in source files but are replaced for display by the
shared Unsplash illustration. Article cards, article headers and default social
images use the same choice. Catalog illustrations are identified as illustrative,
not photos of the reported event; photographer names are not invented.

For image 2 and later, use **Tải ảnh nội dung (ảnh 2+)** in the content toolbar.
The CMS accepts JPEG, PNG, WebP and AVIF, checks decoding and dimensions, and
asks for alt text. Each upload is inserted at the end of the article body and
can be moved in the visual editor. Limits: 5 MB per image, dimensions up to
9000 pixels, 10 new files and 25 MB per publish. Files under `static/uploads/`
and their Markdown references are saved together in one GitHub commit. A
pending image removed from the body is not committed.

Local previews use temporary blob URLs; saved Markdown uses public
`/blogmoi/uploads/` URLs. Image bytes are not persisted in browser local drafts.
After recovering a draft, remove and re-upload missing pending images before
publishing; the CMS blocks publishing references to those missing files.

## Unique thumbnails

Each published article owns a different Unsplash photo ID. Resized URLs of the
same photo count as duplicates. Existing articles have their chosen covers
stored in front matter. Builds reserve explicit selections first, then allocate
unused catalog photos to new articles; input order does not change the result.
CMS search disables photos used by other posts, Random skips them, and selection
validation rejects duplicates. Scheduled briefs save an unused cover when the
Markdown file is created. Uploads inside article bodies are unaffected.

The bundled catalog currently contains 16 verified photos. It is finite: if
there are no unused catalog photos left, publishing/building stops with a clear
message instead of reusing another article's thumbnail. Add verified photos to
`UNSPLASH_COVERS` in `static/js/article-cover.js`, or choose a different photo
through the optional Unsplash API search. The catalog requires no API key;
full Unsplash search requires the proxy configuration documented above.
