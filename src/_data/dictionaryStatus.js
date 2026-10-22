import queue from "../../data/dictionary/pending.json" with { type: "json" };
import dictionary from "./dictionary.js";

const candidates = Array.isArray(queue.candidates) ? queue.candidates.filter((candidate) => candidate.status === "extracted") : [];
const lastRun = queue.lastRun || null;

export default {
  lastRun: lastRun ? {
    ...lastRun,
    triggerLabel: lastRun.trigger === "automatic-publish" ? "Tự quét khi bài viết thay đổi" : "Quét từ vựng",
    recordedAtLabel: lastRun.recordedAt
      ? new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Ho_Chi_Minh"
      }).format(new Date(lastRun.recordedAt))
      : "Không rõ thời gian"
  } : null,
  candidateCount: candidates.length,
  articlesDiscovered: Number(lastRun?.articlesDiscovered ?? Object.keys(queue.articleCache || {}).length),
  articlesProcessed: Number(lastRun?.articlesProcessed || 0),
  articlesSkipped: Number(lastRun?.articlesSkippedValidCache || 0),
  publishedVocabulary: dictionary.entryCount
};
