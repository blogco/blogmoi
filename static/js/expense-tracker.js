import {
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

export function validateTransaction(input, { now = new Date(), makeId = createId } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Dữ liệu giao dịch không hợp lệ.");
  const merchant = typeof input.merchant === "string" ? input.merchant.trim() : "";
  const itemName = typeof input.itemName === "string" ? input.itemName.trim() : "";
  const amount = Number(input.amount);
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

export function aggregateMonth(transactions, month) {
  const selected = transactions.filter(transaction => monthKey(transaction.date) === month);
  const total = selected.reduce((sum, transaction) => sum + transaction.amount, 0);
  const activeDays = new Set(selected.map(transaction => transaction.date)).size;
  const daily = new Map();
  const categories = new Map(CATEGORIES.map(category => [category, 0]));
  const merchants = new Map();
  for (const transaction of selected) {
    const day = Number(transaction.date.slice(8, 10));
    const currentDay = daily.get(day) || { total: 0, count: 0 };
    currentDay.total += transaction.amount;
    currentDay.count += 1;
    daily.set(day, currentDay);
    categories.set(transaction.category, (categories.get(transaction.category) || 0) + transaction.amount);
    const merchantKey = transaction.merchant.trim().toLocaleLowerCase("vi-VN");
    const currentMerchant = merchants.get(merchantKey) || { merchant: transaction.merchant, total: 0, count: 0 };
    currentMerchant.total += transaction.amount;
    currentMerchant.count += 1;
    merchants.set(merchantKey, currentMerchant);
  }
  return {
    month,
    transactions: selected,
    total,
    count: selected.length,
    activeDays,
    averagePerActiveDay: activeDays ? Math.round(total / activeDays) : 0,
    daily,
    categories,
    merchants: [...merchants.values()].sort((a, b) => b.total - a.total || a.merchant.localeCompare(b.merchant, "vi")),
  };
}

function shiftMonth(month, amount) {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(year, monthNumber - 1 + amount, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
}

export function getMonthlyComparison(transactions, selectedMonth, now = new Date()) {
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (selectedMonth > currentMonth) return null;
  const previousMonth = shiftMonth(selectedMonth, -1);
  const isCurrentMonth = selectedMonth === currentMonth;
  const throughDay = isCurrentMonth ? now.getDate() : getDaysInMonth(selectedMonth);
  const currentPeriod = transactions.filter(transaction => monthKey(transaction.date) === selectedMonth && Number(transaction.date.slice(8, 10)) <= throughDay);
  const previousPeriod = transactions.filter(transaction => monthKey(transaction.date) === previousMonth && Number(transaction.date.slice(8, 10)) <= throughDay);
  const previousTotal = previousPeriod.reduce((total, transaction) => total + transaction.amount, 0);
  if (!previousPeriod.length || previousTotal <= 0) return null;
  const currentTotal = currentPeriod.reduce((total, transaction) => total + transaction.amount, 0);
  const difference = currentTotal - previousTotal;
  return {
    previousMonth,
    currentTotal,
    previousTotal,
    difference,
    percentage: (difference / previousTotal) * 100,
    throughDay,
    comparableDays: isCurrentMonth ? throughDay : getDaysInMonth(selectedMonth),
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

export function serializeCsv(transactions) {
  const fields = ["id", "merchant", "itemName", "amount", "date", "taste", "category", "notes", "iconId", "iconManuallySet", "createdAt", "updatedAt"];
  return `\uFEFF${fields.join(",")}\r\n${transactions.map(transaction => fields.map(field => csvEscape(transaction[field])).join(",")).join("\r\n")}`;
}

function transactionFingerprint(transaction) {
  return [transaction.merchant, transaction.itemName, transaction.amount, transaction.date, transaction.taste, transaction.category]
    .map(value => String(value).trim().toLocaleLowerCase("vi-VN")).join("\u001f");
}

export function prepareImportRows(data, existing, options = {}) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.transactions) ? data.transactions : [];
  const imported = [];
  const skipped = { duplicate: 0, invalid: 0 };
  const ids = new Set(existing.map(item => item.id));
  const fingerprints = new Set(existing.map(transactionFingerprint));
  for (const row of rows) {
    try {
      const valid = validateTransaction(row, options);
      const fingerprint = transactionFingerprint(valid);
      if (ids.has(valid.id) || fingerprints.has(fingerprint)) {
        skipped.duplicate += 1;
        continue;
      }
      ids.add(valid.id);
      fingerprints.add(fingerprint);
      imported.push(valid);
    } catch {
      skipped.invalid += 1;
    }
  }
  return { imported, skipped, total: rows.length };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in globalThis)) { reject(new Error("IndexedDB không khả dụng trong trình duyệt này.")); return; }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
      if (!database.objectStoreNames.contains(SYNC_STORE_NAME)) database.createObjectStore(SYNC_STORE_NAME, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Không thể mở kho dữ liệu trên thiết bị."));
    request.onblocked = () => reject(new Error("Kho dữ liệu đang được dùng ở tab khác. Hãy tải lại tab rồi thử lại."));
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
  });
}

function defaultSyncMeta() {
  return { key: "state", repository: null, base: null, lastSyncedAt: null, remoteSha: null, tombstones: [] };
}

async function readSyncMeta(database) {
  return (await dbRequest(database, "readonly", store => store.get("state"), SYNC_STORE_NAME)) || defaultSyncMeta();
}

function localExpenseDocument(records, tombstones = []) {
  const activeIds = new Set(records.map(record => record.id));
  return {
    schemaVersion: CLOUD_SCHEMA_VERSION,
    transactions: records.map(record => validateTransaction(record)),
    tombstones: tombstones.filter(item => item && !activeIds.has(item.id)),
  };
}

async function captureLocalExpenseState(database) {
  const [records, meta] = await Promise.all([
    dbRequest(database, "readonly", store => store.getAll()),
    readSyncMeta(database),
  ]);
  return { document: localExpenseDocument(records, meta.tombstones), meta };
}

function writeTransactionsAndRestore(database, records) {
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
  });
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
  });
}

function applySyncedDocument(database, snapshot, result, repository) {
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
      transactionStore.clear();
      for (const record of finalRecords) transactionStore.put(record);
      const nextMeta = {
        ...currentMeta,
        key: "state",
        repository,
        base: result.document,
        lastSyncedAt: new Date().toISOString(),
        remoteSha: result.sha || null,
        tombstones: finalTombstones,
      };
      metaStore.put(nextMeta);
    };
    recordsRequest.onsuccess = () => { records = recordsRequest.result; applyIfReady(); };
    metaRequest.onsuccess = () => { currentMeta = metaRequest.result || defaultSyncMeta(); applyIfReady(); };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Không thể áp dụng dữ liệu đồng bộ."));
    transaction.onabort = () => reject(transaction.error || new Error("Không thể áp dụng dữ liệu đồng bộ."));
  });
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

function getInsightRecords(transactions, summary, comparison) {
  if (!summary.count) return [];
  const insights = [];
  if (comparison) {
    const direction = comparison.difference > 0 ? "tăng" : comparison.difference < 0 ? "giảm" : "không đổi";
    const percentage = Math.abs(comparison.percentage).toFixed(1).replace(".", ",");
    const changeAmount = formatVnd(Math.abs(comparison.difference));
    const period = summary.month === `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
      ? `qua ${comparison.throughDay} ngày đầu kỳ`
      : "so với trọn tháng trước";
    insights.push({ type: "Xu hướng chi tiêu", text: comparison.difference === 0
      ? `Tổng chi tiêu ${period} giữ nguyên ở ${formatVnd(comparison.currentTotal)}.`
      : `Chi tiêu ${period} ${direction} ${changeAmount} (${percentage}%), từ ${formatVnd(comparison.previousTotal)} lên ${formatVnd(comparison.currentTotal)}.` });
  } else {
    insights.push({ type: "Xu hướng chi tiêu", text: `Bạn đã ghi nhận ${formatVnd(summary.total)} qua ${summary.count} giao dịch trong tháng này. Chưa có dữ liệu tháng trước phù hợp để so sánh.` });
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
  if (coffeeCount) insights.push({ type: "Tần suất cà phê", text: `Bạn ghi nhận ${coffeeCount} giao dịch có tên món cà phê trong tháng. Nếu đây là nhóm chi thường xuyên, hãy cân nhắc đặt ngân sách riêng cho nhóm này.` });

  const fried = summary.transactions.filter(transaction => /chiên|rán|fried/iu.test(`${transaction.itemName} ${transaction.notes}`));
  if (fried.length) {
    insights.push({ type: "Món chiên / rán được ghi nhận", text: `Bạn đã ghi nhận ${fried.length} giao dịch có món được mô tả là chiên / rán. Nếu phù hợp, có thể luân phiên với món luộc hoặc hấp; ghi chép này không cho biết lượng dầu hay chất béo.` });
  }
  const dominantCategory = CATEGORIES.map(category => ({ category, total: summary.categories.get(category) || 0 })).sort((a, b) => b.total - a.total)[0];
  if (dominantCategory?.total) {
    const share = (dominantCategory.total / summary.total * 100).toFixed(1).replace(".", ",");
    insights.push({ type: "Cơ cấu tháng", text: `${dominantCategory.category} là nhóm chi lớn nhất với ${formatVnd(dominantCategory.total)}, tương đương ${share}% tổng chi tiêu.` });
  }
  if (insights.length < 3) {
    insights.push({ type: "Theo dõi ngân sách", text: `Mức chi trung bình của bạn là ${formatVnd(summary.averagePerActiveDay)} mỗi ngày có giao dịch. Bạn có thể dùng mức này làm mốc tham khảo cho tháng sau.` });
  }
  return insights.slice(0, 6);
}

function renderInsights(transactions, summary, comparison) {
  const container = document.querySelector("#insight-list");
  container.replaceChildren();
  const records = getInsightRecords(transactions, summary, comparison);
  if (!records.length) {
    container.append(makeElement("p", "insight-empty", "Chưa có giao dịch thực tế trong tháng này. Các nhận xét sẽ xuất hiện sau khi bạn lưu dữ liệu."));
    return;
  }
  for (const record of records) {
    const card = makeElement("article", "insight-card");
    card.append(makeElement("p", "insight-card__type", record.type));
    card.append(makeElement("p", "", record.text));
    container.append(card);
  }
}

function renderKpis(summary, comparison, selectedMonth, now) {
  document.querySelector("#kpi-total").textContent = formatVnd(summary.total);
  document.querySelector("#kpi-count").textContent = formatNumber(summary.count);
  document.querySelector("#kpi-average").textContent = formatVnd(summary.averagePerActiveDay);
  document.querySelector("#kpi-period").textContent = monthLabel(selectedMonth);
  document.querySelector("#kpi-active-days").textContent = `${summary.activeDays} ngày có giao dịch`;
  const comparisonValue = document.querySelector("#kpi-comparison");
  const caption = document.querySelector("#kpi-comparison-caption");
  comparisonValue.removeAttribute("data-trend");
  if (!comparison) {
    comparisonValue.textContent = "—";
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    caption.textContent = selectedMonth > currentMonth ? "Tháng tương lai chưa có dữ liệu" : "Chưa có dữ liệu tháng trước hợp lệ";
    return;
  }
  const sign = comparison.difference > 0 ? "+" : comparison.difference < 0 ? "−" : "";
  const trend = comparison.difference > 0 ? "up" : comparison.difference < 0 ? "down" : "flat";
  comparisonValue.textContent = `${sign}${formatVnd(Math.abs(comparison.difference))}`;
  comparisonValue.dataset.trend = trend;
  const percentageSign = comparison.percentage > 0 ? "+" : comparison.percentage < 0 ? "−" : "";
  caption.textContent = `${percentageSign}${Math.abs(comparison.percentage).toFixed(1).replace(".", ",")}% · ${selectedMonth === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}` ? `cùng ${comparison.throughDay} ngày đầu kỳ` : "trọn tháng"}`;
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
  document.querySelector("#transaction-status").textContent = filtered.length === transactions.length
    ? `${formatNumber(filtered.length)} giao dịch`
    : `Hiển thị ${formatNumber(filtered.length)} trong ${formatNumber(transactions.length)} giao dịch`;
}

function refreshMonthFilter(transactions) {
  const select = document.querySelector("#transaction-month");
  const previous = select.value || "all";
  const months = [...new Set(transactions.map(transaction => monthKey(transaction.date)))].sort((a, b) => b.localeCompare(a));
  select.replaceChildren(new Option("Tất cả tháng", "all"));
  for (const month of months) select.append(new Option(monthLabel(month), month));
  select.value = months.includes(previous) ? previous : "all";
}

function renderDashboard(transactions) {
  const month = document.querySelector("#dashboard-month").value;
  if (!month) return;
  const now = new Date();
  const summary = aggregateMonth(transactions, month);
  const comparison = getMonthlyComparison(transactions, month, now);
  renderKpis(summary, comparison, month, now);
  document.querySelector("#spending-summary").textContent = `${monthLabel(month)} · ${formatNumber(summary.count)} giao dịch`;
  drawDailyChart(summary, month);
  drawCategoryChart(summary);
  drawMerchantBars(summary);
  renderInsights(transactions, summary, comparison);
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

async function startExpenseTracker() {
  const app = document.querySelector("#expense-app");
  if (!app) return;
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
  const database = await openDatabase();
  let transactions = (await dbRequest(database, "readonly", store => store.getAll())).map(record => validateTransaction(record));
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
  let syncAgainRequested = false;
  let pendingSyncBase = null;
  let currentConflicts = [];
  let conflictResolutions = {};

  const updateCloudStatus = (state, message) => {
    cloudStatus.dataset.state = state;
    cloudStatus.textContent = message;
  };

  const formatSyncTimestamp = value => {
    if (!value || !Number.isFinite(Date.parse(value))) return "Chưa có";
    return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  };

  const updateCloudMeta = async () => {
    syncMeta = await readSyncMeta(database);
    const local = await captureLocalExpenseState(database);
    const pending = countUnsyncedExpenseChanges(local.document, syncMeta.base, validateTransaction);
    document.querySelector("#cloud-repository-label").textContent = syncMeta.repository
      ? `${syncMeta.repository.owner}/${syncMeta.repository.repository}`
      : "Chưa chọn";
    document.querySelector("#cloud-last-sync").textContent = formatSyncTimestamp(syncMeta.lastSyncedAt);
    document.querySelector("#cloud-pending-count").textContent = `${formatNumber(pending)} giao dịch`;
    return { local, pending };
  };

  const setCloudConnected = (connected, username = "") => {
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
    updateCloudStatus("conflict", `Xung đột · ${conflicts.length} giao dịch cần lựa chọn`);
    document.querySelector("#cloud-resolve").disabled = true;
  };

  const showMigrationPreview = (localDocument, remoteDocument) => {
    const preview = getExpenseMigrationPreview(localDocument, remoteDocument, validateTransaction);
    document.querySelector("#cloud-migration-summary").textContent = `Trên thiết bị: ${formatNumber(preview.localCount)} giao dịch · GitHub: ${formatNumber(preview.cloudCount)} giao dịch · Trùng: ${formatNumber(preview.duplicates)} · Chỉ có ở thiết bị: ${formatNumber(preview.localOnly)} · Chỉ có trên GitHub: ${formatNumber(preview.cloudOnly)} · Cùng ID khác nội dung: ${formatNumber(preview.conflicts)}. Dữ liệu sẽ được gộp theo ID; xung đột cần bạn chọn.`;
    cloudMigration.hidden = false;
    cloudConflicts.hidden = true;
    pendingSyncBase = null;
    updateCloudStatus("waiting", "Đã kết nối · chờ xác nhận gộp dữ liệu");
  };

  const runCloudSync = async (baseOverride, resolutions = {}) => {
    if (!githubSync.connected) return;
    if (navigator.onLine === false) {
      updateCloudStatus("waiting", "Chờ mạng");
      cloudMessage.textContent = "Không có kết nối mạng. Dữ liệu cục bộ vẫn được giữ.";
      return;
    }
    if (syncInProgress) { syncAgainRequested = true; return; }
    syncInProgress = true;
    clearTimeout(syncTimer);
    cloudMessage.textContent = "";
    updateCloudStatus("syncing", "Đang đồng bộ");
    try {
      const snapshot = await captureLocalExpenseState(database);
      const base = baseOverride === undefined ? snapshot.meta.base : baseOverride;
      const result = await githubSync.sync({ local: snapshot.document, base, resolutions });
      if (result.status === "conflict") {
        pendingSyncBase = base ?? null;
        renderCloudConflicts(result.conflicts);
        return;
      }
      await applySyncedDocument(database, snapshot.document, result, githubSync.repository);
      await persistAndRender();
      const { pending } = await updateCloudMeta();
      clearCloudPrompts();
      updateCloudStatus(pending ? "waiting" : "synced", pending ? `Đã đồng bộ bản chụp · ${formatNumber(pending)} thay đổi đang chờ` : "Đã đồng bộ");
      cloudMessage.textContent = result.wrote ? "GitHub đã xác nhận lưu dữ liệu." : "Dữ liệu đã khớp với GitHub; không tạo commit mới.";
      if (pending) syncAgainRequested = true;
    } catch (error) {
      if (error.code === "network" || navigator.onLine === false) updateCloudStatus("waiting", "Chờ mạng");
      else updateCloudStatus("error", "Lỗi đồng bộ");
      cloudMessage.textContent = error.message || "Không thể đồng bộ. Dữ liệu cục bộ vẫn được giữ.";
      if (!githubSync.connected) setCloudConnected(false);
    } finally {
      syncInProgress = false;
      if (syncAgainRequested && githubSync.connected && cloudConflicts.hidden) {
        syncAgainRequested = false;
        scheduleCloudSync();
      }
    }
  };

  function scheduleCloudSync() {
    if (!githubSync.connected) return;
    updateCloudMeta().catch(() => {});
    if (!cloudConflicts.hidden) {
      updateCloudStatus("conflict", `Xung đột · ${currentConflicts.length} giao dịch cần lựa chọn`);
      return;
    }
    if (syncInProgress) { syncAgainRequested = true; return; }
    if (navigator.onLine === false) {
      updateCloudStatus("waiting", "Chờ mạng");
      return;
    }
    updateCloudStatus("waiting", "Chờ đồng bộ");
    clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => runCloudSync(undefined), 850);
  }

  const persistAndRender = async () => {
    transactions = (await dbRequest(database, "readonly", store => store.getAll())).map(record => validateTransaction(record));
    refreshMonthFilter(transactions);
    renderTransactions(transactions, spriteUrl);
    renderDashboard(transactions);
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

  if (syncMeta.repository) {
    document.querySelector("#cloud-owner").value = syncMeta.repository.owner;
    document.querySelector("#cloud-repository").value = syncMeta.repository.repository;
  }
  await updateCloudMeta();

  cloudForm.addEventListener("submit", async event => {
    event.preventDefault();
    const tokenInput = document.querySelector("#cloud-token");
    const token = tokenInput.value;
    tokenInput.value = "";
    const connectButton = document.querySelector("#cloud-connect");
    connectButton.disabled = true;
    cloudMessage.textContent = "";
    clearCloudPrompts();
    updateCloudStatus("syncing", "Đang xác thực GitHub");
    try {
      const connection = await githubSync.connect(token, document.querySelector("#cloud-owner").value, document.querySelector("#cloud-repository").value);
      setCloudConnected(true, connection.username);
      cloudMessage.textContent = "Đã xác thực token và xác nhận repository đang ở chế độ private.";
      const [snapshot, remote] = await Promise.all([captureLocalExpenseState(database), githubSync.readDocument()]);
      const sameRepository = snapshot.meta.repository
        && snapshot.meta.repository.owner.toLocaleLowerCase("en-US") === connection.repository.owner.toLocaleLowerCase("en-US")
        && snapshot.meta.repository.repository.toLocaleLowerCase("en-US") === connection.repository.repository.toLocaleLowerCase("en-US")
        && snapshot.meta.repository.path === connection.repository.path;
      if (sameRepository && snapshot.meta.base) {
        await runCloudSync(snapshot.meta.base);
      } else {
        showMigrationPreview(snapshot.document, remote.document);
      }
      await updateCloudMeta();
    } catch (error) {
      githubSync.disconnect();
      setCloudConnected(false);
      updateCloudStatus(error.code === "network" ? "waiting" : "error", error.code === "network" ? "Chờ mạng" : "Lỗi kết nối");
      cloudMessage.textContent = error.message || "Không thể kết nối GitHub.";
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
    const metadata = await readSyncMeta(database);
    if (metadata.base) runCloudSync(metadata.base);
    else {
      try {
        const [snapshot, remote] = await Promise.all([captureLocalExpenseState(database), githubSync.readDocument()]);
        showMigrationPreview(snapshot.document, remote.document);
      } catch (error) {
        updateCloudStatus(error.code === "network" ? "waiting" : "error", error.code === "network" ? "Chờ mạng" : "Lỗi đồng bộ");
        cloudMessage.textContent = error.message || "Không thể đọc dữ liệu trên GitHub.";
      }
    }
  });

  document.querySelector("#cloud-disconnect").addEventListener("click", () => {
    clearTimeout(syncTimer);
    githubSync.disconnect();
    document.querySelector("#cloud-token").value = "";
    setCloudConnected(false);
    clearCloudPrompts();
    updateCloudStatus("disconnected", "Chưa kết nối");
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
    if (githubSync.connected) updateCloudStatus("waiting", "Chờ mạng");
  });
  window.addEventListener("pagehide", () => {
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
  document.querySelector("#dashboard-month").addEventListener("change", () => renderDashboard(transactions));

  document.querySelector("#export-json").addEventListener("click", () => {
    const payload = { version: 1, exportedAt: new Date().toISOString(), transactions };
    downloadFile(`blogmoi-expenses-${localDateValue(new Date())}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  });
  document.querySelector("#export-csv").addEventListener("click", () => {
    downloadFile(`blogmoi-expenses-${localDateValue(new Date())}.csv`, serializeCsv(transactions), "text/csv;charset=utf-8");
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
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  document.querySelector("#dashboard-month").value = currentMonth;
  refreshMonthFilter(transactions);
  renderTransactions(transactions, spriteUrl);
  renderDashboard(transactions);
  app.dataset.state = "ready";
}

if (typeof document !== "undefined") {
  startExpenseTracker().catch(error => {
    const app = document.querySelector("#expense-app");
    if (app) app.dataset.state = "error";
    const storageError = document.querySelector("#storage-error");
    if (storageError) {
      storageError.textContent = `Không thể mở kho giao dịch cục bộ. ${error.message || "Hãy kiểm tra quyền lưu trữ của trình duyệt."}`;
      storageError.hidden = false;
    }
  });
}
