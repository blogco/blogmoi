# Seasonal editorial labels

Season labels are resolved at build time by `lib/season-resolver.js`. The resolver uses `publishDate` when supplied and the existing Eleventy `date` field for legacy posts. Date-only values keep their written calendar date; timestamps are read in the publication location's IANA time zone. Quote timestamp strings in front matter to preserve their offset for timezone conversion.

The current blog default is in `src/_data/season-config.js`: northern hemisphere, `Asia/Ho_Chi_Minh`, and an editorial calendar. The editorial calendar is a month-based publishing convention and does not describe observed weather. Missing article locations use this default, and the resolved source is retained as `classificationSource` and emitted on the label as `data-season-source`.

Authors may add a confirmed location to front matter:

```yaml
publicationLocation:
  hemisphere: south
  timeZone: Australia/Sydney
  seasonCalendar: meteorological
```

Use `seasonCalendar: editorial` for a tropical location that needs the four season labels as an editorial convention. A direct `season` value (`spring`, `summer`, `autumn`, `winter`, or the Vietnamese season name) overrides the calculated result. Store that field when an editor needs a particular label to stay fixed across later builds. No reader IP or runtime geolocation is used.

The homepage, archives, taxonomy listings, related article links, and article header share `src/_includes/components/season-label.njk`. Its four vector symbols live in the cached static asset `static/icons/season-icons.svg`.
