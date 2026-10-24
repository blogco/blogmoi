# Daily English–Korean news

The existing Pages workflow targets **07:00 GMT+7** (`0 0 * * *` UTC).
GitHub may delay cron execution. The half-hour workflow also checks for a missing
post between 07:00 and 10:00 GMT+7, providing retries without loading models once
today's post exists. Deduplication uses the Bangkok date and the original URL.

Source: <https://www.koreatimes.co.kr/?edition=south-korea>. The script samples
randomly from dated article links on this homepage, across news sections. It
excludes already-used URLs, future articles and articles older than three days.
Up to three distinct candidates may be tried when an article is unreadable,
paywalled or fails validation; nothing is invented to fill a failed run.

Each post contains an English summary and matching Korean translation, a Korean
headline, original source link, source publication date and automatic-generation
notice. This is an original bilingual brief, not a reproduction/full translation
of the copyrighted article. The old Vietnamese posts are preserved.

## Free local models

No paid agent subscription or AI API key is needed. GitHub Actions runs pinned
open-source models on standard CPU runners:

- `sshleifer/distilbart-cnn-12-6`, Apache-2.0: English summarization.
- `facebook/m2m100_418M`, MIT: English-to-Korean translation, explicitly selecting
  English input and Korean output language tokens.

Exact revisions are in `scripts/news/local_brief.py`. Downloads use normal
verified HTTPS and `trust_remote_code=False`. Model caches are saved even if
article generation fails, avoiding repeated downloads. Long sources are chunked
before summarization, rather than discarded at the former 1,024-token boundary.
Summary evidence and numbers are validated before writing. Automated translation
can still contain errors; it is labeled as automatically generated.

Runner minutes/storage remain subject to GitHub's terms and quotas. This is a
public repository using standard runners. The bundled Unsplash cover catalog is
finite: add unused photos or select a new Unsplash photo if it is exhausted.

## Run and diagnose

From Actions, run the Pages workflow with **publish_daily_news = true** to
backfill today's missing random brief; `news_source_url` optionally selects a
specific source instead. Existing posts for today prevent duplicates.

Local test: `NEWS_PYTHON=.cache/news-venv/bin/python node --use-env-proxy
scripts/publish-scheduled-news.mjs --dry-run` (write on one line). Omit `--dry-run`
to create the Markdown. Install CPU Python dependencies from
`scripts/news/requirements.txt` and official PyTorch CPU wheels first.

The workflow summary records news generation separately. A success there is
not proof of publication: the subsequent build, content commit and Pages deploy
must also succeed. A failed generation should remain visibly failed and will
be retried by the next scheduled check inside the morning window.
