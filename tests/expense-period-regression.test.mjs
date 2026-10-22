import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  aggregatePeriod,
  buildPeriodExport,
  getMonthlyComparison,
  normalizeTransactions,
  parseCsv,
  prepareImportRows,
  resolveDashboardSelection,
  serializeCsv,
  validateTransaction,
} from "../static/js/expense-tracker.js";

const fixture = [
  validateTransaction({
    id: "oct-1", merchant: "Highlands", itemName: "Cà phê sữa", amount: 50_000,
    date: "2026-10-23", category: "Đồ uống", taste: "", notes: "",
    createdAt: "2026-10-22T17:00:00.000Z", updatedAt: "2026-10-22T17:00:00.000Z",
  }),
  validateTransaction({
    id: "oct-2", merchant: "Highlands", itemName: "Cà phê sữa", amount: 50_000,
    date: "2026-10-23", category: "Đồ uống", taste: "", notes: "",
    createdAt: "2026-10-23T03:00:00.000Z", updatedAt: "2026-10-23T03:00:00.000Z",
  }),
  validateTransaction({
    id: "sep-1", merchant: "Tiệm An", itemName: "Bánh mì", amount: 225_000,
    date: "2026-09-25", category: "Đồ ăn", taste: "", notes: "",
    createdAt: "2026-09-24T17:00:00.000Z", updatedAt: "2026-09-24T17:00:00.000Z",
  }),
];

test("three-transaction fixture aggregates all-time and by transaction calendar month", () => {
  const all = aggregatePeriod(fixture, "all");
  const october = aggregatePeriod(fixture, "2026-10");
  const september = aggregatePeriod(fixture, "2026-09");

  assert.equal(all.total, 325_000);
  assert.equal(all.count, 3);
  assert.equal(october.total, 100_000);
  assert.equal(october.count, 2);
  assert.equal(october.activeDays, 1);
  assert.equal(october.averagePerActiveDay, 100_000);
  assert.equal(september.total, 225_000);
  assert.equal(september.count, 1);
  assert.equal(getMonthlyComparison(fixture, "2026-10").percentage, (-125_000 / 225_000) * 100);
  assert.ok(Math.abs(getMonthlyComparison(fixture, "2026-10").percentage - (-55.5555556)) < 0.00001);
  assert.equal(validateTransaction({ ...fixture[0], amount: "50.000" }).amount, 50_000);
  assert.equal(fixture[0].date, "2026-10-23");
});

test("period selection, CSV, JSON, and printable report share scoped totals", () => {
  const allSelection = resolveDashboardSelection("all", "", new Date(2026, 9, 23));
  const allReport = buildPeriodExport(fixture, allSelection);
  assert.equal(allReport.total, aggregatePeriod(fixture, "all").total);
  assert.equal(allReport.count, aggregatePeriod(fixture, "all").count);

  const octoberSelection = resolveDashboardSelection("custom", "2026-10", new Date(2026, 9, 23));
  const octoberReport = buildPeriodExport(fixture, octoberSelection);
  assert.equal(octoberReport.total, 100_000);
  assert.equal(octoberReport.count, 2);
  assert.deepEqual(octoberReport.transactions.map(row => row.id), ["oct-1", "oct-2"]);

  const csvRows = parseCsv(serializeCsv(octoberReport.transactions, octoberReport));
  const csvSummary = csvRows.find(row => row.recordType === "summary");
  const csvTransactions = csvRows.filter(row => row.recordType === "transaction");
  assert.equal(Number(csvSummary.total), octoberReport.total);
  assert.equal(Number(csvSummary.count), octoberReport.count);
  assert.equal(csvTransactions.reduce((sum, row) => sum + Number(row.amount), 0), octoberReport.total);
  const restored = prepareImportRows(csvRows, [], { makeId: () => "unused" });
  assert.equal(restored.imported.length, 2);
  assert.equal(restored.skipped.invalid, 0);

  const jsonReport = JSON.parse(JSON.stringify({ version: 1, ...allReport }));
  assert.equal(jsonReport.total, allReport.total);
  assert.equal(jsonReport.transactions.reduce((sum, row) => sum + row.amount, 0), allReport.total);
  assert.equal(aggregatePeriod(allReport.transactions, "all").total, allReport.total);
  const template = readFileSync(new URL("../src/chi-phi-hang-thang/index.njk", import.meta.url), "utf8");
  assert.match(template, /id="print-report"/u);
  assert.match(template, /id="kpi-total"/u);
});

test("normalization deduplicates repeated IDs without collapsing separate identical purchases", () => {
  const normalized = normalizeTransactions([...fixture, { ...fixture[0] }]);
  assert.equal(normalized.length, 3);
  assert.equal(normalized.filter(row => row.date === "2026-10-23").length, 2);
  assert.throws(() => normalizeTransactions([
    ...fixture,
    { ...fixture[0], amount: 51_000 },
  ]), /cùng một giao dịch/u);
});

test("month comparison crosses January to prior December and handles empty baselines", () => {
  const january = { ...fixture[0], id: "jan", date: "2027-01-03", amount: 30_000 };
  const december = { ...fixture[2], id: "dec", date: "2026-12-31", amount: 10_000 };
  const comparison = getMonthlyComparison([january, december], "2027-01");
  assert.equal(comparison.previousMonth, "2026-12");
  assert.equal(comparison.percentage, 200);
  assert.equal(getMonthlyComparison([january], "2027-01").status, "missing");
  assert.equal(getMonthlyComparison([
    january,
    { ...december, amount: 0 },
  ], "2027-01").status, "zero");
});
