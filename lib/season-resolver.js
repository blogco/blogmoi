const SEASONS = Object.freeze({
  spring: Object.freeze({ key: "spring", vi: "Xuân", viName: "xuân", english: "Spring", icon: "season-spring" }),
  summer: Object.freeze({ key: "summer", vi: "Hạ", viName: "hạ", english: "Summer", icon: "season-summer" }),
  autumn: Object.freeze({ key: "autumn", vi: "Thu", viName: "thu", english: "Autumn", icon: "season-autumn" }),
  winter: Object.freeze({ key: "winter", vi: "Đông", viName: "đông", english: "Winter", icon: "season-winter" })
});

const ALIASES = new Map([
  ["spring", "spring"], ["xuan", "spring"],
  ["summer", "summer"], ["ha", "summer"],
  ["autumn", "autumn"], ["fall", "autumn"], ["thu", "autumn"],
  ["winter", "winter"], ["dong", "winter"]
]);

const NORTH_MONTHS = Object.freeze([
  "winter", "winter", "spring", "spring", "spring", "summer",
  "summer", "summer", "autumn", "autumn", "autumn", "winter"
]);

function normalizeSeason(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .trim();
  return ALIASES.get(normalized);
}

function getCalendarParts(value, timeZone) {
  let date = value;

  if (value instanceof Date && !Number.isNaN(value.getTime()) &&
      value.getUTCHours() === 0 && value.getUTCMinutes() === 0 && value.getUTCSeconds() === 0 && value.getUTCMilliseconds() === 0) {
    return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1 };
  }

  if (typeof value === "string") {
    const dateOnly = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      const [, year, month, day] = dateOnly;
      const check = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
      if (check.getUTCFullYear() !== Number(year) || check.getUTCMonth() + 1 !== Number(month) || check.getUTCDate() !== Number(day)) {
        throw new RangeError(`Invalid publication date: ${value}`);
      }
      return { year: Number(year), month: Number(month) };
    }
    date = new Date(value);
  }

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid publication date: ${String(value)}`);
  }

  const parts = new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "numeric",
    timeZone
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year").value),
    month: Number(parts.find((part) => part.type === "month").value)
  };
}

function validateTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format(0);
  } catch {
    throw new RangeError(`Invalid season publication time zone: ${timeZone}`);
  }
}

export function resolveSeason(data = {}, config = {}) {
  const defaults = config.defaultPublicationLocation;
  if (!defaults || !["north", "south"].includes(defaults.hemisphere) || !defaults.timeZone) {
    throw new TypeError("Season config requires a defaultPublicationLocation with hemisphere and timeZone.");
  }

  const location = data.publicationLocation || defaults;
  const locationProvided = Boolean(data.publicationLocation);
  if (!location || !["north", "south"].includes(location.hemisphere)) {
    throw new TypeError("publicationLocation.hemisphere must be 'north' or 'south'.");
  }

  const timeZone = location.timeZone || defaults.timeZone;
  validateTimeZone(timeZone);
  const calendar = location.seasonCalendar || (locationProvided ? "meteorological" : defaults.seasonCalendar || "meteorological");
  if (!["meteorological", "editorial"].includes(calendar)) {
    throw new TypeError("seasonCalendar must be 'meteorological' or 'editorial'.");
  }
  if (location.climate === "tropical" && calendar !== "editorial") {
    throw new TypeError("Tropical publication locations require seasonCalendar: 'editorial'.");
  }

  const publishDate = data.publishDate ?? data.date;
  if (publishDate === undefined || publishDate === null || publishDate === "") return null;
  const { year, month } = getCalendarParts(publishDate, timeZone);

  const manualSeason = data.season;
  let key;
  let classificationSource;
  if (manualSeason !== undefined && manualSeason !== null && String(manualSeason).trim()) {
    key = normalizeSeason(manualSeason);
    if (!key) throw new TypeError(`Unknown manual season override: ${String(manualSeason)}`);
    classificationSource = "manual-override";
  } else {
    const northernSeason = NORTH_MONTHS[month - 1];
    key = location.hemisphere === "north"
      ? northernSeason
      : ({ spring: "autumn", summer: "winter", autumn: "spring", winter: "summer" })[northernSeason];
    const locationType = locationProvided ? "publication-location" : "blog-default";
    classificationSource = `${locationType}${calendar === "editorial" ? "-editorial-calendar" : "-meteorological-calendar"}`;
  }

  const season = SEASONS[key];
  return Object.freeze({
    ...season,
    year,
    month,
    hemisphere: location.hemisphere,
    timeZone,
    classificationSource,
    accessibleLabel: `Mùa ${season.viName} · ${year}`
  });
}

export { SEASONS };
