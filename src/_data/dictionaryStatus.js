import queue from "../../data/dictionary/pending.json" with { type: "json" };
import dictionary from "./dictionary.js";

const candidates = Array.isArray(queue.candidates) ? queue.candidates : [];
const lastRun = queue.lastRun || null;
const countStatuses = (statuses) => candidates.filter((candidate) => statuses.includes(candidate.status)).length;
const pendingTranslation = countStatuses(["extracted", "pending_translation"]);
const pendingReview = countStatuses(["translated", "pending_review"]);
const failedTranslations = countStatuses(["translation_failed"]);
const failedArticles = Array.isArray(lastRun?.failedArticles) ? lastRun.failedArticles.length : 0;
const failed = failedTranslations + failedArticles;
const stateLabel = failed
  ? "Có mục lỗi cần thử lại"
  : pendingTranslation
    ? "Còn từ vựng chờ dịch"
    : pendingReview
      ? "Bản dịch đang chờ biên tập"
      : "Không còn mục từ chờ xử lý";

const triggerLabels = {
  "manual-workflow": "Chạy thủ công trong GitHub Actions",
  "automatic-publish": "Tự động khi cập nhật nội dung",
  "local-cli": "Chạy từ dòng lệnh"
};

export default {
  workflowUrl: "https://github.com/blogco/blogmoi/actions/workflows/deploy.yml",
  reviewQueueUrl: "https://github.com/blogco/blogmoi/blob/main/data/dictionary/pending.json",
  lastRun: lastRun ? {
    ...lastRun,
    triggerLabel: triggerLabels[lastRun.trigger] || "Đã ghi nhận",
    recordedAtLabel: lastRun.recordedAt
      ? new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Ho_Chi_Minh"
      }).format(new Date(lastRun.recordedAt))
      : "Không rõ thời gian"
  } : null,
  stateLabel,
  articlesDiscovered: Number(lastRun?.articlesDiscovered ?? Object.keys(queue.articleCache || {}).length),
  articlesProcessed: Number(lastRun?.articlesProcessed || 0),
  articlesSkipped: Number(lastRun?.articlesSkippedValidCache || 0),
  newVocabulary: Number(lastRun?.newlyExtracted || 0),
  translationsCompleted: Number(lastRun?.translationsCompleted || 0),
  pendingTranslation,
  pendingReview,
  publishedVocabulary: dictionary.entryCount,
  failed
};
