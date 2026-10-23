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

test("meal advice covers food groups, unrecognized meals and drinks without truncation", () => {
  const names = ["Cơm gà", "Phở bò", "Bánh mì trứng", "Salad rau", "Cá hấp", "Xúc xích", "Món đặc biệt", "Bánh ngọt", "Gà rán", "Trà sữa", "Cà phê"];
  const meals = names.map((itemName, index) => ({ id: String(index), date: "2026-10-11", itemName, amount: 30000, category: index < 9 ? "Đồ ăn" : "Đồ uống" }));
  const insights = buildHealthInsights(meals, "2026-10");
  for (const title of ["Cơm và món từ gạo", "Phở, bún và mì", "Bánh mì và món ăn nhanh", "Rau, củ, quả và các loại đậu", "Thịt, cá, trứng và hải sản", "Món chế biến sẵn và vị mặn", "Các món ăn khác trong sổ", "Bánh ngọt / món tráng miệng", "Món được mô tả là chiên", "Món ăn / đồ uống có thể ngọt", "Đồ uống có thể chứa caffeine"]) {
    assert.ok(insights.some(item => item.title === title), title);
  }
  assert.ok(insights.filter(item => item.count).every(item => item.total === meals.length && item.count <= item.total));
  assert.ok(insights.find(item => item.title === "Các món ăn khác trong sổ").text.includes("Món đặc biệt"));
  assert.equal(insights.at(-1).type, "unknown");
  assert.equal(buildHealthInsights(meals, "2026-09").length, 1);
});

test("food advice does not infer missing vegetables or diagnose nutritional deficiency", () => {
  const insights = buildHealthInsights([{ id: "rice", date: "2026-10-11", itemName: "Cơm", category: "Đồ ăn", amount: 20000 }], "all");
  assert.ok(insights.some(item => item.title === "Cơm và món từ gạo"));
  assert.ok(!insights.some(item => /thiếu chất|bạn ăn thiếu|bạn bị|chẩn đoán bạn/iu.test(item.text)));
  assert.ok(!insights.some(item => item.title === "Rau, củ, quả và các loại đậu"));
});
