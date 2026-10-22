import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FOOD_ICONS,
  aggregateFoodGroups,
  aggregateMonth,
  aggregatePeriod,
  buildPeriodExport,
  buildHealthInsights,
  formatVnd,
  getBubbleSize,
  getMonthlyComparison,
  parseCsv,
  parseExpenseText,
  prepareImportRows,
  resolveFoodIcon,
  normalizeTransactions,
  resolveDashboardSelection,
  serializeCsv,
  validateTransaction,
} from "../static/js/expense-tracker.js";

const fixedNow = new Date(2026, 9, 23, 12);

function transaction(overrides = {}) {
  return {
    id: "expense-1",
    merchant: "Highlands",
    itemName: "Matcha Latte",
    amount: 50_000,
    date: "2026-10-23",
    taste: "Không đường",
    category: "Đồ uống",
    notes: "",
    createdAt: "2026-10-23T05:00:00.000Z",
    updatedAt: "2026-10-23T05:00:00.000Z",
    ...overrides,
  };
}

test("parses the example sentence into editable values", () => {
  const result = parseExpenseText("Matcha Latte không đường 50k hôm nay 23 tháng 10 năm 2026 Highlands", fixedNow);
  assert.deepEqual(
    { merchant: result.merchant, itemName: result.itemName, amount: result.amount, date: result.date, taste: result.taste, category: result.category },
    { merchant: "Highlands", itemName: "Matcha Latte", amount: 50_000, date: "2026-10-23", taste: "không đường", category: "Đồ uống" },
  );
  assert.deepEqual(Object.values(result.review), [false, false, false, false, false, false]);
});

test("parses relative dates, money formats, and variable word order", () => {
  assert.equal(parseExpenseText("50 nghìn Phở bò hôm qua tại quán Phở 24", fixedNow).date, "2026-10-22");
  assert.equal(parseExpenseText("bánh mì 50.000 hôm nay tại Tiệm An", fixedNow).amount, 50_000);
  assert.equal(parseExpenseText("Highlands mua Matcha Latte 50k ngày 23/10/2026 không đường", fixedNow).itemName, "Matcha Latte");
  assert.equal(parseExpenseText("Highlands mua Matcha Latte 50k ngày 23/10/2026 không đường", fixedNow).date, "2026-10-23");
});

test("leaves missing details empty and marks uncertain fields for review", () => {
  const result = parseExpenseText("Matcha Latte", fixedNow);
  assert.equal(result.merchant, "");
  assert.equal(result.amount, "");
  assert.equal(result.date, "");
  assert.equal(result.category, "Đồ uống");
  assert.equal(result.review.merchant, true);
  assert.equal(result.review.amount, true);
  assert.equal(result.review.date, true);
  const partialDate = parseExpenseText("bánh mì 50.000 ngày 23/10", fixedNow);
  assert.equal(partialDate.date, "");
  assert.equal(partialDate.review.date, true);
  assert.equal(partialDate.itemName, "bánh mì");
});

test("requires valid and complete fields before a transaction can be stored", () => {
  assert.throws(() => validateTransaction({ itemName: "Matcha Latte", amount: 50_000, date: "2026-10-23", category: "Đồ uống" }), /Tên quán/);
  assert.throws(() => validateTransaction(transaction({ date: "2026-02-30" })), /Ngày giao dịch/);
  assert.throws(() => validateTransaction(transaction({ amount: 50.5 })), /số nguyên/);
  const valid = validateTransaction(transaction(), { now: fixedNow, makeId: () => "generated" });
  assert.equal(valid.amount, 50_000);
  assert.equal(valid.category, "Đồ uống");
  assert.equal(valid.iconId, "matcha");
  assert.equal(valid.iconManuallySet, false);
});

test("aggregates totals, transaction counts, active-day averages and merchant totals", () => {
  const rows = [
    transaction(),
    transaction({ id: "expense-2", itemName: "Trà đào", amount: 30_000, date: "2026-10-23", category: "Đồ uống" }),
    transaction({ id: "expense-3", merchant: "Tiệm An", itemName: "Bánh mì", amount: 20_000, date: "2026-10-24", category: "Đồ ăn" }),
  ];
  const summary = aggregateMonth(rows, "2026-10");
  assert.equal(summary.total, 100_000);
  assert.equal(summary.count, 3);
  assert.equal(summary.activeDays, 2);
  assert.equal(summary.averagePerActiveDay, 50_000);
  assert.deepEqual(summary.merchants.map(item => [item.merchant, item.total]), [["Highlands", 80_000], ["Tiệm An", 20_000]]);
  assert.equal(formatVnd(summary.total), "100.000 ₫");
});

test("compares full calendar months and reports missing or zero previous month", () => {
  const rows = [
    transaction({ id: "oct-1", amount: 60_000, date: "2026-10-10" }),
    transaction({ id: "oct-2", amount: 10_000, date: "2026-10-25" }),
    transaction({ id: "sep-1", amount: 50_000, date: "2026-09-10" }),
    transaction({ id: "sep-2", amount: 90_000, date: "2026-09-25" }),
  ];
  const comparison = getMonthlyComparison(rows, "2026-10", fixedNow);
  assert.equal(comparison.currentTotal, 70_000);
  assert.equal(comparison.previousTotal, 140_000);
  assert.equal(comparison.difference, -70_000);
  assert.equal(comparison.percentage, -50);
  assert.equal(getMonthlyComparison([transaction()], "2026-10").status, "missing");
  assert.equal(getMonthlyComparison([transaction({ date: "2026-10-10" }), transaction({ id: "prev-zero", date: "2026-09-10", amount: 0 })], "2026-10").status, "zero");
});

test("all-time and selected-month comparisons use transaction dates across year boundaries", () => {
  const rows = [
    transaction({ id: "oct", amount: 100_000, date: "2026-10-15", createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2027-01-01T00:00:00.000Z" }),
    transaction({ id: "sep", amount: 225_000, date: "2026-09-15", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }),
    transaction({ id: "aug", amount: 80_000, date: "2026-08-15" }),
    transaction({ id: "dec", amount: 125_000, date: "2026-12-15" }),
    transaction({ id: "jan", amount: 50_000, date: "2027-01-15" }),
  ];

  const allTime = getMonthlyComparison(rows, "all", fixedNow);
  assert.equal(allTime.currentMonth, "2026-10");
  assert.equal(allTime.previousMonth, "2026-09");
  assert.equal(allTime.currentTotal, 100_000);
  assert.equal(allTime.previousTotal, 225_000);
  assert.equal(allTime.difference, -125_000);
  assert.ok(Math.abs(allTime.percentage - (-55.55555555555556)) < 1e-10);

  const selectedOctober = getMonthlyComparison(rows, "2026-10", fixedNow);
  assert.equal(selectedOctober.currentTotal, 100_000);
  assert.equal(selectedOctober.previousTotal, 225_000);
  assert.equal(selectedOctober.difference, -125_000);

  const selectedSeptember = getMonthlyComparison(rows, "2026-09", fixedNow);
  assert.equal(selectedSeptember.currentMonth, "2026-09");
  assert.equal(selectedSeptember.previousMonth, "2026-08");
  assert.equal(selectedSeptember.previousTotal, 80_000);

  const selectedJanuary = getMonthlyComparison(rows, "2027-01", fixedNow);
  assert.equal(selectedJanuary.currentMonth, "2027-01");
  assert.equal(selectedJanuary.previousMonth, "2026-12");
  assert.equal(selectedJanuary.currentTotal, 50_000);
  assert.equal(selectedJanuary.previousTotal, 125_000);
});

test("monthly comparison refreshes after transaction add, edit, and delete", () => {
  let rows = [
    transaction({ id: "oct", amount: 100_000, date: "2026-10-15" }),
    transaction({ id: "sep", amount: 225_000, date: "2026-09-15" }),
  ];
  const compareCurrentMonth = () => getMonthlyComparison(rows, "all", fixedNow);
  assert.equal(compareCurrentMonth().currentTotal, 100_000);

  rows = [...rows, transaction({ id: "oct-added", amount: 25_000, date: "2026-10-02" })];
  assert.equal(compareCurrentMonth().currentTotal, 125_000);

  rows = rows.map(row => row.id === "oct-added" ? { ...row, amount: 50_000, updatedAt: "2026-10-24T00:00:00.000Z" } : row);
  assert.equal(compareCurrentMonth().currentTotal, 150_000);

  rows = rows.filter(row => row.id !== "oct-added");
  assert.equal(compareCurrentMonth().currentTotal, 100_000);
});

test("dashboard uses one shared comparison for the KPI and detail insight after sync and reload", () => {
  const script = readFileSync(new URL("../static/js/expense-tracker.js", import.meta.url), "utf8");
  assert.match(script, /const comparison = getMonthlyComparison\(transactions, selection\.period\);\s*renderKpis\(summary, comparison, selection\);/u);
  assert.match(script, /renderInsights\(transactions, summary, comparison, selection\);/u);
  assert.doesNotMatch(script, /selection\.period === "all"\s*\?\s*null\s*:\s*getMonthlyComparison/u);
  assert.doesNotMatch(script, /Chọn một tháng để so với tháng liền trước/u);
  assert.match(script, /const persistAndRender = async \(\) => \{[\s\S]*?renderDashboard\(transactions, dashboardMode,/u);
  assert.match(script, /renderDashboard\(transactions, dashboardMode, currentMonth\)/u);
});

test("exports and restores CSV with commas, quotes, and line breaks", () => {
  const rows = [transaction({ merchant: "Quán, \"An\"", notes: "ngồi tầng 2\ngần cửa sổ", iconId: "fried", iconManuallySet: true })];
  const csv = serializeCsv(rows);
  const restored = parseCsv(csv);
  assert.equal(restored[0].merchant, rows[0].merchant);
  assert.equal(restored[0].notes, rows[0].notes);
  assert.equal(Number(restored[0].amount), rows[0].amount);
  assert.equal(restored[0].iconId, rows[0].iconId);
  assert.equal(restored[0].iconManuallySet, "true");
});

test("validates imported rows and skips only duplicate transaction IDs", () => {
  const base = transaction();
  const result = prepareImportRows([
    base,
    { ...base },
    { ...base, id: "different-id" },
    { ...base, id: "new-id", itemName: "Bánh mì", category: "Đồ ăn" },
    { ...base, id: "invalid", amount: -1 },
  ], [base], { now: fixedNow, makeId: () => "generated" });
  assert.equal(result.imported.length, 2);
  assert.deepEqual(result.imported.map(row => row.id), ["different-id", "new-id"]);
  assert.deepEqual(result.skipped, { duplicate: 2, invalid: 1 });
});

test("groups food icons by monthly purchase count and amount with exact ratios", () => {
  const rows = [
    transaction({ id: "coffee-1", itemName: "Cà phê sữa", iconId: "coffee", amount: 30_000 }),
    transaction({ id: "coffee-2", itemName: "Americano", iconId: "coffee", amount: 70_000 }),
    transaction({ id: "cake-1", itemName: "Cheesecake", iconId: "cake", amount: 150_000 }),
    transaction({ id: "next-month", itemName: "Trà sữa", iconId: "milk-tea", amount: 500_000, date: "2026-11-01" }),
  ];
  const byCount = aggregateFoodGroups(rows, "2026-10", "count");
  assert.equal(byCount.total, 3);
  assert.deepEqual(byCount.items.map(({ iconId, count, amount, share }) => [iconId, count, amount, share]), [
    ["coffee", 2, 100_000, 2 / 3],
    ["cake", 1, 150_000, 1 / 3],
  ]);
  const byAmount = aggregateFoodGroups(rows, "2026-10", "amount");
  assert.equal(byAmount.total, 250_000);
  assert.deepEqual(byAmount.items.map(({ iconId, value, share }) => [iconId, value, share]), [
    ["cake", 150_000, 0.6],
    ["coffee", 100_000, 0.4],
  ]);
});

test("food icon aggregation handles no rows, one group, and invalid IDs with other fallback", () => {
  assert.deepEqual(aggregateFoodGroups([], "2026-10").items, []);
  const oneGroup = aggregateFoodGroups([
    transaction({ iconId: "not-a-food-icon", itemName: "Khoản chưa phân loại" }),
  ], "2026-10");
  assert.equal(oneGroup.items.length, 1);
  assert.equal(oneGroup.items[0].iconId, "other");
  assert.equal(oneGroup.items[0].share, 1);
  assert.equal(resolveFoodIcon("Matcha Latte"), "matcha");
  const sprite = readFileSync(new URL("../static/icons/food-drink.svg", import.meta.url), "utf8");
  for (const iconId of Object.keys(FOOD_ICONS)) assert.match(sprite, new RegExp(`<symbol id="food-icon-${iconId}"`, "u"));
  assert.equal(getBubbleSize(0), 112);
  assert.equal(getBubbleSize(1), 204);
});

test("health insights use recorded words and label missing food details unknown", () => {
  const rows = [
    transaction({ id: "tea-1", itemName: "Trà sữa", iconId: "milk-tea", taste: "Không đường" }),
    transaction({ id: "tea-2", itemName: "Trà sữa", iconId: "milk-tea", taste: "Không đường" }),
    transaction({ id: "fried-1", itemName: "Gà rán", iconId: "fried", category: "Đồ ăn", taste: "" }),
  ];
  const insights = buildHealthInsights(rows, "2026-10");
  assert.ok(insights.some(item => item.type === "positive" && item.text.includes("2 giao dịch")));
  assert.ok(insights.some(item => item.type === "consider" && item.title.includes("chiên")));
  assert.ok(insights.some(item => item.type === "consider" && item.title.includes("Lặp lại")));
  assert.ok(!insights.some(item => item.title.includes("Đồ uống có thể ngọt")));

  const unclear = buildHealthInsights([transaction({ itemName: "Món chưa xác định", iconId: "other", taste: "" })], "2026-10");
  assert.deepEqual(unclear.map(item => item.type), ["unknown"]);
  assert.match(unclear[0].text, /chưa thể đánh giá tổng lượng/u);
  assert.deepEqual(buildHealthInsights([], "2026-10").map(item => item.type), ["unknown"]);
});
