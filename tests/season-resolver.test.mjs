import test from "node:test";
import assert from "node:assert/strict";
import { resolveSeason } from "../lib/season-resolver.js";

const defaultConfig = {
  defaultPublicationLocation: {
    hemisphere: "north",
    timeZone: "Asia/Ho_Chi_Minh",
    seasonCalendar: "editorial"
  }
};

const located = (hemisphere, timeZone = "UTC", seasonCalendar = "meteorological") => ({
  publicationLocation: { hemisphere, timeZone, seasonCalendar }
});

test("classifies each northern hemisphere season at meteorological month boundaries", () => {
  const cases = [
    ["2026-02-28", "winter"], ["2026-03-01", "spring"], ["2026-05-31", "spring"],
    ["2026-06-01", "summer"], ["2026-08-31", "summer"], ["2026-09-01", "autumn"],
    ["2026-11-30", "autumn"], ["2026-12-01", "winter"]
  ];
  for (const [date, expected] of cases) {
    assert.equal(resolveSeason({ date, ...located("north") }, defaultConfig).key, expected, date);
  }
});

test("reverses the meteorological seasons in the southern hemisphere", () => {
  const cases = [
    ["2026-03-01", "autumn"], ["2026-06-01", "winter"],
    ["2026-09-01", "spring"], ["2026-12-01", "summer"], ["2027-02-28", "summer"]
  ];
  for (const [date, expected] of cases) {
    assert.equal(resolveSeason({ date, ...located("south") }, defaultConfig).key, expected, date);
  }
});

test("uses publishDate over the legacy Eleventy date and preserves leap-day year", () => {
  const result = resolveSeason({
    date: "2026-07-10",
    publishDate: "2024-02-29",
    ...located("north")
  }, defaultConfig);
  assert.equal(result.key, "winter");
  assert.equal(result.year, 2024);
});

test("applies a timestamp's publication timezone at month and year boundaries", () => {
  const result = resolveSeason({
    publishDate: "2026-03-01T00:30:00+14:00",
    ...located("north", "America/Los_Angeles")
  }, defaultConfig);
  assert.equal(result.key, "winter");
  assert.equal(result.year, 2026);
  assert.equal(result.month, 2);
});

test("preserves YAML date-only values when an author's timezone is west of UTC", () => {
  const result = resolveSeason({
    publishDate: new Date("2026-03-01T00:00:00.000Z"),
    ...located("north", "America/Los_Angeles")
  }, defaultConfig);
  assert.equal(result.key, "spring");
  assert.equal(result.month, 3);
});

test("uses the blog default for legacy posts and records its editorial source", () => {
  const result = resolveSeason({ date: "2026-10-23" }, defaultConfig);
  assert.equal(result.key, "autumn");
  assert.equal(result.classificationSource, "blog-default-editorial-calendar");
  assert.equal(result.accessibleLabel, "Mùa thu · 2026");
});

test("uses a configured tropical editorial calendar without claiming observed weather", () => {
  const result = resolveSeason({
    date: "2026-06-30",
    publicationLocation: {
      hemisphere: "north",
      timeZone: "Asia/Bangkok",
      climate: "tropical",
      seasonCalendar: "editorial"
    }
  }, defaultConfig);
  assert.equal(result.key, "summer");
  assert.equal(result.classificationSource, "publication-location-editorial-calendar");
});

test("honors a manual override and records its source", () => {
  const result = resolveSeason({ date: "2026-10-23", season: "Xuân" }, defaultConfig);
  assert.equal(result.key, "spring");
  assert.equal(result.classificationSource, "manual-override");
  assert.equal(resolveSeason({ date: "2026-10-23", season: "Đông" }, defaultConfig).key, "winter");
});

test("does not guess when publication dates or locations are invalid", () => {
  assert.equal(resolveSeason({}, defaultConfig), null);
  assert.throws(() => resolveSeason({ date: "2026-02-30" }, defaultConfig), /Invalid publication date/);
  assert.throws(() => resolveSeason({ date: "2026-10-23", season: "monsoon" }, defaultConfig), /Unknown manual season/);
  assert.throws(() => resolveSeason({ date: "2026-10-23", ...located("middle") }, defaultConfig), /hemisphere/);
  assert.throws(() => resolveSeason({
    date: "2026-10-23",
    publicationLocation: { hemisphere: "north", timeZone: "UTC", climate: "tropical" }
  }, defaultConfig), /seasonCalendar: 'editorial'/);
});
