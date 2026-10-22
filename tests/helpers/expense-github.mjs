import { GitHubExpenseSync, EXPENSE_CLOUD_PATH } from "../../static/js/expense-cloud-sync.js";
import { validateTransaction } from "../../static/js/expense-tracker.js";

export const record = (id, overrides = {}) => validateTransaction({
  id,
  merchant: "Highlands",
  itemName: "Matcha Latte",
  amount: 50_000,
  date: "2026-10-23",
  taste: "Không đường",
  category: "Đồ uống",
  iconId: "matcha",
  iconManuallySet: false,
  notes: "",
  createdAt: "2026-10-23T02:00:00.000Z",
  updatedAt: "2026-10-23T02:00:00.000Z",
  ...overrides,
});

export const doc = (transactions = [], tombstones = []) => ({ schemaVersion: 1, transactions, tombstones });
export const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});
const base64Json = value => Buffer.from(JSON.stringify(value)).toString("base64");
export const contentPath = `/repos/blogco/blogmoi/contents/${EXPENSE_CLOUD_PATH}`;

export function makeGitHub({ isPrivate = false, pushAccess = true, initialDocument = null, onPut = null, repositoryStatus = 200, validTokens = ["test-token"] } = {}) {
  const state = { file: initialDocument ? { document: initialDocument, sha: "sha-1" } : null, commits: [], authHeaders: [] };
  const fetchImpl = async (urlValue, options = {}) => {
    const url = new URL(urlValue);
    state.authHeaders.push(options.headers?.Authorization || "");
    if (url.pathname === "/user") {
      if (!validTokens.some(token => options.headers?.Authorization === `Bearer ${token}`)) return jsonResponse({ message: "Bad credentials" }, 401);
      return jsonResponse({ login: "tester" });
    }
    if (url.pathname === "/repos/blogco/blogmoi") {
      if (repositoryStatus !== 200) return jsonResponse({ message: "Not Found" }, repositoryStatus);
      return jsonResponse({ private: isPrivate, full_name: "blogco/blogmoi", owner: { login: "blogco" }, name: "blogmoi", default_branch: "main", permissions: { push: pushAccess } });
    }
    if (url.pathname === contentPath) {
      if (options.method === "PUT") {
        const body = JSON.parse(options.body);
        if (onPut) {
          const outcome = await onPut({ state, body, url });
          if (outcome) return outcome;
        }
        if (state.file && body.sha !== state.file.sha) return jsonResponse({ message: "sha conflict" }, 409);
        if (!state.file && body.sha) return jsonResponse({ message: "unexpected sha" }, 409);
        const document = JSON.parse(Buffer.from(body.content, "base64").toString("utf8"));
        state.commits.push({ message: body.message, branch: body.branch, document });
        const sha = `sha-${state.commits.length + 1}`;
        state.file = { document, sha };
        return jsonResponse({ content: { sha } }, 201);
      }
      if (!state.file) return jsonResponse({ message: "Not Found" }, 404);
      return jsonResponse({ type: "file", encoding: "base64", content: base64Json(state.file.document), sha: state.file.sha });
    }
    return jsonResponse({ message: "Not Found" }, 404);
  };
  return { state, fetchImpl };
}

export const client = fetchImpl => new GitHubExpenseSync({ fetchImpl, validateTransaction, waitImpl: async () => {} });
export const connect = instance => instance.connect("test-token");

