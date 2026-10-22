import queue from "../../data/dictionary/pending.json" with { type: "json" };

const candidates = Array.isArray(queue.candidates) ? queue.candidates : [];

export default candidates
  .filter((candidate) => candidate.status === "extracted" && candidate.articleId && candidate.sourceArticle && candidate.sourceLanguage && candidate.term)
  .map((candidate) => ({
    id: candidate.id,
    articleId: candidate.articleId,
    contentId: candidate.sourceArticle,
    sourceLanguage: candidate.sourceLanguage,
    term: candidate.term,
    field: candidate.field || "Khác",
    sourceContext: candidate.sourceContext || "",
    articleHash: candidate.articleHash
  }))
  .sort((a, b) => a.contentId.localeCompare(b.contentId) || a.term.localeCompare(b.term, "und"));
