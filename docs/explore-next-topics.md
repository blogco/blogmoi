# ExploreNextTopics

The audited baseline had panels on 4/8 posts. Only one post had unpublished
ideas (two). The resolver required a slug in the editorial backlog, capped
unpublished ideas at two, and removed published matches already shown as
related posts. The template hid the entire panel when that list was empty.
All eight current posts share the Nunjucks article layout. There is no MDX,
client hydration, or responsive CSS rule hiding these panels.

The shared article layout now renders ExploreNextTopics once after article
content and before tags/endmatter. Recognized legacy panel sections are
removed from rendered content first. Existing source, related-post and FAQ
components remain separate. Article collections include type: article across
supported template formats; non-article pages do not include the component.

Selection order:
1. Optional front matter exploreNextTopics (topicSuggestions is also accepted).
2. Applicable proposed/approved editorial backlog entries.
3. Deterministic editorial rules scored against title, description, headings,
   category, tags and body. Specific title matches take precedence over broad
   platform mentions. Unknown subjects use actual headings/title as anchors.

Each idea has title, description and rationale string fields. The first
3-5 complete distinct manual ideas are retained. A short list is filled to
four; exact published titles and published/rejected backlog entries are
excluded. Generated ideas are proposals, not factual articles or AI output.
They have no links. No client script or API call is needed.

Example front matter:

    exploreNextTopics:
      - title: "A specific follow-up question"
        description: "The angle to investigate"
        rationale: "How it follows from this article"

npm run build automatically runs the output coverage guard. It checks all
published URLs from search-index.json, panel count, 3-5 unique ideas, angle,
rationale, placement and existing endmatter. Non-article pages must have none.
Failures include the URL and reason. npm run test:topics tests metadata gaps,
manual priorities, backlog states, escaping, legacy deduplication and real
Eleventy builds of Markdown/Nunjucks and nested-layout fixtures. A deliberately
removed panel must fail the guard. No existing article needs a manual edit.

Browser testing was unavailable in this session (native browser bridge).
DOM checks and CSS inspection do not establish visual or measured CLS results.
