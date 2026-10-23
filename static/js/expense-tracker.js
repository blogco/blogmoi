import { ExpenseSyncSession, LocalExpenseError, describeExpenseError } from "./expense-sync-session.js";
import {
  EXPENSE_CLOUD_PATH,
  EXPENSE_REPOSITORY,
  ExpenseSyncError,
  GitHubExpenseSync,
  countUnsyncedExpenseChanges,
  expenseStateFingerprint,
  getExpenseMigrationPreview,
} from "./expense-cloud-sync.js";

const DATABASE_NAME = "blogmoi-expenses";
const DATABASE_VERSION = 2;
const STORE_NAME = "transactions";
const SYNC_STORE_NAME = "sync-meta";
const CLOUD_SCHEMA_VERSION = 1;
const CATEGORIES = ["Đồ uống", "Đồ ăn", "Khác"];
const CATEGORY_COLORS = ["#087f8c", "#2463eb", "#ef8c79"];
export const FOOD_ICONS = Object.freeze({
  coffee: Object.freeze({ label: "Cà phê", background: "#F7E9DD", color: "#9A684C" }),
  matcha: Object.freeze({ label: "Matcha", background: "#E6F1E5", color: "#60936D" }),
  "milk-tea": Object.freeze({ label: "Trà sữa", background: "#F9EBD9", color: "#BD8B58" }),
  tea: Object.freeze({ label: "Trà", background: "#E3F3EF", color: "#5A9A91" }),
  juice: Object.freeze({ label: "Nước ép", background: "#FFF0D7", color: "#E6A34E" }),
  smoothie: Object.freeze({ label: "Sinh tố", background: "#F6E6F0", color: "#B17B9D" }),
  cake: Object.freeze({ label: "Bánh ngọt", background: "#FBE8EC", color: "#D78B9A" }),
  bread: Object.freeze({ label: "Bánh mì", background: "#F7EBD7", color: "#B98B55" }),
  noodles: Object.freeze({ label: "Mì / Phở", background: "#FFF0DF", color: "#CB8750" }),
  rice: Object.freeze({ label: "Cơm", background: "#EDF2E3", color: "#7D9D67" }),
  fried: Object.freeze({ label: "Đồ chiên", background: "#FFF0D2", color: "#CF9940" }),
  other: Object.freeze({ label: "Khác", background: "#EAF0F6", color: "#7C8DA4" }),
});
const FOOD_ICON_KEYWORDS = [
  ["matcha", ["matcha", "抹茶", "말차"]],
  ["milk-tea", ["trà sữa trân châu", "trà sữa", "bubble tea", "milk tea", "boba tea", "버블티", "밀크티"]],
  ["tea", ["trà đào", "green tea", "tea", "녹차", "홍차", "유자차", "보리차", "차"]],
  ["coffee", ["cà phê", "caphe", "cafe", "coffee", "espresso", "americano", "latte", "커피", "카페", "라떼", "에스프레소", "아메리카노"]],
  ["smoothie", ["sinh tố", "smoothie", "스무디"]],
  ["juice", ["nước cam", "nước ép", "orange juice", "juice", "주스", "쥬스"]],
  ["cake", ["cheesecake", "bánh ngọt", "bánh kem", "bánh dứa", "cake", "케이크"]],
  ["bread", ["bánh mì", "sandwich", "bread", "빵", "샌드위치"]],
  ["noodles", ["phở", "bún", "mì xào", "mì", "ramen", "noodles", "noodle", "국수", "라면", "쌀국수"]],
  ["fried", ["gà rán", "khoai tây chiên", "đồ chiên", "fried chicken", "fried", "fries", "치킨", "감자튀김"]],
  ["rice", ["cơm tấm", "bibimbap", "cơm", "rice", "비빔밥", "밥"]],
];
const MERCHANTS = [
  "The Coffee House", "Bách Hóa Xanh", "Highlands Coffee", "Phúc Long", "Trung Nguyên Legend",
  "Circle K", "WinMart", "King Coffee", "Gong Cha", "Katinat", "Starbucks", "FamilyMart",
  "GS25", "7-Eleven", "Highlands", "Mixue", "Phê La", "KOI Thé", "Ding Tea", "TocoToco",
];

const DATE_PATTERNS = [
  /(?:ngày\s*)?(\d{1,2})\s*tháng\s*(\d{1,2})\s*năm\s*(\d{4})/giu,
  /(?:ngày\s*)?(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{2,4})(?!\d)/gu,
];
const DATE_WITHOUT_YEAR_PATTERNS = [
  /(?:ngày\s*)?(\d{1,2})\s*tháng\s*(\d{1,2})(?!\s*năm\s*\d)/giu,
  /(?:ngày\s*)?(\d{1,2})(?!\d)\s*[/.\-]\s*(\d{1,2})(?!\d)(?!\s*[/.\-]\s*\d)/gu,
];
const RELATIVE_DATES = [
  { pattern: /hôm\s*nay/giu, offset: 0 },
  { pattern: /hôm\s*qua/giu, offset: -1 },
  { pattern: /hôm\s*kia/giu, offset: -2 },
];
const AMOUNT_PATTERN = /(?<![\p{L}\p{N}])(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|triệu|tr|vnd|₫|đ)?(?![\p{L}])/giu;
const FLAVOR_PATTERNS = [
  /không\s+đường/iu,
  /ít\s+đường/iu,
  /giảm\s+đường/iu,
  /ít\s+ngọt/iu,
  /không\s+ngọt/iu,
  /nhiều\s+đường/iu,
  /ít\s+đá/iu,
  /không\s+đá/iu,
  /nóng/iu,
  /lạnh/iu,
];
const DRINK_PATTERN = /trà\s*sữa|trà|cà\s*phê|coffee|cafe|matcha|latte|nước\s*ép|nước\s*ngọt|sinh\s*tố|sữa|boba|americano|espresso|cacao|soda|bia|cocktail|đồ\s*uống|thức\s*uống/iu;
const FOOD_PATTERN = /đồ\s*ăn|thức\s*ăn|bánh|cơm|phở|bún|mì|cháo|gà|thịt|cá|salad|burger|pizza|sandwich|chiên|rán|snack|xôi|súp|sushi|sashimi|sườn|lẩu|món\s*ăn/iu;

function normalizeFoodText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[đĐ]/gu, "d")
    .normalize("NFC")
    .toLocaleLowerCase("vi-VN")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

function hasFoodKeyword(normalizedText, keyword) {
  const normalizedKeyword = normalizeFoodText(keyword);
  if (normalizedKeyword === "차") return normalizedText.split(" ").includes("차");
  if (/[\p{Script=Hangul}\p{Script=Han}]/u.test(normalizedKeyword)) return normalizedText.includes(normalizedKeyword);
  return ` ${normalizedText} `.includes(` ${normalizedKeyword} `);
}

export function resolveFoodIcon(itemName) {
  const normalized = normalizeFoodText(itemName);
  if (!normalized) return "other";
  for (const [iconId, keywords] of FOOD_ICON_KEYWORDS) {
    if (keywords.some(keyword => hasFoodKeyword(normalized, keyword))) return iconId;
  }
  return "other";
}

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateValueFromParts(day, month, year) {
  const value = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isValidDate(value) ? value : "";
}

function getMatches(text, pattern, mapMatch = match => match) {
  const matches = [];
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  let match;
  while ((match = matcher.exec(text)) !== null) {
    matches.push(mapMatch(match));
    if (match[0].length === 0) matcher.lastIndex += 1;
  }
  return matches;
}

function maskRanges(text, ranges) {
  const characters = text.split("");
  for (const { start, end } of ranges) {
    for (let index = start; index < end && index < characters.length; index += 1) {
      if (characters[index] !== "\n" && characters[index] !== "\r") characters[index] = " ";
    }
  }
  return characters.join("");
}

function parseVietnameseDate(text, now = new Date()) {
  const fullMatches = DATE_PATTERNS.flatMap(pattern => getMatches(text, pattern, match => ({
    raw: match[0],
    start: match.index,
    end: match.index + match[0].length,
    value: dateValueFromParts(Number(match[1]), Number(match[2]), Number(match[3].length === 2 ? `20${match[3]}` : match[3])),
  }))).filter(match => match.value);
  const relativeMatches = RELATIVE_DATES.flatMap(({ pattern, offset }) => getMatches(text, pattern, match => {
    const relative = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    return { raw: match[0], start: match.index, end: match.index + match[0].length, value: localDateValue(relative), relative: true };
  }));
  const missingYearMatches = DATE_WITHOUT_YEAR_PATTERNS.flatMap(pattern => getMatches(text, pattern, match => ({
    raw: match[0], start: match.index, end: match.index + match[0].length, value: "",
  })));

  const chosen = fullMatches[0] || relativeMatches[0] || null;
  const ranges = [...fullMatches, ...relativeMatches];
  const hasConflict = Boolean(fullMatches.length && relativeMatches.some(match => match.value !== fullMatches[0].value));
  const unresolvedMissingYearMatches = missingYearMatches.filter(candidate => !fullMatches.some(full => candidate.start >= full.start && candidate.end <= full.end));
  ranges.push(...unresolvedMissingYearMatches);
  const missingYearCovered = unresolvedMissingYearMatches.length > 0;

  return {
    value: chosen?.value || "",
    ranges,
    uncertain: !chosen || hasConflict || missingYearCovered,
    reason: missingYearCovered ? "Thiếu năm trong ngày nhập" : hasConflict ? "Ngày tương đối và ngày cụ thể không trùng nhau" : "",
  };
}

function parseMoneyValue(rawNumber, unit = "") {
  const normalizedUnit = unit.toLocaleLowerCase("vi-VN");
  const hasGroupedThousands = /\d{1,3}(?:[.,]\d{3})+$/.test(rawNumber);
  let number;
  if (!normalizedUnit && hasGroupedThousands) {
    number = Number(rawNumber.replace(/[.,]/g, ""));
  } else if (normalizedUnit && /[.,]/.test(rawNumber)) {
    const lastSeparator = Math.max(rawNumber.lastIndexOf("."), rawNumber.lastIndexOf(","));
    const decimals = rawNumber.length - lastSeparator - 1;
    number = decimals === 3 ? Number(rawNumber.replace(/[.,]/g, "")) : Number(rawNumber.replace(",", "."));
  } else {
    number = Number(rawNumber.replace(/[.,]/g, ""));
  }
  if (!Number.isFinite(number) || number <= 0) return null;
  let factor = 1;
  if (["k", "nghìn", "ngàn"].includes(normalizedUnit)) factor = 1_000;
  if (["triệu", "tr"].includes(normalizedUnit)) factor = 1_000_000;
  const amount = Math.round(number * factor);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMerchant(text, masked) {
  const matches = MERCHANTS.flatMap(name => {
    const pattern = new RegExp(escapeRegExp(name), "iu");
    const match = pattern.exec(text);
    return match ? [{ name, start: match.index, end: match.index + match[0].length, length: match[0].length }] : [];
  }).sort((a, b) => b.length - a.length || a.start - b.start);
  if (matches.length) return { value: matches[0].name, range: matches[0], uncertain: false };

  const contextPattern = /(?<![\p{L}\p{M}])(?:(?:tại|ở)\s+)?(?:quán|cửa\s*hàng)\s+([\p{L}\p{M}\d][\p{L}\p{M}\d&.'’\- ]{1,55})|(?<![\p{L}\p{M}])(?:tại|ở)\s+([\p{L}\p{M}\d][\p{L}\p{M}\d&.'’\- ]{1,55})/iu;
  const context = contextPattern.exec(masked);
  if (context) {
    const capturedName = context[1] || context[2];
    const name = capturedName.trim().replace(/[\s,;:.]+$/u, "");
    const offset = context[0].indexOf(capturedName);
    const start = context.index + offset;
    return { value: name, range: { start: context.index, end: start + capturedName.length }, uncertain: true };
  }
  return { value: "", range: null, uncertain: true };
}

function cleanItemName(value) {
  return value
    .replace(/\b(?:mua|đặt|gọi|uống|ăn|tại|ở|quán|cửa\s*hàng|giá|là|với|hôm|nay|qua|kia|ngày|tháng|năm)\b/giu, " ")
    .replace(/[\s,;:|]+/gu, " ")
    .replace(/^[\s.\-–—]+|[\s.\-–—]+$/gu, "")
    .trim();
}

export function parseExpenseText(text, now = new Date()) {
  const source = String(text || "").trim();
  if (!source) {
    return { merchant: "", itemName: "", amount: "", date: "", taste: "", category: "", review: { merchant: true, itemName: true, amount: true, date: true, taste: false, category: true } };
  }

  const parsedDate = parseVietnameseDate(source, now);
  const afterDate = maskRanges(source, parsedDate.ranges);
  const moneyMatches = getMatches(afterDate, AMOUNT_PATTERN, match => {
    const value = parseMoneyValue(match[1], match[2] || "");
    const hasUnit = Boolean(match[2]);
    const isGroupedAmount = /\d{1,3}(?:[.,]\d{3})+$/.test(match[1]);
    return { raw: match[0], start: match.index, end: match.index + match[0].length, value, credible: hasUnit || isGroupedAmount };
  }).filter(match => match.credible && match.value);
  const amount = moneyMatches[0]?.value || "";
  const amountRanges = moneyMatches.map(({ start, end }) => ({ start, end }));
  const afterAmount = maskRanges(source, [...parsedDate.ranges, ...amountRanges]);

  const flavorMatches = FLAVOR_PATTERNS.flatMap(pattern => getMatches(afterAmount, pattern, match => ({
    raw: match[0], start: match.index, end: match.index + match[0].length,
  })));
  const taste = flavorMatches.sort((a, b) => a.start - b.start).map(match => match.raw.trim()).join(", ");
  const tasteRanges = flavorMatches.map(({ start, end }) => ({ start, end }));
  const afterTaste = maskRanges(source, [...parsedDate.ranges, ...amountRanges, ...tasteRanges]);
  const merchant = extractMerchant(source, afterTaste);
  const merchantRanges = merchant.range ? [merchant.range] : [];
  const remaining = maskRanges(source, [...parsedDate.ranges, ...amountRanges, ...tasteRanges, ...merchantRanges]);
  const itemName = cleanItemName(remaining);

  let category = "";
  if (/(?:danh\s*mục|mục)\s+khác/iu.test(source)) category = "Khác";
  else if (DRINK_PATTERN.test(itemName)) category = "Đồ uống";
  else if (FOOD_PATTERN.test(itemName)) category = "Đồ ăn";

  const review = {
    merchant: merchant.uncertain,
    itemName: !itemName,
    amount: !amount || moneyMatches.length > 1,
    date: parsedDate.uncertain,
    taste: false,
    category: !category,
  };
  return {
    merchant: merchant.value,
    itemName,
    amount,
    date: parsedDate.value,
    taste,
    category,
    review,
    dateNote: parsedDate.reason,
  };
}

function validTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function normalizeVndAmount(value) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return Number.NaN;
  const normalized = value.trim().replace(/\s+/gu, "");
  if (/^\d+$/u.test(normalized)) return Number(normalized);
  if (/^\d{1,3}(?:[.,]\d{3})+$/u.test(normalized)) return Number(normalized.replace(/[.,]/gu, ""));
  if (/^\d+[.,]\d{1,2}$/u.test(normalized)) return Number(normalized.replace(",", "."));
  return Number.NaN;
}

export function validateTransaction(input, { now = new Date(), makeId = createId } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Dữ liệu giao dịch không hợp lệ.");
  const merchant = typeof input.merchant === "string" ? input.merchant.trim() : "";
  const itemName = typeof input.itemName === "string" ? input.itemName.trim() : "";
  const amount = normalizeVndAmount(input.amount);
  const date = typeof input.date === "string" ? input.date.trim() : "";
  const taste = typeof input.taste === "string" ? input.taste.trim() : "";
  const category = typeof input.category === "string" ? input.category.trim() : "";
  const notes = typeof input.notes === "string" ? input.notes.trim() : "";
  const hasValidIcon = typeof input.iconId === "string" && Object.hasOwn(FOOD_ICONS, input.iconId);
  const iconId = hasValidIcon ? input.iconId : resolveFoodIcon(itemName);
  const iconManuallySet = hasValidIcon && (input.iconManuallySet === undefined
    ? true
    : input.iconManuallySet === true || input.iconManuallySet === "true");
  if (!merchant || merchant.length > 100) throw new Error("Tên quán / thương hiệu là bắt buộc (tối đa 100 ký tự).");
  if (!itemName || itemName.length > 120) throw new Error("Tên món / khoản chi là bắt buộc (tối đa 120 ký tự).");
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("Số tiền phải là số nguyên VND lớn hơn 0.");
  if (!isValidDate(date)) throw new Error("Ngày giao dịch không hợp lệ.");
  if (!CATEGORIES.includes(category)) throw new Error("Hãy chọn một danh mục hợp lệ.");
  if (taste.length > 80 || notes.length > 500) throw new Error("Vị / khẩu vị hoặc ghi chú vượt quá độ dài cho phép.");
  const createdAt = input.createdAt ?? now.toISOString();
  const updatedAt = input.updatedAt ?? now.toISOString();
  if (!validTimestamp(createdAt) || !validTimestamp(updatedAt)) throw new Error("Thời gian tạo hoặc sửa không hợp lệ.");
  const id = typeof input.id === "string" && input.id.trim() ? input.id.trim() : makeId();
  if (id.length > 160) throw new Error("Mã giao dịch không hợp lệ.");
  return { id, merchant, itemName, amount, date, taste, category, notes, iconId, iconManuallySet, createdAt, updatedAt };
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || `expense-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function monthKey(date) {
  return String(date).slice(0, 7);
}

export function getDaysInMonth(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).getDate();
}

export function normalizeTransactions(records) {
  if (!Array.isArray(records)) throw new Error("Danh sách giao dịch không hợp lệ.");
  const unique = new Map();
  for (const input of records) {
    if (!input || typeof input.id !== "string" || !input.id.trim()) throw new Error("Giao dịch thiếu mã định danh.");
    const record = validateTransaction(input);
    const previous = unique.get(record.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(record)) {
      throw new Error("Có nhiều phiên bản khác nhau của cùng một giao dịch.");
    }
    unique.set(record.id, record);
  }
  return [...unique.values()];
}

export function selectPeriodTransactions(transactions, period = "all") {
  return period === "all"
    ? [...transactions]
    : transactions.filter(transaction => monthKey(transaction.date) === period);
}

export function aggregatePeriod(transactions, period = "all") {
  const selected = selectPeriodTransactions(transactions, period);
  const total = selected.reduce((sum, transaction) => sum + transaction.amount, 0);
  const activeDays = new Set(selected.map(transaction => transaction.date)).size;
  const daily = new Map();
  const monthly = new Map();
  const categories = new Map(CATEGORIES.map(category => [category, 0]));
  const merchants = new Map();
  for (const transaction of selected) {
    const date = transaction.date;
    const month = monthKey(date);
    const dailyKey = period === "all" ? date : Number(date.slice(8, 10));
    const currentDay = daily.get(dailyKey) || { total: 0, count: 0 };
    currentDay.total += transaction.amount;
    currentDay.count += 1;
    daily.set(dailyKey, currentDay);
    const currentMonth = monthly.get(month) || { total: 0, count: 0 };
    currentMonth.total += transaction.amount;
    currentMonth.count += 1;
    monthly.set(month, currentMonth);
    categories.set(transaction.category, (categories.get(transaction.category) || 0) + transaction.amount);
    const merchantKey = transaction.merchant.trim().toLocaleLowerCase("vi-VN");
    const currentMerchant = merchants.get(merchantKey) || { merchant: transaction.merchant, total: 0, count: 0 };
    currentMerchant.total += transaction.amount;
    currentMerchant.count += 1;
    merchants.set(merchantKey, currentMerchant);
  }
  return {
    period,
    month: period === "all" ? null : period,
    transactions: selected,
    total,
    count: selected.length,
    activeDays,
    averagePerActiveDay: activeDays ? Math.round(total / activeDays) : 0,
    daily,
    monthly,
    categories,
    merchants: [...merchants.values()].sort((a, b) => b.total - a.total || a.merchant.localeCompare(b.merchant, "vi")),
  };
}

export function aggregateMonth(transactions, month) {
  return aggregatePeriod(transactions, month);
}

export function aggregateFoodGroups(transactions, period, mode = "count") {
  const metric = mode === "amount" ? "amount" : "count";
  const groups = new Map();
  for (const transaction of selectPeriodTransactions(transactions, period)) {
    const iconId = Object.hasOwn(FOOD_ICONS, transaction.iconId) ? transaction.iconId : "other";
    const group = groups.get(iconId) || { iconId, label: FOOD_ICONS[iconId].label, count: 0, amount: 0 };
    group.count += 1;
    group.amount += transaction.amount;
    groups.set(iconId, group);
  }
  const total = [...groups.values()].reduce((sum, group) => sum + group[metric], 0);
  const items = [...groups.values()].map(group => ({
    ...group,
    value: group[metric],
    share: total > 0 ? group[metric] / total : 0,
  })).sort((a, b) => b.value - a.value || b.count - a.count || a.label.localeCompare(b.label, "vi"));
  return { period, mode: metric, total, items };
}

export function getBubbleSize(share, min = 112, max = 204) {
  const boundedShare = Math.max(0, Math.min(1, Number(share) || 0));
  return Math.round(min + Math.sqrt(boundedShare) * (max - min));
}

export function buildHealthInsights(transactions, period) {
  const records = selectPeriodTransactions(transactions, period);
  const scopeLabel = period === "all" ? "toàn bộ thời gian" : monthLabel(period);
  if (!records.length) {
    return [{ type: "unknown", title: "Chưa có dữ liệu", text: "Chưa có giao dịch trong " + scopeLabel + " để nhận xét về tên món, khẩu vị hoặc tần suất." }];
  }

  const insights = [];
  const notes = records.map(transaction => ({
    transaction,
    text: `${transaction.itemName} ${transaction.taste || ""} ${transaction.notes || ""}`.toLocaleLowerCase("vi-VN"),
    iconId: Object.hasOwn(FOOD_ICONS, transaction.iconId) ? transaction.iconId : resolveFoodIcon(transaction.itemName),
  }));
  // Classify recorded meals without inferring portions or nutrient quantities.
  const foodRules = [
    { iconId: "rice", title: "Cơm và món từ gạo", pattern: /\b(com|rice|bibimbap|xoi|chao)\b/u, advice: "Khi chọn bữa cơm, bạn có thể kết hợp rau và nguồn đạm như cá, trứng hoặc đậu; điều chỉnh phần cơm theo nhu cầu và mức vận động của mình." },
    { iconId: "noodles", title: "Phở, bún và mì", pattern: /\b(pho|bun|mi|noodle|ramen|mien|hu tieu|banh canh)\b/u, advice: "Bạn có thể thêm rau và nguồn đạm vào bữa phở, bún hoặc mì; nếm trước khi thêm nước chấm, và dùng lượng nước dùng phù hợp với nhu cầu của mình." },
    { iconId: "bread", title: "Bánh mì và món ăn nhanh", pattern: /\b(banh mi|bread|sandwich|burger|pizza)\b/u, advice: "Có thể chọn phần có rau, trứng, cá hoặc đậu; gọi sốt riêng để tự điều chỉnh. Tên món chưa cho biết loại bột, nhân hay lượng muối thực tế." },
    { iconId: "rice", title: "Rau, củ, quả và các loại đậu", pattern: /\b(rau|salad|cu qua|trai cay|hoa qua|tao|chuoi|cam|oi|du du|dau|nam|vegetable|fruit|tofu|bean)\b/u, advice: "Bạn đã ghi nhận tên món có rau, củ, quả hoặc đậu. Có thể luân phiên nhiều loại và màu sắc; với trái cây, ưu tiên dạng nguyên miếng khi phù hợp. Số lần mua không cho biết bạn đã ăn đủ rau quả hay chưa." },
    { iconId: "rice", title: "Thịt, cá, trứng và hải sản", pattern: /\b(thit|bo|ga|heo|lon|vit|ca|tom|cua|muc|hai san|trung|beef|chicken|pork|fish|egg|seafood)\b/u, advice: "Bạn có thể luân phiên các nguồn đạm và cách chế biến như hấp, luộc hoặc kho vừa vị; kết hợp rau trong bữa ăn. Ghi thêm loại thịt, cá và cách chế biến sẽ giúp nhận xét sát hơn." },
    { iconId: "fried", title: "Món chế biến sẵn và vị mặn", pattern: /\b(xuc xich|jambon|ham|bacon|thi[t]? nguoi|do hop|kho bo|kho ga|snack|nhieu muoi|man)\b/u, advice: "Nếu thường dùng các món này, bạn có thể luân phiên với thực phẩm tươi, nếm trước khi thêm gia vị và xem thông tin natri trên nhãn khi có. Chưa thể tính lượng muối từ tên món." },
  ];
  const foodNotes = notes.filter(({ transaction, iconId }) => transaction.category === "Đồ ăn"
    || ["rice", "noodles", "bread", "cake", "fried"].includes(iconId));
  const matchedFoods = new Set();
  for (const rule of foodRules) {
    const matched = foodNotes.filter(note => rule.pattern.test(note.text.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gu, "d")));
    if (!matched.length) continue;
    matched.forEach(note => matchedFoods.add(note));
    insights.push({ type: "consider", iconId: rule.iconId, count: matched.length, total: records.length, title: rule.title,
      text: `Đã ghi: ${[...new Set(matched.map(note => note.transaction.itemName))].join(", ")}. Có ${matched.length} giao dịch trong nhóm này. ${rule.advice}` });
  }
  const otherFoods = foodNotes.filter(note => !matchedFoods.has(note)
    && !["cake", "fried"].includes(note.iconId));
  if (otherFoods.length) insights.push({ type: "consider", iconId: "other", count: otherFoods.length, total: records.length,
    title: "Các món ăn khác trong sổ",
    text: `Đã ghi: ${[...new Set(otherFoods.map(note => note.transaction.itemName))].join(", ")}. Có ${otherFoods.length} giao dịch món ăn chưa nhận diện rõ nhóm nguyên liệu. Bạn có thể ghi thêm thành phần chính, cách chế biến và khẩu phần; khi chọn bữa ăn, cân nhắc kết hợp rau, nguồn đạm và món cung cấp tinh bột phù hợp với nhu cầu của mình.` });
  const drinksWithoutSugarDetails = notes.filter(({ transaction, text }) => transaction.category === "Đồ uống"
    && !/không\s+đường|không\s+ngọt|ít\s+đường|giảm\s+đường|ít\s+ngọt|nhiều\s+đường|thêm\s+đường/iu.test(text)).length;
  const unknownInsight = { type: "unknown", title: "Chưa thể đánh giá toàn bộ khẩu phần", text: `Có ${records.length} giao dịch trong ${scopeLabel}; ${drinksWithoutSugarDetails} giao dịch thuộc danh mục đồ uống chưa ghi mức đường. Bạn có thể ghi thêm nguyên liệu, cách chế biến, khẩu phần món ăn và khẩu vị đồ uống. Sổ chi tiêu không phản ánh mọi món đã ăn và không cho biết công thức hoặc khẩu phần, nên chưa thể đánh giá tổng lượng đường, dầu mỡ hay caffeine.` };
  const lowerSugar = notes.filter(({ text }) => /không\s+đường|không\s+ngọt|ít\s+đường|giảm\s+đường|ít\s+ngọt/iu.test(text));
  if (lowerSugar.length) {
    insights.push({ type: "positive", iconId: "tea", count: lowerSugar.length, total: records.length, title: "Đã ghi nhận lựa chọn ít / không đường", text: `${lowerSugar.length} giao dịch có ghi khẩu vị không đường, ít đường hoặc ít ngọt. Đây là thông tin theo ghi chép của bạn; công thức thực tế có thể khác.` });
  }

  const explicitlySweet = notes.filter(({ text }) => /nhiều\s+đường|thêm\s+đường|đầy\s+đường|full\s+đường/iu.test(text));
  const sweetDrinkNames = notes.filter(({ transaction, iconId, text }) => {
    const namedDrink = iconId === "milk-tea" || /nước\s+ngọt|soft\s*drink|soda|siro|syrup/iu.test(`${transaction.itemName} ${text}`);
    return namedDrink && !/không\s+đường|không\s+ngọt|ít\s+đường|giảm\s+đường|ít\s+ngọt/iu.test(text);
  });
  if (explicitlySweet.length || sweetDrinkNames.length) {
    const count = new Set([...explicitlySweet, ...sweetDrinkNames].map(record => record.transaction.id)).size;
    insights.push({ type: "consider", iconId: "milk-tea", count, total: records.length, title: "Món ăn / đồ uống có thể ngọt", text: `${count} giao dịch được ghi rõ nhiều đường hoặc có tên nhóm thường được pha ngọt như trà sữa / nước ngọt. Nếu phù hợp, bạn có thể chọn ít đường hơn; ghi chép không cho biết lượng đường thực tế.` });
  }

  const dessert = notes.filter(({ transaction, iconId }) => iconId === "cake" || /bánh ngọt|bánh kem|chè\b|kem\b|dessert|donut|croissant/iu.test(transaction.itemName));
  if (dessert.length) insights.push({ type: "consider", iconId: "cake", count: dessert.length, total: records.length, title: "Bánh ngọt / món tráng miệng", text: `Bạn đã ghi nhận ${dessert.length} giao dịch thuộc nhóm bánh ngọt hoặc món tráng miệng theo tên món. Có thể cân nhắc tần suất và khẩu phần; dữ liệu chi tiêu không cho biết thành phần dinh dưỡng.` });

  const fried = notes.filter(({ transaction, iconId }) => iconId === "fried" || /chiên|rán|fried|fries/iu.test(`${transaction.itemName} ${transaction.notes}`));
  if (fried.length) insights.push({ type: "consider", iconId: "fried", count: fried.length, total: records.length, title: "Món được mô tả là chiên", text: `${fried.length} giao dịch có tên món hoặc icon thuộc nhóm chiên. Nếu phù hợp, bạn có thể luân phiên với món luộc / hấp; ghi chép không cho biết lượng dầu hay chất béo.` });

  const caffeine = notes.filter(({ transaction, iconId }) => iconId === "coffee" || iconId === "matcha" || /cà\s*phê|coffee|cafe|espresso|americano|matcha|trà\s+xanh|green\s+tea/iu.test(transaction.itemName));
  if (caffeine.length) insights.push({ type: "consider", iconId: "coffee", count: caffeine.length, total: records.length, title: "Đồ uống có thể chứa caffeine", text: `${caffeine.length} giao dịch có tên cà phê, matcha hoặc trà xanh. Hàm lượng và việc dùng loại khử caffeine không thể xác định từ ghi chép; cân nhắc thời điểm uống nếu điều đó phù hợp với bạn.` });

  const countsByIcon = new Map();
  for (const { iconId } of notes) countsByIcon.set(iconId, (countsByIcon.get(iconId) || 0) + 1);
  for (const [iconId, count] of [...countsByIcon].filter(([, count]) => count >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3)) {
    insights.push({ type: "consider", iconId, count, total: records.length, title: `Lặp lại: ${FOOD_ICONS[iconId].label}`, text: `Nhóm ${FOOD_ICONS[iconId].label.toLocaleLowerCase("vi-VN")} xuất hiện ${count} lần trong ${scopeLabel}. Bạn có thể dùng tần suất này để cân nhắc sự đa dạng món; số giao dịch không thể hiện toàn bộ khẩu phần.` });
  }

  if (!insights.some(item => item.type === "positive" || item.type === "consider")) {
    insights.push({ type: "unknown", title: "Thông tin còn hạn chế", text: "Tên món và ghi chú tháng này chưa cho biết rõ về đường, dầu mỡ hoặc caffeine. Chưa đủ dữ liệu để nhận xét; bạn có thể ghi thêm khẩu vị nếu muốn." });
  }
  return [...insights.filter(item => item.type !== "unknown"), unknownInsight];
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1).replace(".", ",")}%`;
}

function shiftMonth(month, amount) {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(year, monthNumber - 1 + amount, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
}

export function resolveDashboardSelection(mode, customMonth, now = new Date()) {
  const currentMonth = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  if (mode === "all") return { mode, period: "all", label: "Toàn bộ thời gian" };
  if (mode === "this-month") {
    return { mode, period: currentMonth, label: "Tháng này · " + monthLabel(currentMonth) };
  }
  if (mode === "last-month") {
    const previousMonth = shiftMonth(currentMonth, -1);
    return { mode, period: previousMonth, label: "Tháng trước · " + monthLabel(previousMonth) };
  }
  const selectedMonth = /^\d{4}-(?:0[1-9]|1[0-2])$/u.test(customMonth) ? customMonth : currentMonth;
  return { mode: "custom", period: selectedMonth, label: monthLabel(selectedMonth) };
}

export function buildPeriodExport(transactions, selection) {
  const selected = selectPeriodTransactions(transactions, selection.period);
  const summary = aggregatePeriod(selected, "all");
  return {
    period: selection.period,
    label: selection.label,
    total: summary.total,
    count: summary.count,
    activeDays: summary.activeDays,
    transactions: selected,
  };
}

export function getMonthlyComparison(transactions, selectedMonth, now = new Date()) {
  const currentMonth = selectedMonth === "all"
    ? now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0")
    : selectedMonth;
  const previousMonth = shiftMonth(currentMonth, -1);
  const currentPeriod = selectPeriodTransactions(transactions, currentMonth);
  const previousPeriod = selectPeriodTransactions(transactions, previousMonth);
  const previousTotal = previousPeriod.reduce((total, transaction) => total + transaction.amount, 0);
  const currentTotal = currentPeriod.reduce((total, transaction) => total + transaction.amount, 0);
  const difference = currentTotal - previousTotal;
  return {
    status: !previousPeriod.length ? "missing" : previousTotal === 0 ? "zero" : "compared",
    currentMonth,
    previousMonth,
    currentCount: currentPeriod.length,
    previousCount: previousPeriod.length,
    currentTotal,
    previousTotal,
    difference,
    percentage: previousTotal > 0 ? (difference / previousTotal) * 100 : null,
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(value);
}

export function formatVnd(value) {
  return `${formatNumber(value)} ₫`;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let insideQuotes = false;
  const source = String(text || "").replace(/^\uFEFF/u, "");
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (insideQuotes) {
      if (character === '"' && source[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') insideQuotes = false;
      else field += character;
    } else if (character === '"') insideQuotes = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n" || character === "\r") {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) { row.push(field); if (row.some(value => value !== "")) rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map(value => value.trim());
  return rows.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

export function serializeCsv(transactions, report = null) {
  const transactionFields = ["id", "merchant", "itemName", "amount", "date", "taste", "category", "notes", "iconId", "iconManuallySet", "createdAt", "updatedAt"];
  if (!report) {
    return `\uFEFF${transactionFields.join(",")}\r\n${transactions.map(transaction => transactionFields.map(field => csvEscape(transaction[field])).join(",")).join("\r\n")}`;
  }
  const fields = ["recordType", "period", "label", "total", "count", "activeDays", ...transactionFields];
  const rows = transactions.map(transaction => fields.map(field => csvEscape({
    recordType: "transaction",
    period: report.period,
    label: report.label,
    total: report.total,
    count: report.count,
    activeDays: report.activeDays,
    ...transaction,
  }[field])).join(","));
  rows.push(fields.map(field => csvEscape({
    recordType: "summary",
    period: report.period,
    label: report.label,
    total: report.total,
    count: report.count,
    activeDays: report.activeDays,
  }[field])).join(","));
  return `\uFEFF${fields.join(",")}\r\n${rows.join("\r\n")}`;
}

export function prepareImportRows(data, existing, options = {}) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.transactions) ? data.transactions : [];
  const transactions = rows.filter(item => item?.recordType !== "summary");
  const imported = [];
  const skipped = { duplicate: 0, invalid: 0 };
  const ids = new Set(existing.map(item => item.id));
  for (const row of transactions) {
    try {
      const valid = validateTransaction(row, options);
      if (ids.has(valid.id)) {
        skipped.duplicate += 1;
        continue;
      }
      ids.add(valid.id);
      imported.push(valid);
    } catch {
      skipped.invalid += 1;
    }
  }
  return { imported, skipped, total: transactions.length };
}

export function openDatabase(factory = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    if (!factory) { reject(new LocalExpenseError("storage_unavailable", "open_database")); return; }
    let request;
    try { request = factory.open(DATABASE_NAME, DATABASE_VERSION); }
    catch (cause) { reject(new LocalExpenseError("storage_error", "open_database", cause)); return; }
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
      if (!database.objectStoreNames.contains(SYNC_STORE_NAME)) database.createObjectStore(SYNC_STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new LocalExpenseError("storage_error", "open_database", request.error));
    request.onblocked = () => reject(new LocalExpenseError("storage_error", "open_database_blocked"));
  });
}

function dbRequest(database, mode, action, storeName = STORE_NAME) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    let result;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error || new Error("Không thể hoàn tất thao tác với dữ liệu."));
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error || new Error("Không thể hoàn tất thao tác với dữ liệu."));
    transaction.onabort = () => reject(transaction.error || new Error("Thao tác với dữ liệu đã bị hủy."));
  }).catch(cause => { throw cause instanceof LocalExpenseError ? cause : new LocalExpenseError("storage_error", "dbRequest", cause); });
}

function defaultSyncMeta() {
  return { key: "state", repository: null, base: null, lastSyncedAt: null, remoteSha: null, tombstones: [] };
}

export async function readSyncMeta(database) {
  return (await dbRequest(database, "readonly", store => store.get("state"), SYNC_STORE_NAME)) || defaultSyncMeta();
}

function localExpenseDocument(records, tombstones = []) {
  const transactions = normalizeTransactions(records);
  const activeIds = new Set(transactions.map(record => record.id));
  return {
    schemaVersion: CLOUD_SCHEMA_VERSION,
    transactions,
    tombstones: tombstones.filter(item => item && !activeIds.has(item.id)),
  };
}

export async function captureLocalExpenseState(database) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction([STORE_NAME, SYNC_STORE_NAME], "readonly");
    const records = tx.objectStore(STORE_NAME).getAll();
    const metadata = tx.objectStore(SYNC_STORE_NAME).get("state");
    tx.oncomplete = () => {
      try {
        const meta = metadata.result || defaultSyncMeta();
        resolve({ document: localExpenseDocument(records.result, meta.tombstones), meta });
      } catch (cause) { reject(new LocalExpenseError("storage_error", "capture_local", cause)); }
    };
    tx.onerror = tx.onabort = () => reject(new LocalExpenseError("storage_error", "capture_local", tx.error));
  }).catch(cause => { throw cause instanceof LocalExpenseError ? cause : new LocalExpenseError("storage_error", "captureLocalExpenseState", cause); });
}

export function writeTransactionsAndRestore(database, records) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, SYNC_STORE_NAME], "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const metaStore = transaction.objectStore(SYNC_STORE_NAME);
    const metaRequest = metaStore.get("state");
    metaRequest.onsuccess = () => {
      const meta = metaRequest.result || defaultSyncMeta();
      const restoredIds = new Set(records.map(record => record.id));
      meta.tombstones = (meta.tombstones || []).filter(tombstone => !restoredIds.has(tombstone.id));
      metaStore.put(meta);
      for (const record of records) store.put(record);
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Không thể cập nhật dữ liệu trên thiết bị."));
    transaction.onabort = () => reject(transaction.error || new Error("Thao tác với dữ liệu đã bị hủy."));
  }).catch(cause => { throw cause instanceof LocalExpenseError ? cause : new LocalExpenseError("storage_error", "writeTransactionsAndRestore", cause); });
}

function deleteExpenseWithTombstone(database, id) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, SYNC_STORE_NAME], "readwrite");
    transaction.objectStore(STORE_NAME).delete(id);
    const metaStore = transaction.objectStore(SYNC_STORE_NAME);
    const metaRequest = metaStore.get("state");
    metaRequest.onsuccess = () => {
      const meta = metaRequest.result || defaultSyncMeta();
      const tombstones = (meta.tombstones || []).filter(tombstone => tombstone.id !== id);
      tombstones.push({ id, deletedAt: new Date().toISOString() });
      meta.tombstones = tombstones;
      metaStore.put(meta);
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Không thể xóa giao dịch."));
    transaction.onabort = () => reject(transaction.error || new Error("Thao tác với dữ liệu đã bị hủy."));
  }).catch(cause => { throw cause instanceof LocalExpenseError ? cause : new LocalExpenseError("storage_error", "deleteExpenseWithTombstone", cause); });
}

export function applySyncedDocument(database, snapshot, result, repository) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE_NAME, SYNC_STORE_NAME], "readwrite");
    const transactionStore = transaction.objectStore(STORE_NAME);
    const metaStore = transaction.objectStore(SYNC_STORE_NAME);
    const recordsRequest = transactionStore.getAll();
    const metaRequest = metaStore.get("state");
    let records;
    let currentMeta;
    let applied = false;
    const applyIfReady = () => {
      if (applied || records === undefined || currentMeta === undefined) return;
      applied = true;
      try {
      const current = localExpenseDocument(records, currentMeta.tombstones || []);
      const snapshotStates = new Map();
      const currentStates = new Map();
      const resultStates = new Map();
      for (const record of snapshot.transactions) snapshotStates.set(record.id, { kind: "record", value: record });
      for (const tombstone of snapshot.tombstones) snapshotStates.set(tombstone.id, { kind: "deleted", value: tombstone });
      for (const record of current.transactions) currentStates.set(record.id, { kind: "record", value: record });
      for (const tombstone of current.tombstones) currentStates.set(tombstone.id, { kind: "deleted", value: tombstone });
      for (const record of result.document.transactions) resultStates.set(record.id, { kind: "record", value: record });
      for (const tombstone of result.document.tombstones) resultStates.set(tombstone.id, { kind: "deleted", value: tombstone });

      const selectedStates = new Map();
      const ids = new Set([...snapshotStates.keys(), ...currentStates.keys(), ...resultStates.keys()]);
      for (const id of ids) {
        const currentState = currentStates.get(id);
        const snapshotState = snapshotStates.get(id);
        const localChangedInFlight = expenseStateFingerprint(currentState) !== expenseStateFingerprint(snapshotState);
        const selected = localChangedInFlight ? currentState : resultStates.get(id);
        if (selected) selectedStates.set(id, selected);
      }
      const finalRecords = [];
      const finalTombstones = [];
      for (const state of selectedStates.values()) {
        if (state.kind === "record") finalRecords.push(state.value);
        if (state.kind === "deleted") finalTombstones.push(state.value);
      }
      const retainedIds = new Set(finalRecords.map(record => record.id));
      for (const record of records) if (!retainedIds.has(record.id)) transactionStore.delete(record.id);
      for (const record of finalRecords) transactionStore.put(record);
      const nextMeta = {
        ...currentMeta,
        key: "state",
        repository,
        base: result.document,
        lastSyncedAt: new Date().toISOString(),
        remoteSha: result.sha || null,
        tombstones: finalTombstones,
        syncAttempt: null,
      };
      metaStore.put(nextMeta);
      } catch (cause) { transaction.abort(); reject(new LocalExpenseError("storage_error", "apply_local", cause)); }
    };
    recordsRequest.onsuccess = () => { records = recordsRequest.result; applyIfReady(); };
    metaRequest.onsuccess = () => { currentMeta = metaRequest.result || defaultSyncMeta(); applyIfReady(); };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Không thể áp dụng dữ liệu đồng bộ."));
    transaction.onabort = () => reject(transaction.error || new Error("Không thể áp dụng dữ liệu đồng bộ."));
  }).catch(cause => { throw cause instanceof LocalExpenseError ? cause : new LocalExpenseError("storage_error", "applySyncedDocument", cause); });
}

export async function checkpointExpenseSync(database, syncAttempt) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction(SYNC_STORE_NAME, "readwrite");
    const store = tx.objectStore(SYNC_STORE_NAME);
    const request = store.get("state");
    request.onsuccess = () => store.put({ ...(request.result || defaultSyncMeta()), syncAttempt });
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () => reject(new LocalExpenseError("storage_error", "checkpoint_sync", tx.error));
  }).catch(cause => { throw cause instanceof LocalExpenseError ? cause : new LocalExpenseError("storage_error", "checkpointExpenseSync", cause); });
}

function makeElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function makeSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tagName);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function createFoodIcon(iconId, spriteUrl) {
  const resolvedId = Object.hasOwn(FOOD_ICONS, iconId) ? iconId : "other";
  const descriptor = FOOD_ICONS[resolvedId];
  const tile = makeElement("span", "food-icon-tile");
  tile.style.backgroundColor = descriptor.background;
  tile.setAttribute("role", "img");
  tile.setAttribute("aria-label", `Nhóm món: ${descriptor.label}`);
  tile.title = descriptor.label;
  const svg = makeSvgElement("svg", { viewBox: "0 0 64 64", class: "food-icon-svg", "aria-hidden": "true", focusable: "false" });
  const use = makeSvgElement("use", { href: `${spriteUrl}#food-icon-${resolvedId}` });
  svg.append(use);
  tile.append(svg);
  return tile;
}

function createFoodIconOption(iconId, descriptor, spriteUrl) {
  const button = makeElement("button", "food-icon-option");
  button.type = "button";
  button.dataset.foodIcon = iconId;
  button.setAttribute("aria-label", `Chọn icon ${descriptor.label}`);
  button.setAttribute("aria-pressed", "false");
  const tile = createFoodIcon(iconId, spriteUrl);
  tile.setAttribute("aria-hidden", "true");
  tile.removeAttribute("role");
  tile.removeAttribute("aria-label");
  tile.removeAttribute("title");
  button.append(tile, makeElement("span", "food-icon-option__label", descriptor.label));
  return button;
}

function monthLabel(month) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `Tháng ${monthNumber}/${year}`;
}

function dateLabel(date) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function drawDailyChart(summary, month) {
  const svg = document.querySelector("#daily-chart");
  const empty = document.querySelector("#daily-empty");
  const tooltip = document.querySelector("#daily-tooltip");
  const table = document.querySelector("#daily-data-table");
  svg.replaceChildren();
  table.replaceChildren();
  tooltip.hidden = true;
  const days = getDaysInMonth(month);
  const values = Array.from({ length: days }, (_, index) => summary.daily.get(index + 1)?.total || 0);
  const maxValue = Math.max(...values, 0);
  const hasData = maxValue > 0;
  empty.hidden = hasData;
  svg.hidden = !hasData;
  if (!hasData) return;

  const plot = { left: 62, right: 786, top: 18, bottom: 226 };
  const xFor = index => plot.left + (days === 1 ? 0 : index * (plot.right - plot.left) / (days - 1));
  const yFor = value => plot.bottom - value / (maxValue || 1) * (plot.bottom - plot.top);
  const yTopMax = Math.ceil(maxValue / 4) * 4 || maxValue;
  for (let step = 0; step <= 4; step += 1) {
    const y = plot.bottom - step * (plot.bottom - plot.top) / 4;
    svg.append(makeSvgElement("line", { x1: plot.left, x2: plot.right, y1: y, y2: y, class: "chart-grid-line" }));
    const label = makeSvgElement("text", { x: plot.left - 9, y: y + 4, "text-anchor": "end", class: "chart-axis-label" });
    label.textContent = step === 0 ? "0" : formatNumber(Math.round(yTopMax * step / 4));
    svg.append(label);
  }
  const stepLabel = Math.max(1, Math.ceil(days / 7));
  for (let day = 1; day <= days; day += stepLabel) {
    const label = makeSvgElement("text", { x: xFor(day - 1), y: 252, "text-anchor": day === 1 ? "start" : "middle", class: "chart-axis-label" });
    label.textContent = String(day);
    svg.append(label);
  }
  if (days % stepLabel !== 1 && days !== 1) {
    const label = makeSvgElement("text", { x: plot.right, y: 252, "text-anchor": "end", class: "chart-axis-label" });
    label.textContent = String(days);
    svg.append(label);
  }
  const points = values.map((value, index) => [xFor(index), yFor(value)]);
  const linePath = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L ${plot.right} ${plot.bottom} L ${plot.left} ${plot.bottom} Z`;
  svg.append(makeSvgElement("path", { d: areaPath, class: "chart-area" }));
  svg.append(makeSvgElement("path", { d: linePath, class: "chart-line" }));

  values.forEach((value, index) => {
    const day = index + 1;
    const point = makeSvgElement("circle", { cx: xFor(index), cy: yFor(value), r: value ? 4.3 : 2, class: "chart-point", tabindex: value ? "0" : "-1", "aria-label": `${dateLabel(`${month}-${String(day).padStart(2, "0")}`)}: ${formatVnd(value)}` });
    const title = makeSvgElement("title");
    title.textContent = `${dateLabel(`${month}-${String(day).padStart(2, "0")}`)} · ${formatVnd(value)}`;
    point.append(title);
    if (value) {
      const showTooltip = () => {
        tooltip.textContent = `${dateLabel(`${month}-${String(day).padStart(2, "0")}`)} · ${formatVnd(value)}`;
        tooltip.hidden = false;
        tooltip.style.left = `${Math.max(0, Math.min(78, xFor(index) / 8 - 4))}%`;
        tooltip.style.top = `${Math.max(0, yFor(value) / 2.8 - 14)}px`;
      };
      point.addEventListener("pointerenter", showTooltip);
      point.addEventListener("focus", showTooltip);
      point.addEventListener("pointerleave", () => { tooltip.hidden = true; });
      point.addEventListener("blur", () => { tooltip.hidden = true; });
    }
    svg.append(point);
  });

  for (const [day, entry] of [...summary.daily.entries()].sort((a, b) => a[0] - b[0])) {
    const row = document.createElement("tr");
    for (const value of [dateLabel(`${month}-${String(day).padStart(2, "0")}`), String(entry.count), formatVnd(entry.total)]) {
      row.append(makeElement("td", "", value));
    }
    table.append(row);
  }
}

function drawMonthlyChart(summary) {
  const svg = document.querySelector("#daily-chart");
  const empty = document.querySelector("#daily-empty");
  const tooltip = document.querySelector("#daily-tooltip");
  const table = document.querySelector("#daily-data-table");
  svg.replaceChildren();
  table.replaceChildren();
  tooltip.hidden = true;
  const entries = [...summary.monthly.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const hasData = entries.length > 0;
  empty.hidden = hasData;
  svg.hidden = !hasData;
  if (!hasData) return;

  const plot = { left: 62, right: 786, top: 18, bottom: 226 };
  const maximum = Math.max(...entries.map(([, entry]) => entry.total));
  const yTopMax = Math.ceil(maximum / 4) * 4 || maximum;
  const xFor = index => plot.left + (entries.length === 1 ? 0 : index * (plot.right - plot.left) / (entries.length - 1));
  const yFor = value => plot.bottom - value / (yTopMax || 1) * (plot.bottom - plot.top);
  for (let step = 0; step <= 4; step += 1) {
    const y = plot.bottom - step * (plot.bottom - plot.top) / 4;
    svg.append(makeSvgElement("line", { x1: plot.left, x2: plot.right, y1: y, y2: y, class: "chart-grid-line" }));
    const label = makeSvgElement("text", { x: plot.left - 9, y: y + 4, "text-anchor": "end", class: "chart-axis-label" });
    label.textContent = step === 0 ? "0" : formatNumber(Math.round(yTopMax * step / 4));
    svg.append(label);
  }
  const labelStep = Math.max(1, Math.ceil(entries.length / 8));
  entries.forEach(([month], index) => {
    if (index % labelStep !== 0 && index !== entries.length - 1) return;
    const label = makeSvgElement("text", {
      x: xFor(index),
      y: 252,
      "text-anchor": index === 0 ? "start" : index === entries.length - 1 ? "end" : "middle",
      class: "chart-axis-label",
    });
    label.textContent = month.slice(5) + "/" + month.slice(0, 4);
    svg.append(label);
  });
  const points = entries.map(([, entry], index) => [xFor(index), yFor(entry.total)]);
  const linePath = points.map(([x, y], index) => (index ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2)).join(" ");
  const areaPath = linePath + " L " + plot.right + " " + plot.bottom + " L " + plot.left + " " + plot.bottom + " Z";
  svg.append(makeSvgElement("path", { d: areaPath, class: "chart-area" }));
  svg.append(makeSvgElement("path", { d: linePath, class: "chart-line" }));
  entries.forEach(([month, entry], index) => {
    const label = monthLabel(month) + ": " + formatVnd(entry.total);
    const point = makeSvgElement("circle", {
      cx: xFor(index),
      cy: yFor(entry.total),
      r: 4.3,
      class: "chart-point",
      tabindex: "0",
      "aria-label": label,
    });
    const title = makeSvgElement("title");
    title.textContent = label;
    point.append(title);
    const showTooltip = () => {
      tooltip.textContent = label + " · " + formatNumber(entry.count) + " giao dịch";
      tooltip.hidden = false;
      tooltip.style.left = Math.max(0, Math.min(78, xFor(index) / 8 - 4)) + "%";
      tooltip.style.top = Math.max(0, yFor(entry.total) / 2.8 - 14) + "px";
    };
    point.addEventListener("pointerenter", showTooltip);
    point.addEventListener("focus", showTooltip);
    point.addEventListener("pointerleave", () => { tooltip.hidden = true; });
    point.addEventListener("blur", () => { tooltip.hidden = true; });
    svg.append(point);
  });
  for (const [month, entry] of entries) {
    const row = document.createElement("tr");
    for (const value of [monthLabel(month), String(entry.count), formatVnd(entry.total)]) {
      row.append(makeElement("td", "", value));
    }
    table.append(row);
  }
}

function drawCategoryChart(summary) {
  const svg = document.querySelector("#category-chart");
  const legend = document.querySelector("#category-legend");
  const empty = document.querySelector("#category-empty");
  svg.replaceChildren();
  legend.replaceChildren();
  const entries = CATEGORIES.map((category, index) => ({ category, total: summary.categories.get(category) || 0, color: CATEGORY_COLORS[index] })).filter(entry => entry.total > 0);
  empty.hidden = Boolean(entries.length);
  svg.hidden = !entries.length;
  if (!entries.length) return;

  const total = entries.reduce((sum, entry) => sum + entry.total, 0);
  svg.append(makeSvgElement("circle", { cx: 110, cy: 110, r: 70, class: "donut-track" }));
  let offset = 0;
  const circumference = 2 * Math.PI * 70;
  for (const entry of entries) {
    const length = entry.total / total * circumference;
    const circle = makeSvgElement("circle", {
      cx: 110, cy: 110, r: 70, fill: "none", stroke: entry.color, class: "donut-segment",
      "stroke-dasharray": `${length} ${circumference - length}`, "stroke-dashoffset": -offset,
    });
    const title = makeSvgElement("title");
    title.textContent = `${entry.category}: ${formatVnd(entry.total)} (${(entry.total / total * 100).toFixed(1)}%)`;
    circle.append(title);
    svg.append(circle);
    offset += length;
    const item = makeElement("li");
    const dot = makeElement("span", "legend-dot");
    dot.style.backgroundColor = entry.color;
    dot.setAttribute("aria-hidden", "true");
    const text = makeElement("span");
    text.append(makeElement("span", "legend-name", entry.category));
    text.append(makeElement("span", "legend-value", `${formatVnd(entry.total)} · ${(entry.total / total * 100).toFixed(1)}%`));
    item.append(dot, text);
    legend.append(item);
  }
  const centerLabel = makeSvgElement("text", { x: 110, y: 101, class: "donut-center-label" });
  centerLabel.textContent = "TỔNG CHI";
  const centerValue = makeSvgElement("text", { x: 110, y: 124, class: "donut-center-value" });
  centerValue.textContent = formatNumber(total);
  svg.append(centerLabel, centerValue);
}

function drawMerchantBars(summary) {
  const list = document.querySelector("#merchant-bars");
  const empty = document.querySelector("#merchant-empty");
  list.replaceChildren();
  const entries = summary.merchants.slice(0, 5);
  empty.hidden = Boolean(entries.length);
  list.hidden = !entries.length;
  const maximum = entries[0]?.total || 1;
  for (const entry of entries) {
    const item = makeElement("li", "merchant-bar");
    const header = makeElement("div", "merchant-bar__header");
    header.append(makeElement("span", "merchant-bar__name", entry.merchant));
    header.append(makeElement("span", "merchant-bar__amount", formatVnd(entry.total)));
    const track = makeElement("div", "merchant-bar__track");
    track.setAttribute("role", "img");
    track.setAttribute("aria-label", `${entry.merchant}: ${formatVnd(entry.total)}`);
    const fill = makeElement("div", "merchant-bar__fill");
    fill.style.width = `${Math.max(3, entry.total / maximum * 100)}%`;
    track.append(fill);
    item.append(header, track);
    list.append(item);
  }
}

export function getInsightRecords(transactions, summary, comparison, selection) {
  const scopeLabel = selection.period === "all" ? "toàn bộ thời gian" : monthLabel(selection.period).toLocaleLowerCase("vi-VN");
  if (!summary.count) return [];
  const insights = [];
  const comparisonCurrent = comparison?.currentMonth
    ? monthLabel(comparison.currentMonth).toLocaleLowerCase("vi-VN")
    : selection.period === "all" ? "tháng hiện tại" : monthLabel(selection.period).toLocaleLowerCase("vi-VN");
  const comparisonPrevious = comparison?.previousMonth
    ? monthLabel(comparison.previousMonth).toLocaleLowerCase("vi-VN")
    : "tháng trước";
  if (!comparison || comparison.status === "missing") {
    insights.push({ type: "Xu hướng chi tiêu", text: "Không có giao dịch trong " + comparisonPrevious + " để so sánh với " + comparisonCurrent + "." });
  } else if (comparison.status === "zero") {
    insights.push({ type: "Xu hướng chi tiêu", text: "Không thể tính phần trăm thay đổi so với " + comparisonPrevious + " vì tổng tháng trước bằng 0 đ." });
  } else {
    const direction = comparison.difference > 0 ? "tăng" : comparison.difference < 0 ? "giảm" : "không đổi";
    const percent = formatComparisonPercent(Math.abs(comparison.percentage)) + "%";
    insights.push({ type: "Xu hướng chi tiêu", text: "Chi tiêu " + comparisonCurrent + " " + direction + " " + formatNumber(Math.abs(comparison.difference)) + " đ (" + percent + ") so với " + comparisonPrevious + "." });
  }

  const groupedItems = new Map();
  for (const transaction of summary.transactions) {
    const key = transaction.itemName.trim().toLocaleLowerCase("vi-VN");
    const group = groupedItems.get(key) || { itemName: transaction.itemName, merchant: transaction.merchant, total: 0, count: 0 };
    group.total += transaction.amount;
    group.count += 1;
    groupedItems.set(key, group);
  }
  const repeats = [...groupedItems.values()].filter(item => item.count >= 2).sort((a, b) => b.total - a.total);
  if (repeats[0]) {
    const item = repeats[0];
    const estimatedSave = Math.round(item.total / item.count);
    insights.push({ type: "Khoản chi lặp lại", text: `Bạn đã ghi nhận “${item.itemName}” ${item.count} lần, tổng ${formatVnd(item.total)}. Nếu giảm một lần mua có giá gần mức trung bình, khoản chi có thể giảm khoảng ${formatVnd(estimatedSave)}.` });
  }

  const sweetPattern = /trà\s*sữa|nước\s*ngọt|soda|(?:ít|nhiều|giảm|có)\s*đường|ngọt/iu;
  const noSugarPattern = /không\s*đường|không\s*ngọt/iu;
  const sweetCount = summary.transactions.filter(transaction => {
    const text = `${transaction.itemName} ${transaction.taste} ${transaction.notes}`;
    return !noSugarPattern.test(text) && sweetPattern.test(text);
  }).length;
  if (sweetCount) {
    insights.push({ type: "Thói quen đồ uống", text: `Bạn ghi nhận ${sweetCount} giao dịch có tên như trà sữa / nước ngọt hoặc có ghi vị ngọt, đường. Có thể cân nhắc giảm tần suất hoặc chọn ít đường; tên món không cho biết lượng đường thực tế.` });
  }
  const coffeeCount = summary.transactions.filter(transaction => /cà\s*phê|coffee|cafe|espresso|americano/iu.test(transaction.itemName)).length;
  if (coffeeCount) insights.push({ type: "Tần suất cà phê", text: "Bạn ghi nhận " + coffeeCount + " giao dịch có tên món cà phê trong " + scopeLabel + ". Nếu đây là nhóm chi thường xuyên, hãy cân nhắc đặt ngân sách riêng cho nhóm này." });

  const fried = summary.transactions.filter(transaction => /chiên|rán|fried/iu.test(`${transaction.itemName} ${transaction.notes}`));
  if (fried.length) {
    insights.push({ type: "Món chiên / rán được ghi nhận", text: `Bạn đã ghi nhận ${fried.length} giao dịch có món được mô tả là chiên / rán. Nếu phù hợp, có thể luân phiên với món luộc hoặc hấp; ghi chép này không cho biết lượng dầu hay chất béo.` });
  }
  const dominantCategory = CATEGORIES.map(category => ({ category, total: summary.categories.get(category) || 0 })).sort((a, b) => b.total - a.total)[0];
  if (dominantCategory?.total) {
    const share = (dominantCategory.total / summary.total * 100).toFixed(1).replace(".", ",");
    insights.push({ type: "Cơ cấu " + scopeLabel, text: dominantCategory.category + " là nhóm chi lớn nhất với " + formatVnd(dominantCategory.total) + ", tương đương " + share + "% tổng chi tiêu." });
  }
  if (insights.length < 3) {
    insights.push({ type: "Theo dõi ngân sách", text: "Mức chi trung bình trong " + scopeLabel + " là " + formatVnd(summary.averagePerActiveDay) + " mỗi ngày có giao dịch. Bạn có thể dùng mức này làm mốc tham khảo." });
  }
  return insights.slice(0, 6);
}

function renderInsights(transactions, summary, comparison, selection) {
  const container = document.querySelector("#insight-list");
  container.replaceChildren();
  const records = getInsightRecords(transactions, summary, comparison, selection);
  if (!records.length) {
    container.append(makeElement("p", "insight-empty", "Chưa có giao dịch thực tế trong phạm vi đang chọn."));
    return;
  }
  for (const record of records) {
    const card = makeElement("article", "insight-card");
    card.append(makeElement("p", "insight-card__type", record.type));
    card.append(makeElement("p", "", record.text));
    container.append(card);
  }
}

export function renderHealthInsights(transactions, period) {
  const container = document.querySelector("#health-insight-list");
  container.replaceChildren();
  const spriteUrl = document.querySelector("#expense-app").dataset.iconSprite || "/icons/food-drink.svg";
  for (const record of buildHealthInsights(transactions, period)) {
    const card = makeElement("article", `insight-card health-insight-card health-insight-card--${record.type}`);
    const visual = makeElement("div", "health-insight-card__visual");
    visual.append(createFoodIcon(record.iconId || "other", spriteUrl));
    if (Number.isInteger(record.count) && record.total > 0) {
      const metric = makeElement("p", "health-insight-card__metric");
      metric.append(makeElement("strong", "", String(record.count)), makeElement("span", "", ` / ${record.total} giao dịch`));
      visual.append(metric);
    } else {
      visual.append(makeElement("span", "health-insight-card__prompt", transactions.length ? "Thêm ghi chú, hiểu hơn nhé!" : "Bắt đầu từ một món nhỏ!"));
    }
    card.append(visual);
    card.append(makeElement("p", "insight-card__type", record.type === "positive" ? "Positive · Có thể có lợi" : record.type === "consider" ? "Consider · Đáng cân nhắc" : "Unknown · Chưa đủ dữ liệu"));
    card.append(makeElement("h4", "health-insight-card__title", record.title));
    if (Number.isInteger(record.count) && record.total > 0) {
      const chart = makeElement("div", "health-insight-card__chart");
      const percent = Math.round(record.count / record.total * 100);
      chart.append(makeElement("p", "health-insight-card__caption", `${percent}% giao dịch trong phạm vi đã chọn`));
      const track = makeElement("div", "health-insight-card__track");
      track.setAttribute("aria-hidden", "true");
      const fill = makeElement("span");
      fill.style.width = `${percent}%`;
      track.append(fill);
      chart.append(track);
      card.append(chart);
    }
    card.append(makeElement("p", "health-insight-card__advice", record.text));
    container.append(card);
  }
}

function renderFoodPlayground(transactions, period) {
  const bubbleList = document.querySelector("#food-bubbles");
  const empty = document.querySelector("#bubble-empty");
  const tooltip = document.querySelector("#bubble-tooltip");
  const rankingRows = document.querySelector("#bubble-ranking-rows");
  const selectedMode = document.querySelector('[data-bubble-mode][aria-pressed="true"]')?.dataset.bubbleMode || "count";
  const groups = aggregateFoodGroups(transactions, period, selectedMode);
  const metricName = selectedMode === "amount" ? "tổng số tiền" : "số lần mua";
  const scopeLabel = period === "all" ? "toàn bộ thời gian" : monthLabel(period).toLocaleLowerCase("vi-VN");
  document.querySelector("#bubble-mode-caption").textContent = "Tỷ trọng theo " + metricName + " trong " + scopeLabel + ".";
  document.querySelector("#bubble-ranking-caption").textContent = "Xếp hạng theo " + metricName + " trong " + scopeLabel;
  empty.textContent = "Chưa có giao dịch trong " + scopeLabel + ". Các nhóm món sẽ xuất hiện khi có dữ liệu.";
  bubbleList.replaceChildren();
  rankingRows.replaceChildren();
  tooltip.hidden = true;
  empty.hidden = Boolean(groups.items.length);
  if (!groups.items.length) {
    const row = makeElement("tr");
    const cell = makeElement("td", "bubble-ranking-empty", "Chưa có dữ liệu trong " + scopeLabel + ".");
    cell.colSpan = 5;
    row.append(cell);
    rankingRows.append(row);
    return;
  }

  const spriteUrl = document.querySelector("#expense-app").dataset.iconSprite || "/icons/food-drink.svg";
  const tooltipCopy = group => `${group.label}: ${group.count} lần mua, tổng ${formatVnd(group.amount)}. Tỷ lệ ${group.value} / ${groups.total} = ${formatPercent(group.share)}.`;
  groups.items.forEach((group, index) => {
    const item = makeElement("div", "food-bubble-item");
    item.setAttribute("role", "listitem");
    const bubble = makeElement("button", `food-bubble${index === 0 ? " food-bubble--featured" : ""}`);
    bubble.type = "button";
    bubble.style.setProperty("--bubble-size", `${getBubbleSize(group.share)}px`);
    bubble.style.setProperty("--bubble-pastel", FOOD_ICONS[group.iconId].background);
    bubble.setAttribute("aria-label", tooltipCopy(group));
    bubble.title = tooltipCopy(group);
    bubble.append(createFoodIcon(group.iconId, spriteUrl));
    bubble.append(makeElement("span", "food-bubble__name", group.label));
    bubble.append(makeElement("span", "food-bubble__share", formatPercent(group.share)));
    const show = () => { tooltip.textContent = tooltipCopy(group); tooltip.hidden = false; };
    const hide = () => { if (document.activeElement !== bubble) tooltip.hidden = true; };
    bubble.addEventListener("pointerenter", show);
    bubble.addEventListener("pointerleave", hide);
    bubble.addEventListener("focus", show);
    bubble.addEventListener("blur", () => { tooltip.hidden = true; });
    bubble.addEventListener("click", () => {
      const wasOpen = bubble.dataset.pinned === "true";
      for (const active of bubbleList.querySelectorAll(".food-bubble[data-pinned='true']")) active.dataset.pinned = "false";
      if (wasOpen) tooltip.hidden = true;
      else { bubble.dataset.pinned = "true"; show(); }
    });
    item.append(bubble);
    bubbleList.append(item);
  });

  for (const [index, group] of groups.items.slice(0, 5).entries()) {
    const row = makeElement("tr");
    for (const value of [String(index + 1), group.label, formatNumber(group.count), formatVnd(group.amount), `${group.value} / ${groups.total} · ${formatPercent(group.share)}`]) {
      row.append(makeElement("td", "", value));
    }
    rankingRows.append(row);
  }
}

function formatComparisonPercent(value) {
  return new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function renderKpis(summary, comparison, selection) {
  const scopeLabel = selection.period === "all" ? "toàn bộ thời gian" : monthLabel(selection.period);
  document.querySelector("#kpi-total").textContent = formatVnd(summary.total);
  document.querySelector("#kpi-count").textContent = formatNumber(summary.count);
  document.querySelector("#kpi-average").textContent = formatVnd(summary.averagePerActiveDay);
  document.querySelector("#kpi-period").textContent = selection.label;
  document.querySelector("#kpi-count-caption").textContent = "Trong " + scopeLabel;
  document.querySelector("#kpi-active-days").textContent = summary.activeDays + " ngày có chi trong " + scopeLabel;
  const comparisonValue = document.querySelector("#kpi-comparison");
  const caption = document.querySelector("#kpi-comparison-caption");
  comparisonValue.removeAttribute("data-trend");
  if (!comparison || comparison.status === "missing") {
    comparisonValue.textContent = "—";
    const previousMonth = comparison?.previousMonth || shiftMonth(selection.period, -1);
    caption.textContent = "Không có giao dịch trong tháng trước (" + monthLabel(previousMonth).toLocaleLowerCase("vi-VN") + ").";
    return;
  }
  if (comparison.status === "zero") {
    comparisonValue.textContent = "Không xác định";
    caption.textContent = "Tháng trước (" + monthLabel(comparison.previousMonth).toLocaleLowerCase("vi-VN") + ") có giao dịch nhưng tổng bằng 0 đ; không thể chia cho 0.";
    return;
  }
  const trend = comparison.difference > 0 ? "up" : comparison.difference < 0 ? "down" : "flat";
  const percentageSign = comparison.percentage > 0 ? "+" : comparison.percentage < 0 ? "−" : "";
  comparisonValue.textContent = percentageSign + formatComparisonPercent(Math.abs(comparison.percentage)) + "%";
  comparisonValue.dataset.trend = trend;
  const direction = comparison.difference > 0 ? "Tăng" : comparison.difference < 0 ? "Giảm" : "Không đổi";
  caption.textContent = direction + " " + formatNumber(Math.abs(comparison.difference)) + " đ so với " + monthLabel(comparison.previousMonth).toLocaleLowerCase("vi-VN");
}

function sortTransactions(transactions, sortMode) {
  return [...transactions].sort((a, b) => {
    if (sortMode === "date-asc") return a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);
    if (sortMode === "amount-desc") return b.amount - a.amount || b.date.localeCompare(a.date);
    if (sortMode === "amount-asc") return a.amount - b.amount || b.date.localeCompare(a.date);
    return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
  });
}

function renderTransactions(transactions, spriteUrl) {
  const container = document.querySelector("#transaction-list");
  const empty = document.querySelector("#transaction-empty");
  const search = document.querySelector("#transaction-search").value.trim().toLocaleLowerCase("vi-VN");
  const month = document.querySelector("#transaction-month").value;
  const category = document.querySelector("#transaction-category").value;
  const sortMode = document.querySelector("#transaction-sort").value;
  const filtered = sortTransactions(transactions.filter(transaction => {
    const haystack = `${transaction.merchant} ${transaction.itemName} ${transaction.taste} ${transaction.category} ${transaction.notes}`.toLocaleLowerCase("vi-VN");
    return (!search || haystack.includes(search)) && (month === "all" || monthKey(transaction.date) === month) && (category === "all" || transaction.category === category);
  }), sortMode);
  container.replaceChildren();
  empty.hidden = Boolean(filtered.length);
  for (const record of filtered) {
    const row = makeElement("tr", "transaction-row");
    row.dataset.id = record.id;
    const iconCell = makeElement("td", "transaction-icon");
    iconCell.append(createFoodIcon(record.iconId || resolveFoodIcon(record.itemName), spriteUrl));
    const main = makeElement("th", "transaction-main");
    main.scope = "row";
    main.append(makeElement("strong", "", record.itemName));
    main.append(makeElement("span", "", record.merchant));
    const details = [record.taste, record.notes].filter(Boolean).join(" · ");
    if (details) main.append(makeElement("span", "transaction-details", details));
    const date = makeElement("td", "transaction-date", dateLabel(record.date));
    date.dataset.label = "Ngày";
    const category = makeElement("td", "transaction-category", record.category);
    category.dataset.label = "Danh mục";
    const amount = makeElement("td", "transaction-amount", formatVnd(record.amount));
    amount.dataset.label = "Số tiền";
    const actionCell = makeElement("td", "transaction-action-cell");
    const actions = makeElement("div", "transaction-actions");
    const edit = makeElement("button", "edit-transaction", "Sửa");
    edit.type = "button";
    edit.setAttribute("aria-label", `Sửa ${record.itemName} tại ${record.merchant}`);
    const remove = makeElement("button", "delete-transaction", "Xóa");
    remove.type = "button";
    remove.setAttribute("aria-label", `Xóa ${record.itemName} tại ${record.merchant}`);
    actions.append(edit, remove);
    actionCell.append(actions);
    row.append(iconCell, main, date, category, amount, actionCell);
    container.append(row);
  }
  const filteredTotal = filtered.reduce((sum, transaction) => sum + transaction.amount, 0);
  const historyScope = [
    month === "all" ? "tất cả tháng" : monthLabel(month),
    category === "all" ? "tất cả danh mục" : category,
    search ? "tìm: " + document.querySelector("#transaction-search").value.trim() : "",
  ].filter(Boolean).join(" · ");
  document.querySelector("#transaction-status").textContent =
    "Lịch sử độc lập với báo cáo · " + historyScope + " · " + formatVnd(filteredTotal) + " · " +
    formatNumber(filtered.length) + " giao dịch (trong " + formatNumber(transactions.length) + ")";
}

function refreshMonthFilter(transactions) {
  const select = document.querySelector("#transaction-month");
  const previous = select.value || "all";
  const months = [...new Set(transactions.map(transaction => monthKey(transaction.date)))].sort((a, b) => b.localeCompare(a));
  select.replaceChildren(new Option("Tất cả tháng", "all"));
  for (const month of months) select.append(new Option(monthLabel(month), month));
  select.value = months.includes(previous) ? previous : "all";
}

function renderDashboard(transactions, mode = "all", customMonth = "") {
  const selection = resolveDashboardSelection(mode, customMonth);
  const summary = aggregatePeriod(transactions, selection.period);
  const comparison = getMonthlyComparison(transactions, selection.period);
  renderKpis(summary, comparison, selection);
  document.querySelector("#spending-summary").textContent = selection.label + " · " + formatNumber(summary.count) + " giao dịch · " + formatVnd(summary.total);
  document.querySelector("#spending-kicker").textContent = selection.period === "all" ? "DIỄN BIẾN THEO THÁNG" : "DIỄN BIẾN THEO NGÀY";
  document.querySelector("#spending-title").textContent = selection.period === "all" ? "Chi tiêu theo tháng" : "Chi tiêu trong tháng";
  document.querySelector("#daily-chart").setAttribute("aria-label", selection.period === "all" ? "Biểu đồ chi tiêu theo tháng" : "Biểu đồ chi tiêu theo ngày");
  document.querySelector("#daily-chart-data").textContent = selection.period === "all" ? "Xem bảng số liệu theo tháng" : "Xem bảng số liệu theo ngày";
  document.querySelector("#daily-chart-caption").textContent = selection.period === "all" ? "Chi tiêu theo tháng trong toàn bộ thời gian" : "Chi tiêu theo ngày trong " + monthLabel(selection.period);
  document.querySelector("#daily-empty").textContent = "Chưa có giao dịch trong " + (selection.period === "all" ? "toàn bộ thời gian" : monthLabel(selection.period)) + ".";
  if (selection.period === "all") drawMonthlyChart(summary);
  else drawDailyChart(summary, selection.period);
  drawCategoryChart(summary);
  drawMerchantBars(summary);
  renderInsights(transactions, summary, comparison, selection);
  renderFoodPlayground(transactions, selection.period);
  renderHealthInsights(transactions, selection.period);
  document.querySelector("#health-insight-period").textContent = "Phạm vi dữ liệu: " + selection.label + ".";
}

function setFieldReview(review = {}) {
  for (const indicator of document.querySelectorAll("[data-review]")) {
    indicator.hidden = !review[indicator.dataset.review];
  }
}

function setFormValues(values, setFoodIconChoice) {
  document.querySelector("#expense-merchant").value = values.merchant || "";
  document.querySelector("#expense-item").value = values.itemName || "";
  document.querySelector("#expense-amount").value = values.amount || "";
  document.querySelector("#expense-date").value = values.date || "";
  document.querySelector("#expense-taste").value = values.taste || "";
  document.querySelector("#expense-category").value = values.category || "";
  document.querySelector("#expense-notes").value = values.notes || "";
  setFoodIconChoice(values.iconId || resolveFoodIcon(values.itemName), Boolean(values.iconManuallySet));
  setFieldReview(values.review);
}

function downloadFile(name, content, mimeType) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const link = makeElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function showStorageError(message) {
  const error = document.querySelector("#storage-error");
  error.textContent = message;
  error.hidden = false;
}

export async function startExpenseTracker() {
  const app = document.querySelector("#expense-app");
  if (!app) return;
  let dashboardMode = "all";
  const setDashboardMode = mode => {
    dashboardMode = mode;
    for (const button of document.querySelectorAll("[data-dashboard-period]")) {
      const active = button.dataset.dashboardPeriod === mode;
      button.setAttribute("aria-pressed", String(active));
      button.classList.toggle("is-active", active);
    }
    document.querySelector("#custom-month-control").hidden = mode !== "custom";
  };
  const form = document.querySelector("#expense-form");
  const parseStatus = document.querySelector("#parse-status");
  const saveButton = document.querySelector("#save-expense");
  const cancelButton = document.querySelector("#cancel-edit");
  const spriteUrl = app.dataset.iconSprite;
  const iconOptions = document.querySelector("#food-icon-options");
  const iconInput = document.querySelector("#expense-icon-id");
  const iconManualInput = document.querySelector("#expense-icon-manual");
  const iconStatus = document.querySelector("#expense-icon-status");
  let currentIconManuallySet = false;
  const setFoodIconChoice = (requestedId, manuallySet = false) => {
    const iconId = Object.hasOwn(FOOD_ICONS, requestedId) ? requestedId : resolveFoodIcon(document.querySelector("#expense-item").value);
    iconInput.value = iconId;
    iconManualInput.value = String(Boolean(manuallySet));
    currentIconManuallySet = Boolean(manuallySet);
    for (const button of iconOptions.querySelectorAll("[data-food-icon]")) {
      const selected = button.dataset.foodIcon === iconId;
      button.setAttribute("aria-pressed", String(selected));
    }
    const descriptor = FOOD_ICONS[iconId];
    iconStatus.textContent = `${currentIconManuallySet ? "Đã chọn thủ công" : "Tự nhận diện"}: ${descriptor.label}`;
  };
  for (const [iconId, descriptor] of Object.entries(FOOD_ICONS)) {
    const button = createFoodIconOption(iconId, descriptor, spriteUrl);
    button.addEventListener("click", () => setFoodIconChoice(iconId, true));
    iconOptions.append(button);
  }
  setFoodIconChoice("other");
  let database;
  try {
    database = await openDatabase();
    document.querySelector("#local-storage-status").textContent = "Sẵn sàng";
  } catch (error) {
    document.querySelector("#local-storage-status").textContent = error.code === "storage_unavailable" ? "Không khả dụng" : "Lỗi";
    throw error;
  }
  let transactions = normalizeTransactions(await dbRequest(database, "readonly", store => store.getAll()));
  let editingId = "";
  const githubSync = new GitHubExpenseSync({ validateTransaction });
  const cloudStatus = document.querySelector("#cloud-sync-status");
  const cloudMessage = document.querySelector("#cloud-sync-message");
  const cloudForm = document.querySelector("#cloud-connect-form");
  const cloudControls = document.querySelector("#cloud-connected-controls");
  const cloudMigration = document.querySelector("#cloud-migration");
  const cloudConflicts = document.querySelector("#cloud-conflicts");
  const cloudConflictList = document.querySelector("#cloud-conflict-list");
  let syncMeta = await readSyncMeta(database);
  let syncTimer = 0;
  let syncInProgress = false;
  let syncClickInProgress = false;
  let pageActive = true;
  let syncAgainRequested = false;
  let pendingSyncBase = null;
  let currentConflicts = [];
  let conflictResolutions = {};

  const updateCloudStatus = (state, message) => {
    cloudStatus.dataset.state = state;
    cloudStatus.textContent = message;
  };

  const sameCloudRepository = repository => Boolean(repository
    && repository.owner?.toLocaleLowerCase("en-US") === EXPENSE_REPOSITORY.owner
    && repository.repository?.toLocaleLowerCase("en-US") === EXPENSE_REPOSITORY.repository
    && repository.branch === EXPENSE_REPOSITORY.branch
    && repository.path === EXPENSE_CLOUD_PATH);

  const formatSyncTimestamp = value => {
    if (!value || !Number.isFinite(Date.parse(value))) return "Chưa có";
    return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  };

  const updateCloudMeta = async () => {
    syncMeta = await readSyncMeta(database);
    const local = await captureLocalExpenseState(database);
    const matchesTarget = sameCloudRepository(syncMeta.repository);
    const pending = countUnsyncedExpenseChanges(local.document, matchesTarget ? syncMeta.base : null, validateTransaction);
    document.querySelector("#cloud-repository-label").textContent = `${EXPENSE_REPOSITORY.owner}/${EXPENSE_REPOSITORY.repository} · ${EXPENSE_REPOSITORY.branch}`;
    document.querySelector("#cloud-last-sync").textContent = formatSyncTimestamp(matchesTarget ? syncMeta.lastSyncedAt : null);
    document.querySelector("#cloud-pending-count").textContent = `${formatNumber(pending)} giao dịch (so với lần xác minh trước)`;
    session.publish({ pending, queue: pending ? "pending" : "completed" });
    return { local, pending };
  };

  const setCloudConnected = (connected, username = "") => {
    session.publish({ auth: connected ? "connected" : "disconnected" });
    cloudForm.hidden = connected;
    cloudControls.hidden = !connected;
    if (connected) {
      document.querySelector("#cloud-connected-as").textContent = `Đã kết nối tài khoản ${username}. Token chỉ còn trong bộ nhớ tab này.`;
    }
  };

  const clearCloudPrompts = () => {
    cloudMigration.hidden = true;
    cloudConflicts.hidden = true;
    cloudConflictList.replaceChildren();
    currentConflicts = [];
    conflictResolutions = {};
    pendingSyncBase = null;
    document.querySelector("#cloud-resolve").disabled = true;
  };

  const formatConflictState = state => {
    if (!state) return "Không có giao dịch (đã xóa)";
    if (state.kind === "deleted") return `Đã xóa · ${formatSyncTimestamp(state.value.deletedAt)}`;
    return `${state.value.itemName} · ${state.value.merchant} · ${formatVnd(state.value.amount)} · sửa ${formatSyncTimestamp(state.value.updatedAt)}`;
  };

  const renderCloudConflicts = conflicts => {
    currentConflicts = conflicts;
    conflictResolutions = {};
    cloudConflictList.replaceChildren();
    for (const [index, conflict] of conflicts.entries()) {
      const group = makeElement("fieldset", "cloud-conflict");
      const legend = makeElement("legend", "", `Giao dịch ${index + 1}: ${conflict.id}`);
      const choices = makeElement("div", "cloud-conflict-choices");
      for (const [choice, label, state] of [["local", "Giữ bản trên thiết bị", conflict.local], ["remote", "Giữ bản trên GitHub", conflict.remote]]) {
        const button = makeElement("button", "button button--secondary cloud-conflict-choice", label);
        button.type = "button";
        button.dataset.conflictId = conflict.id;
        button.dataset.choice = choice;
        button.setAttribute("aria-pressed", "false");
        const description = makeElement("span", "cloud-conflict-choice__description", formatConflictState(state));
        button.append(description);
        choices.append(button);
      }
      group.append(legend, choices);
      cloudConflictList.append(group);
    }
    cloudConflicts.hidden = false;
    cloudMigration.hidden = true;
    updateCloudStatus("failed", `Xung đột · ${conflicts.length} giao dịch cần chọn`);
    document.querySelector("#cloud-resolve").disabled = true;
  };

  const showMigrationPreview = (localDocument, remoteDocument) => {
    const preview = getExpenseMigrationPreview(localDocument, remoteDocument, validateTransaction);
    document.querySelector("#cloud-migration-summary").textContent = `Trên thiết bị: ${formatNumber(preview.localCount)} giao dịch · GitHub: ${formatNumber(preview.cloudCount)} giao dịch · Trùng: ${formatNumber(preview.duplicates)} · Chỉ có ở thiết bị: ${formatNumber(preview.localOnly)} · Chỉ có trên GitHub: ${formatNumber(preview.cloudOnly)} · Cùng ID khác nội dung: ${formatNumber(preview.conflicts)}. Dữ liệu sẽ được gộp theo ID; xung đột cần bạn chọn.`;
    cloudMigration.hidden = false;
    cloudConflicts.hidden = true;
    pendingSyncBase = null;
    session.publish({ cloud: "idle" });
    cloudMessage.textContent = "Chờ xác nhận gộp dữ liệu; chưa xác minh đồng bộ.";
  };

  const runCloudSync = async (baseOverride, resolutions = {}) => {
    if (!pageActive || !githubSync.connected) return;
    if (syncInProgress) { syncAgainRequested = true; return; }
    syncInProgress = true;
    clearTimeout(syncTimer);
    cloudMessage.textContent = "";
    updateCloudStatus("syncing", "Đang đồng bộ");
    try {
      const result = await session.sync({ base: baseOverride, resolutions, repositoryMatches: sameCloudRepository });
      if (result.status === "conflict") {
        pendingSyncBase = baseOverride ?? syncMeta.base ?? null;
        renderCloudConflicts(result.conflicts);
        return;
      }
      if (result.error) {
        cloudMessage.textContent = describeExpenseError(result.error, result.operation);
        if (result.receipt?.verified) cloudMessage.textContent += " GitHub đã xác nhận dữ liệu; bước cục bộ hoặc giao diện chưa hoàn tất. Hãy thử lại.";
        if (!githubSync.connected) {
          setCloudConnected(false);
          if (result.error.code === "unauthorized") session.publish({ auth: "authentication_error" });
        }
        return;
      }
      const { pending } = await updateCloudMeta();
      clearCloudPrompts();
      cloudMessage.textContent = pending ? "Dữ liệu thay đổi trong khi đồng bộ; các thay đổi mới đang chờ." : result.wrote
        ? "Đã xác minh dữ liệu đồng bộ thành công."
        : "Dữ liệu cục bộ và GitHub đã khớp.";
      if (pending) syncAgainRequested = true;
    } catch (error) {
      // Only post-sync metadata/display work is handled here; preserve receipt.
      if (error instanceof LocalExpenseError) session.publish({ local: "error" });
      cloudMessage.textContent = describeExpenseError(error, "refresh_sync_metadata");
    } finally {
      syncInProgress = false;
      if (syncAgainRequested && githubSync.connected && cloudConflicts.hidden) {
        syncAgainRequested = false;
        scheduleCloudSync();
      }
    }
  };

  function scheduleCloudSync() {
    if (!pageActive) return;
    updateCloudMeta().catch(error => {
      session.publish({ local: "error", queue: "failed" });
      cloudMessage.textContent = describeExpenseError(error, "read_local_metadata");
    });
    if (!githubSync.connected) return;
    if (!cloudConflicts.hidden) {
      updateCloudStatus("failed", `Xung đột · ${currentConflicts.length} giao dịch cần chọn`);
      return;
    }
    if (syncInProgress) { syncAgainRequested = true; return; }
    if (navigator.onLine === false) {
      session.publish({ cloud: "idle", queue: "pending" });
      return;
    }
    session.publish({ cloud: "idle" });
    clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => runCloudSync(undefined), 850);
  }

  const persistAndRender = async () => {
    transactions = normalizeTransactions(await dbRequest(database, "readonly", store => store.getAll()));
    refreshMonthFilter(transactions);
    renderTransactions(transactions, spriteUrl);
    renderDashboard(transactions, dashboardMode, document.querySelector("#dashboard-month").value);
  };

  const resetForm = () => {
    editingId = "";
    form.reset();
    setFoodIconChoice(resolveFoodIcon(""));
    setFieldReview({});
    saveButton.textContent = "Lưu giao dịch";
    cancelButton.hidden = true;
    parseStatus.textContent = "";
    parseStatus.removeAttribute("data-tone");
  };

  const session = new ExpenseSyncSession({
    github: githubSync,
    capture: () => captureLocalExpenseState(database),
    checkpoint: attempt => checkpointExpenseSync(database, attempt),
    apply: (snapshot, result, repository) => applySyncedDocument(database, snapshot, result, repository),
    render: persistAndRender,
    online: () => navigator.onLine !== false,
    onState: state => {
      if (!pageActive) return;
      const labels = { idle: "Chưa đồng bộ", syncing: "Đang đồng bộ", success: "Đã xác minh đồng bộ", no_changes: "Dữ liệu hai phía đã khớp", failed: "Đồng bộ thất bại", unverified: "Chưa xác minh kết quả" };
      updateCloudStatus(state.cloud, labels[state.cloud]);
      document.querySelector("#github-auth-status").textContent = { connected: "Đã kết nối", disconnected: "Chưa kết nối", authentication_error: "Lỗi xác thực" }[state.auth];
      document.querySelector("#local-storage-status").textContent = { ready: "Sẵn sàng", loading: "Đang đọc", error: "Lỗi", unavailable: "Không khả dụng" }[state.local];
      document.querySelector("#queue-processing-status").textContent = { pending: "Đang chờ", processing: "Đang xử lý", completed: "Đã xử lý", failed: "Chưa hoàn tất" }[state.queue];
    },
  });
  session.publish({ local: "ready" });
  await updateCloudMeta();

  cloudForm.addEventListener("submit", async event => {
    event.preventDefault();
    const tokenInput = document.querySelector("#cloud-token");
    const token = tokenInput.value.trim();
    tokenInput.value = "";
    const connectButton = document.querySelector("#cloud-connect");
    connectButton.disabled = true;
    cloudMessage.textContent = "";
    clearCloudPrompts();
    document.querySelector("#github-auth-status").textContent = "Đang xác thực GitHub";
    try {
      const connection = await githubSync.connect(token);
      setCloudConnected(true, connection.username);
      const writeNote = connection.repositoryPushAccess
        ? "API xác nhận tài khoản có quyền push; quyền Contents: write của PAT sẽ được GitHub xác nhận khi đồng bộ thật."
        : "Chưa thể xác minh quyền Contents: write của PAT trước khi ghi; GitHub sẽ xác nhận quyền này khi đồng bộ thật.";
      cloudMessage.textContent = `Token hợp lệ; đã truy cập blogco/blogmoi@main và kiểm tra tệp dữ liệu. ${writeNote} Dữ liệu đồng bộ là công khai.`;
      const [snapshot, remote] = await Promise.all([captureLocalExpenseState(database), githubSync.readDocument()]);
      const sameRepository = sameCloudRepository(snapshot.meta.repository);
      if (sameRepository && snapshot.meta.base) {
        await runCloudSync(snapshot.meta.base);
      } else {
        showMigrationPreview(snapshot.document, remote.document);
      }
      await updateCloudMeta();
    } catch (error) {
      if (error.diagnostics?.phase === "authentication" || !githubSync.connected) {
        githubSync.disconnect();
        setCloudConnected(false);
        session.publish({ auth: "authentication_error" });
      }
      if (error instanceof LocalExpenseError) session.publish({ local: "error", queue: "failed" });
      else if (githubSync.connected) session.publish({ cloud: "failed" });
      cloudMessage.textContent = describeExpenseError(error, "connect_or_preview");
    } finally {
      connectButton.disabled = false;
    }
  });

  document.querySelector("#cloud-migrate").addEventListener("click", () => {
    cloudMigration.hidden = true;
    pendingSyncBase = null;
    runCloudSync(null);
  });

  document.querySelector("#cloud-sync-now").addEventListener("click", async () => {
    clearCloudPrompts();
    if (syncInProgress || syncClickInProgress) return;
    syncClickInProgress = true;
    try {
      const metadata = await readSyncMeta(database);
      if (sameCloudRepository(metadata.repository) && metadata.base) await runCloudSync(metadata.base);
      else {
        try {
          const [snapshot, remote] = await Promise.all([captureLocalExpenseState(database), githubSync.readDocument()]);
          showMigrationPreview(snapshot.document, remote.document);
        } catch (error) {
          const requestFailed = error.code === "network" || error.code === "timeout";
          const statusMessage = error.code === "fetch_invocation"
            ? "Lỗi gọi fetch trong trình duyệt"
            : requestFailed ? "GitHub API không phản hồi" : "Không thể đọc repository/tệp";
          updateCloudStatus(requestFailed && navigator.onLine === false ? "offline" : "error", statusMessage);
          cloudMessage.textContent = describeExpenseError(error, "read_cloud_preview");
        }
      }
    } catch (error) { cloudMessage.textContent = describeExpenseError(error, "read_local_metadata"); }
    finally { syncClickInProgress = false; }
  });

  document.querySelector("#cloud-disconnect").addEventListener("click", () => {
    clearTimeout(syncTimer);
    githubSync.disconnect();
    document.querySelector("#cloud-token").value = "";
    setCloudConnected(false);
    clearCloudPrompts();
    session.publish({ cloud: "idle" });
    cloudMessage.textContent = "Đã ngắt kết nối. Dữ liệu và trạng thái đồng bộ cục bộ vẫn được giữ.";
  });

  cloudConflictList.addEventListener("click", event => {
    const button = event.target.closest("[data-conflict-id][data-choice]");
    if (!button) return;
    const conflict = currentConflicts.find(item => item.id === button.dataset.conflictId);
    if (!conflict) return;
    conflictResolutions[conflict.id] = {
      choice: button.dataset.choice,
      localFingerprint: conflict.localFingerprint,
      remoteFingerprint: conflict.remoteFingerprint,
    };
    for (const option of cloudConflictList.querySelectorAll(`[data-conflict-id="${CSS.escape(conflict.id)}"]`)) {
      option.setAttribute("aria-pressed", String(option === button));
    }
    document.querySelector("#cloud-resolve").disabled = currentConflicts.some(item => !conflictResolutions[item.id]);
  });

  document.querySelector("#cloud-resolve").addEventListener("click", () => {
    const base = pendingSyncBase;
    runCloudSync(base, conflictResolutions);
  });

  window.addEventListener("online", () => {
    if (githubSync.connected) scheduleCloudSync();
  });
  window.addEventListener("offline", () => {
    if (githubSync.connected) session.publish({ cloud: "idle", queue: "pending" });
  });
  window.addEventListener("pagehide", () => {
    pageActive = false;
    clearTimeout(syncTimer);
    githubSync.disconnect();
    document.querySelector("#cloud-token").value = "";
  }, { once: true });

  document.querySelector("#analyze-expense").addEventListener("click", () => {
    const parsed = parseExpenseText(document.querySelector("#expense-natural-input").value);
    setFormValues(parsed, setFoodIconChoice);
    const reviewCount = Object.values(parsed.review).filter(Boolean).length;
    const extras = [parsed.dateNote, reviewCount ? `${reviewCount} trường cần bạn kiểm tra hoặc bổ sung.` : "Hãy kiểm tra các trường trước khi lưu."].filter(Boolean).join(" ");
    parseStatus.textContent = parsed.itemName || parsed.amount || parsed.date ? `Đã phân tích. ${extras} Chưa có dữ liệu nào được lưu.` : "Chưa nhận diện đủ thông tin. Bạn có thể tự điền các trường bên dưới; chưa có dữ liệu nào được lưu.";
    parseStatus.removeAttribute("data-tone");
  });

  form.addEventListener("input", event => {
    const field = event.target.closest("[name]");
    if (!field) return;
    const indicator = document.querySelector(`[data-review="${field.name}"]`);
    if (indicator) indicator.hidden = true;
    if (field.name === "itemName" && !currentIconManuallySet) setFoodIconChoice(resolveFoodIcon(field.value));
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(form).entries());
    try {
      const previous = editingId ? transactions.find(item => item.id === editingId) : null;
      const record = validateTransaction({
        ...fields,
        id: previous?.id,
        createdAt: previous?.createdAt,
        updatedAt: new Date().toISOString(),
      });
      await writeTransactionsAndRestore(database, [record]);
      resetForm();
      document.querySelector("#expense-natural-input").value = "";
      await persistAndRender();
      parseStatus.textContent = previous ? "Đã cập nhật giao dịch trên thiết bị này." : "Đã lưu giao dịch trên thiết bị này.";
      scheduleCloudSync();
      document.querySelector("#expense-dashboard").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      parseStatus.textContent = error.message || "Không thể lưu giao dịch.";
      parseStatus.dataset.tone = "error";
    }
  });

  cancelButton.addEventListener("click", resetForm);

  document.querySelector("#transaction-list").addEventListener("click", async event => {
    const row = event.target.closest(".transaction-row");
    if (!row) return;
    const record = transactions.find(item => item.id === row.dataset.id);
    if (!record) return;
    if (event.target.closest(".edit-transaction")) {
      editingId = record.id;
      setFormValues(record, setFoodIconChoice);
      saveButton.textContent = "Cập nhật giao dịch";
      cancelButton.hidden = false;
      parseStatus.textContent = `Đang chỉnh sửa giao dịch ngày ${dateLabel(record.date)}. Thay đổi chỉ lưu khi bạn bấm cập nhật.`;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
      document.querySelector("#expense-merchant").focus({ preventScroll: true });
    }
    if (event.target.closest(".delete-transaction")) {
      const confirmed = window.confirm(`Xóa giao dịch “${record.itemName}” tại ${record.merchant}? Thao tác này không thể hoàn tác.`);
      if (!confirmed) return;
      try {
        await deleteExpenseWithTombstone(database, record.id);
        if (editingId === record.id) resetForm();
        await persistAndRender();
        scheduleCloudSync();
      } catch (error) {
        showStorageError(error.message || "Không thể xóa giao dịch.");
      }
    }
  });

  for (const selector of ["#transaction-search", "#transaction-month", "#transaction-category", "#transaction-sort"]) {
    document.querySelector(selector).addEventListener(selector.includes("search") ? "input" : "change", () => renderTransactions(transactions, spriteUrl));
  }
  for (const button of document.querySelectorAll("[data-dashboard-period]")) {
    button.addEventListener("click", () => {
      const mode = button.dataset.dashboardPeriod;
      const monthInput = document.querySelector("#dashboard-month");
      const selection = resolveDashboardSelection(mode, monthInput.value);
      if (selection.period !== "all") monthInput.value = selection.period;
      setDashboardMode(mode);
      renderDashboard(transactions, dashboardMode, document.querySelector("#dashboard-month").value);
    });
  }
  document.querySelector("#dashboard-month").addEventListener("change", () => {
    setDashboardMode("custom");
    renderDashboard(transactions, dashboardMode, document.querySelector("#dashboard-month").value);
  });
  for (const button of document.querySelectorAll("[data-bubble-mode]")) {
    button.addEventListener("click", () => {
      for (const option of document.querySelectorAll("[data-bubble-mode]")) {
        const active = option === button;
        option.setAttribute("aria-pressed", String(active));
        option.classList.toggle("is-active", active);
      }
      const selection = resolveDashboardSelection(dashboardMode, document.querySelector("#dashboard-month").value);
      renderFoodPlayground(transactions, selection.period);
    });
  }
  document.querySelector("#print-report").addEventListener("click", () => {
    const previousTitle = document.title;
    const selection = resolveDashboardSelection(dashboardMode, document.querySelector("#dashboard-month").value);
    const filePeriod = selection.period === "all" ? "all-time" : selection.period;
    document.title = "blogmoi-chi-phi-" + filePeriod;
    window.addEventListener("afterprint", () => { document.title = previousTitle; }, { once: true });
    window.print();
  });

  document.querySelector("#export-json").addEventListener("click", () => {
    const selection = resolveDashboardSelection(dashboardMode, document.querySelector("#dashboard-month").value);
    const report = buildPeriodExport(transactions, selection);
    const payload = { version: 1, exportedAt: new Date().toISOString(), ...report };
    const filePeriod = selection.period === "all" ? "all-time" : selection.period;
    downloadFile("blogmoi-expenses-" + filePeriod + ".json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  });
  document.querySelector("#export-csv").addEventListener("click", () => {
    const selection = resolveDashboardSelection(dashboardMode, document.querySelector("#dashboard-month").value);
    const report = buildPeriodExport(transactions, selection);
    const filePeriod = selection.period === "all" ? "all-time" : selection.period;
    downloadFile("blogmoi-expenses-" + filePeriod + ".csv", serializeCsv(report.transactions, report), "text/csv;charset=utf-8");
  });
  document.querySelector("#backup-file").addEventListener("change", async event => {
    const [file] = event.target.files || [];
    if (!file) return;
    try {
      const source = await file.text();
      let rows;
      if (/\.csv$/iu.test(file.name) || file.type.includes("csv")) rows = parseCsv(source);
      else {
        const backup = JSON.parse(source);
        rows = Array.isArray(backup) ? backup : backup.transactions;
      }
      if (!Array.isArray(rows)) throw new Error("Tệp không có danh sách giao dịch hợp lệ.");
      const prepared = prepareImportRows(rows, transactions);
      await writeTransactionsAndRestore(database, prepared.imported);
      await persistAndRender();
      parseStatus.textContent = `Đã nhập ${prepared.imported.length} giao dịch; bỏ qua ${prepared.skipped.duplicate} mục trùng và ${prepared.skipped.invalid} mục không hợp lệ.`;
      parseStatus.removeAttribute("data-tone");
      scheduleCloudSync();
    } catch (error) {
      showStorageError(`Không thể nhập bản sao lưu: ${error.message || "Tệp không hợp lệ."}`);
    } finally {
      event.target.value = "";
    }
  });

  const now = new Date();
  const currentMonth = now.getFullYear() + "-" + String(now.getMonth() + 1).padStart(2, "0");
  document.querySelector("#dashboard-month").value = currentMonth;
  setDashboardMode("all");
  refreshMonthFilter(transactions);
  renderTransactions(transactions, spriteUrl);
  renderDashboard(transactions, dashboardMode, currentMonth);
  app.dataset.state = "ready";
}

if (typeof document !== "undefined") {
  startExpenseTracker().catch(error => {
    const app = document.querySelector("#expense-app");
    if (app) app.dataset.state = "error";
    const storageError = document.querySelector("#storage-error");
    if (storageError) {
      storageError.textContent = describeExpenseError(error, "initialize_dashboard");
      if (error instanceof LocalExpenseError) document.querySelector("#local-storage-status").textContent = error.code === "storage_unavailable" ? "Không khả dụng" : "Lỗi";
      storageError.hidden = false;
    }
  });
}
