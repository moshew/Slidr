# ADR-108 — Search tags for everything in the library, written by Claude

Status: Implemented on 2026-10-20, with the upload API of Slidr Library (branch `upload-tags` of slidrhq/library) and the studio's Publish panel. It adds to the search of icons (SHP-07, GEN-09), and to the searches of Elements ([ADR-075](ADR-075-elements-and-presets.md)) and of Ready slides ([ADR-106](ADR-106-ready-slides-panel.md)).

## Request

"I want to add tagging to every element of the library (including filling in the right tags with the LLM) to improve search. For example, 'יום הולדת' should find a birthday invitation, a birthday cake, and so on."

Then: "I no longer want to publish with `pnpm media:publish`, but through the REST API that was added to the library. The API should now carry tags for every item that is uploaded."

## Context

- Each kind was found by different words. Icons: their names, the tags of their sets, and the Hebrew the app's dictionary gives those English words (`icons/hebrew.json`). Emoji: their names and CLDR's keywords in both languages. Frames: their names and words the catalog gives about two thirds of them. Graphics: only the words of their file names (`party-popper-32`) and the dictionary's Hebrew for them. Ready slides: a substring of their name or id. Shapes, lines and card sets: not searched at all, in the app.
- So "יום הולדת" found the birthday cakes among the graphics, but not the balloons, the gifts, the confetti or the bunting; and it found the birthday invitation only because its Hebrew name holds the phrase as typed.
- The library is some 13,000 items: 7,024 icons, 3,296 graphics, 1,906 emoji, 366 frames, 191 shapes and lines, 5 card sets, 336 designs. Tagging them by hand is not practical, and the catalogs are written by generators that should stay deterministic.

## Decision

- **A layer of its own in the media library**: `tags/<kind>.json`, a file per kind, each item under the key its catalog gives it (`lucide:cake`, `fluent-emoji:balloon`, `birthday-cake`, `magnet-birthday`, `shape:rightArrow`, `line:arrow`, `card`, `steps`, `birthday`), with its tags in Hebrew and English. The generators and their catalogs do not change; a catalog regenerated keeps its tags, and an item it drops loses them at the next tagging.
- **Claude writes them**, through the Claude Code CLI the studio already uses (`apps/desktop/scripts/tag-elements.mjs`): numbered batches of a kind, each item with what the catalogs say of it, and each graphic also seen, on a sheet of the batch's drawings rendered in Edge, since a file name can be vague (`premium-32` is a diamond). The answer comes through a JSON schema, and is checked: tags in the wrong letters, words about the medium (icon, sticker, illustration, outline), and items with fewer than three tags a language are dropped, and what is missing is asked for again. The script tags what has no tags, and writes the file after every batch. Opus at low effort by default: on a sample it wrote cleaner Hebrew than Sonnet, which tagged pancakes for Hanukkah.
- **The designs of Slidr Studio come with their tags.** The plan asks Claude for `tags` with the names and the group; `brief.json` may change them; publishing writes them into `managed.json` beside the names. The app reads a design's tags from both files.
- **Tags reach the library through its upload API** (Slidr Library, `worker/uploads`, README "Uploading"), not by publishing the author copy with `pnpm media:publish`:
  - A new design (`designs: add`) carries its tags in Hebrew and English beside its names (`languages.he.tags`, `languages.en.tags`), and is refused without them. A translation carries none: the search reads Hebrew and English.
  - Every part the app searches (designs, card sets, frames, shapes, graphics, emoji, icons) takes `tag`: the tags of some of its published items by their keys, each key checked against the part's catalog in the published library, one upload of a part waiting at a time. Publishing merges it into `tags/<part>.json`. The parts that take no new items take their tags this way.
  - Every list of tags is held to one rule (`worker/uploads/tags.ts`), the one the script cleans Claude's answers by: 3 to 20 tags of one to four words, Hebrew without niqqud, English in lower case, none twice, none about the medium.
  - The script sends each kind's tags with `--upload` (a program's key, `LIBRARY_KEY`). The studio's Publish panel sends each approved design (`designs: add`, with its tags) and sample (`templates: translate`) to the API, and no longer publishes the author copy.
  - Publishing the accepted uploads into the library is still to come, as the library's README says. `tags/` is among the folders a publication stages (`PUBLISHED_FOLDERS`), so the studio's copy of the publishing script keeps it.
- **The search takes them as it takes a set's tags** (`withTags` in `media/icons/search.ts`): the English words among the tag words, each Hebrew tag as a whole term and as its single words. A match on a name still counts for more than a match on a tag, so a thing named for the query comes first. Every kind is searched through the one scorer, `searchIcons`: Hebrew prefixes and plurals, both languages, every word of the query.
- **Every collection is searched.** The first screen of Elements finds shapes and lines (first) and card sets (last) beside the graphics, frames, emoji and icons; its placeholder became "Search all elements…" in every language. Ready slides are found by their names in Hebrew and English, their group's names and their tags, best first, then by a name in the UI language that holds the query as typed (the search as it was, for the other languages).
- **The library's page** finds designs, shapes and card sets the same way, and shows each item's tags in its details.

## Not changed

- What is offered in which language (ADR-103), and the ranking of names among themselves.
- The search of the photo libraries, which still translates a Hebrew query through the dictionary.
- Tags are written in Hebrew and English only, the languages the gallery names things in; the search of an interface in another language finds them by those two, and by the names in its own language where it had them.

## Consequences

- Retagging everything is one run of the script (`--again-all`): about two hours and some $40 of usage at API prices. A new item costs a fraction of a cent.
- A tag can be wrong. It only adds an item to a search, after the items named for it; `--again <key>` writes one item's tags again.
- `src/media/icons/tags.test.ts` fails while a published item of a tagged kind has no tags, so a catalog that grows without tags is noticed.
- Until the publication of uploads exists, the tags wait in the library's uploads, and the app finds by names alone what is not published yet. A design the studio made before there were tags is refused by the API until its brief has them (a change asked for in words adds them).

## Verification

- A sample of twenty items of each kind, read by hand in both languages before the whole run; the prompt for designs was tightened after it (the sample's subject had become tags).
- The whole run on 2026-10-20 tagged all 13,124 items, with no batch failed, for $36.26 at API prices; the seven files are 3.5 MB, icons 1.9 MB of it. `tags.test.ts` run against the author copy (its reads sent to a local server of it) passes every test, none skipped: every item of every kind is tagged in both languages, and the birthday search finds what it should.
- Unit tests: `media/icons/tags.test.ts` (how tags join a thing's words; a design found by name, group and tags; the plural before a prefix-and-plural guess; and, once the library publishes them, every item of every kind tagged in Hebrew and English, and "יום הולדת" finding the invitation, the cakes and the balloons), `designCatalog.test.ts` (the tags of `managed.json`), `build/media.test.ts` (`tags/` is published). The icon, sticker and frame tests pass as they were. `designs.test.ts` fails five tests before and after this change, on the published library's content (286 authored designs of 296, one design in `invitations`, and its fonts).
- Studio: `test_units.py` (the plan asks for tags; tags are cleaned; `managed.json` takes them and drops them; a design's upload holds its slides, names and tags; the form; what the library refuses), and its Publish panel in Hebrew and English.
- Library: `worker/uploads/api.test.ts` covers designs and the `tag` action.
  - A design is refused without tags, with tags in the wrong letters, with niqqud, in capitals, twice or about the medium, and with tags in another language.
  - The tags of a part are checked against the keys of every part, in both languages, one upload at a time, and are written again a language at a time. A part that takes no new items still takes its tags.
- Library, by hand: its Worker, run on this machine, took the 13,124 tags in seven uploads from `tag-elements.mjs --upload`, checked against the published library. It took a design the studio's client sent with its tags, and refused it without them. The page's Uploads, in Hebrew and English, lists a part's tags by key, titled with the part's name.
- `elements-panel.spec.ts` against a dev server reading the author copy with its tags: the first screen finds the heart shape first for "לב", and the card set of steps for "שלבים". Every other test of the file passes, but "designs are shown by group", which wants 19 groups where `managed.json` makes 21, before and after this change.
- Renders of the panels in Hebrew and English: "יום הולדת" and "birthday" find the cakes, the balloons, the gifts, the piñata and the confetti among the graphics and the emoji, and every birthday magnet; "חץ" puts the arrows of the shape library first; "חתונה" finds the wedding invitation and the bachelorette party, the catering, the save-the-date and the thank-you card.
- Typecheck, ESLint and Prettier of the app, the studio and the library's page.
