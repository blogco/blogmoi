import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { buildHealthInsights, renderHealthInsights } from "../static/js/expense-tracker.js";

const rows = [
  { id: "tea", date: "2026-10-10", itemName: "Trà sữa", iconId: "milk-tea", taste: "Ít đường", category: "Đồ uống", amount: 30000 },
  { id: "coffee", date: "2026-10-11", itemName: "Cà phê", iconId: "coffee", category: "Đồ uống", amount: 20000 },
  { id: "old", date: "2026-09-11", itemName: "Gà rán", iconId: "fried", category: "Đồ ăn", amount: 40000 },
];
test("health charts reflect selected transactions and reset for empty periods", () => {
  const dom = new JSDOM('<div id="expense-app" data-icon-sprite="/blogmoi/icons/food-drink.svg"></div><div id="health-insight-list"></div>');
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  try {
    const insights = buildHealthInsights(rows, "2026-10");
    assert.equal(insights.find(item => item.type === "positive").count, 1);
    assert.ok(insights.filter(item => item.count).every(item => item.total === 2));
    renderHealthInsights(rows, "2026-10");
    const cards = document.querySelectorAll(".health-insight-card");
    assert.equal(cards.length, 3);
    assert.equal(document.querySelectorAll(".health-insight-card__track").length, 2);
    assert.equal(document.querySelector(".health-insight-card__track span").style.width, "50%");
    assert.match(document.querySelector("use").getAttribute("href"), /^\/blogmoi\/icons\/food-drink.svg#/);
    assert.match(cards[0].textContent, /1 \/ 2 giao dịch/);
    assert.equal(cards[2].querySelector(".health-insight-card__track"), null);
    renderHealthInsights(rows, "2026-08");
    assert.equal(document.querySelectorAll(".health-insight-card").length, 1);
    assert.equal(document.querySelectorAll(".health-insight-card__track").length, 0);
    assert.match(document.querySelector("#health-insight-list").textContent, /Chưa có dữ liệu/);
    renderHealthInsights(rows, "all");
    assert.ok([...document.querySelectorAll(".health-insight-card__metric")].every(node => node.textContent.includes("/ 3 giao dịch")));
  } finally {
    globalThis.document = previous;
    dom.window.close();
  }
});
