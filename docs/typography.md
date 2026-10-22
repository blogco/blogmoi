# Blogmoi typography

Blogmoi uses self-hosted Be Vietnam Pro for Latin and Vietnamese text. The font comes from the [Google Fonts Be Vietnam Pro family](https://github.com/google/fonts/tree/main/ofl/bevietnampro); the upstream description calls out refined Vietnamese letterforms and diacritic forms. The included `static/fonts/OFL.txt` is its SIL Open Font License.

The site ships only normal weights 500, 700, and 800 in WOFF2 format. `static/css/fonts.css` maps the Latin and Vietnamese Unicode subsets separately. The shared font stack and responsive type scales are in `static/css/typography.css`. The document preloads only the two 500-weight subsets used by the body copy and loads the other weights on demand. No font service or runtime package is required.

Korean falls back to an installed Noto Sans KR, Apple SD Gothic Neo, or system sans-serif. CSS disables synthetic weight generation, so missing weights resolve to an included face rather than a faux bold; style synthesis remains available for semantic emphasis. Keep body and metadata text at readable sizes and preserve the Vietnamese subset mapping when changing font assets.

The typography QA string is: `ă â đ ê ô ơ ư Á Ắ Ặ Ề Ể Ữ Ỷ`.
