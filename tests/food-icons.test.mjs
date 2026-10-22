import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FOOD_ICONS,
  prepareImportRows,
  resolveFoodIcon,
  serializeCsv,
  parseCsv,
  validateTransaction,
} from "../static/js/expense-tracker.js";

const baseRecord = {
  id: "food-icon-test",
  merchant: "Blogmoi Cafe",
  itemName: "Matcha Latte",
  amount: 50_000,
  date: "2026-10-23",
  taste: "Không đường",
  category: "Đồ uống",
  notes: "",
  createdAt: "2026-10-23T05:00:00.000Z",
  updatedAt: "2026-10-23T05:00:00.000Z",
};

test("recognizes Vietnamese, English, Korean, and Chinese food and drink names", () => {
  const examples = [
    ["coffee", ["Cà phê sữa", "Ca phe sua", "Espresso", "Americano", "카페라떼"]],
    ["matcha", ["Matcha Latte", "抹茶", "말차라떼"]],
    ["milk-tea", ["Trà sữa trân châu", "tra sua", "Bubble Tea", "버블티"]],
    ["tea", ["Trà đào", "Green Tea", "녹차"]],
    ["juice", ["Nước cam", "nuoc ep", "Orange Juice", "오렌지 주스"]],
    ["smoothie", ["Sinh tố bơ", "sinh to bo", "Smoothie", "스무디"]],
    ["cake", ["Cheesecake", "Bánh dứa", "banh dua", "케이크"]],
    ["bread", ["Bánh mì thịt", "banh mi thit", "Sandwich", "샌드위치"]],
    ["noodles", ["Phở bò", "pho bo", "Ramen", "Mì xào", "라면"]],
    ["rice", ["Cơm tấm", "com tam", "Bibimbap", "비빔밥"]],
    ["fried", ["Gà rán", "ga ran", "Khoai tây chiên", "Fried chicken", "치킨"]],
    ["other", ["Món chưa xác định", ""]],
  ];
  for (const [iconId, names] of examples) {
    for (const name of names) assert.equal(resolveFoodIcon(name), iconId, `${name} should resolve to ${iconId}`);
  }
});

test("specific terms win when a name also contains a general drink keyword", () => {
  assert.equal(resolveFoodIcon("Matcha Latte"), "matcha");
  assert.equal(resolveFoodIcon("말차 라떼"), "matcha");
  assert.equal(resolveFoodIcon("Bubble Tea"), "milk-tea");
  assert.equal(resolveFoodIcon("Green Tea Latte"), "tea");
  assert.equal(resolveFoodIcon("차돌박이"), "other");
});

test("validates inferred legacy icons and preserves an explicitly selected icon", () => {
  const legacy = validateTransaction(baseRecord);
  assert.equal(legacy.iconId, "matcha");
  assert.equal(legacy.iconManuallySet, false);

  const manual = validateTransaction({ ...baseRecord, itemName: "Phở bò", iconId: "cake", iconManuallySet: "true" });
  assert.equal(manual.iconId, "cake");
  assert.equal(manual.iconManuallySet, true);

  const edited = validateTransaction({ ...manual, itemName: "Cơm tấm" });
  assert.equal(edited.iconId, "cake");
  assert.equal(edited.iconManuallySet, true);
});

test("CSV backup keeps an override and legacy imports infer an icon", () => {
  const manual = validateTransaction({ ...baseRecord, iconId: "fried", iconManuallySet: true });
  const restored = parseCsv(serializeCsv([manual]));
  const prepared = prepareImportRows(restored, []);
  assert.equal(prepared.imported[0].iconId, "fried");
  assert.equal(prepared.imported[0].iconManuallySet, true);

  const legacyImport = prepareImportRows([{ ...baseRecord, itemName: "Bánh mì thịt" }], []);
  assert.equal(legacyImport.imported[0].iconId, "bread");
  assert.equal(legacyImport.imported[0].iconManuallySet, false);
});

test("sprite has twelve accessible-sized rounded SVG symbols with at most three colors each", () => {
  const sprite = readFileSync(new URL("../static/icons/food-drink.svg", import.meta.url), "utf8");
  assert.match(sprite, /<svg[^>]+viewBox="0 0 64 64"/u);
  const symbols = [...sprite.matchAll(/<symbol id="food-icon-([^"]+)" viewBox="0 0 64 64">([\s\S]*?)<\/symbol>/gu)];
  assert.equal(symbols.length, 12);
  assert.deepEqual(new Set(symbols.map(([, id]) => id)), new Set(Object.keys(FOOD_ICONS)));
  for (const [, id, markup] of symbols) {
    assert.ok(markup.includes(`stroke=\"${FOOD_ICONS[id].color}\"`), `${id} uses its specified main color`);
    assert.ok(markup.includes(`fill=\"${FOOD_ICONS[id].background}\"`), `${id} uses its specified pastel color`);
    assert.match(markup, /stroke-width="2\.5"/u, id);
    assert.match(markup, /stroke-linecap="round"/u, id);
    assert.match(markup, /stroke-linejoin="round"/u, id);
    assert.ok(new Set(markup.match(/#[0-9a-f]{6}/giu) || []).size <= 3, `${id} must use no more than three colors`);
  }
});

test("page exposes the icon chooser, leading icon column, and compact mobile transaction rows", () => {
  const page = readFileSync(new URL("../src/chi-phi-hang-thang/index.njk", import.meta.url), "utf8");
  const css = readFileSync(new URL("../static/css/expense-tracker.css", import.meta.url), "utf8");
  assert.match(page, /id="food-icon-options"/u);
  assert.ok(page.indexOf("<th scope=\"col\">Icon</th>") < page.indexOf("<th scope=\"col\">Tên món \/ quán</th>"));
  assert.match(css, /\.food-icon-tile \{[^}]*width: 44px; height: 44px/su);
  assert.match(css, /\.food-icon-svg \{[^}]*width: 36px; height: 36px/su);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*?grid-template-areas: "icon main amount"/u);
  assert.match(page, /aria-describedby="expense-icon-hint"/u);
});
