# Slidr homepage

The marketing site of Slidr: one static page, in English with a language menu for every language the app speaks (`packages/model/src/languages.ts`). No build step and no dependencies; the fonts come from Google Fonts.

```sh
python -m http.server 1488   # from this folder, then open http://localhost:1488
```

`?lang=he` (or any other code) opens the page in that language; the choice is remembered in the browser.

- `index.html` holds the page in English. Every text carries a `data-i18n` key.
- `assets/i18n/<code>.js` holds the text of each language, translated from `en.js`; a new key goes into every file.
- `assets/site.js` switches languages (direction and the fonts of each script with it), runs the scroll animations, the clip player, the wall of designs and the library's counts.
- `assets/designs.js` lists the designs of Elements the page shows (from the app, `src/elements/designs.ts`), in the columns of the library's wall and of the wall behind the hero.

## Media

- `media/clips/ai-build.mp4` is a real run: the app's window filmed over CDP while the evaluation runner sent one request ("AI in Our Classrooms", nine slides, on the Zohar template) to Claude Code (Opus 5.5) with Codex images. The request asks the agent to finish each slide, photos included (`slide_render` waits for them), before it starts the next, so the stage only moves forward. The edit cuts the time nothing on screen changes, plays the agent's work in the chat at 12× and the moments a slide arrives or a photo lands at about real speed; a few seconds where the agent wrote into the wrong box and undid it are left out. `media/edu/` are the slides of that run.
- `media/galilee/` and `media/festival/` are two more runs of the same kind, for the hero's second and third requests: "Three days in the Upper Galilee" (eight slides, on Shvil) and "Neon Nights", a festival's sponsorship deck (seven slides, on Layla), sent by the runner with `--effort high`. The hero plays the three runs in turn; the dots under its prompt jump to one.
- `media/clips/deck-tour.mp4`, the hero, is the finished deck of that run (its `.slidr` loaded into the dev server): the editor steps through slides 1–4, the show plays 4–7 with their animations, and it comes back to slide 1, so the loop has no seam. It shows the result where the showcase's first chapter shows the build.
- `media/clips/languages.mp4` (the Languages section) is the Zohar sample deck on the dev server, driven by Playwright: the interface switches from English to Hebrew and mirrors, the cover's subtitle is set right to left and a line mixing Hebrew and English is typed into it, then the interface goes back to English, so the loop ends where it began.
- The other clips are the app on the dev server with the scripted agent.
- `media/designs/<he|en>/` are those designs, drawn by `/dev/designs-review.html`; the Hebrew page shows the Hebrew ones. Only the designs `assets/designs.js` lists are kept.
- `media/templates/` are thumbnails of the built-in templates.
- `media/showcase/` are every sample slide of three library templates (Layla, Zohar, Mifgash) in Hebrew and English, drawn at 1920×1080 by `/dev/review.html?src=library&t=<id>&lang=<he|en>&slide=<n>` and saved at 720 px. `assets/showcase.js` holds their names and taglines in every language (from the app) and the names of their slides (the library's `templates/catalog.json`).
- `media/library/` are strips of real items of the media library: Lucide line icons, Fluent colour illustrations and stickers of the frames catalog. The counts on the page are rounded down with a plus (8,000+ icons, 10,000+ illustrations and emoji, 600+ frames and stickers, 300+ designs) so they stay true as the library grows; on 2026-10-18 the published library had about 8,000, 10,000, 680 and 336.

The site is not part of the app's build or of any check. Publish the folder as it is, to any static host.
