# Free article translation and summaries

`/dich-tom-tat/` is linked in the shared footer. Input and output support English,
Vietnamese and Korean. Users can paste text, read a local Blogmoi article, or try
a public HTTPS URL via the unauthenticated free Jina Reader service. External
URL loading sends the URL to Jina and is subject to its limits and source access
restrictions. Blocked/logged-in/paywalled sources require pasted accessible text;
the tool does not bypass access controls.

AI uses Chrome's on-device `Translator` and `Summarizer` APIs. There is no paid
API, API key, server-side inference, or automatic publication. Users need a
compatible desktop Chrome installation, supported language packs, enough free
disk/memory and a model download on first use. API presence alone does not prove
model availability; availability/create failures are displayed without fake output.

English is the summarization pivot. VI/KO input is translated to English, every
source chunk is summarized, and the result is translated to the selected output
language. Full translation also covers every chunk. Very large articles use
hierarchical summaries; failure to reduce is reported instead of silently
omitting input. Users can cancel, copy full results or download plain text.
Article text is not stored in browser storage or automatically sent to a cloud
AI service. User-initiated URL reading uses Jina; user-initiated external Gemini
or Google Translate use is subject to those services' accounts/quotas/privacy.

Unsupported browsers offer full-text prompt copying and links to free Gemini
and Google Translate. These are external alternatives, not simulated in-page
results. Gemini's free option may require login and has its own usage limits.

Tests exercise API orchestration with mocks, all supported source languages,
lossless long-text chunking, safe URL reading, cancellation and the page/footers.
They do not prove that Chrome downloaded and ran its device-specific models in
this cloud machine. Native AI runs depend on the visitor's browser and hardware.
