# ADR-102 — The studio takes requests beyond designs: the samples of templates

Status: Implemented in the 2026-10-16 working tree; **not committed** and **not published** at the time of this record. It extends the management studio of [ADR-079](ADR-079-elements-designs.md) and the languages of [ADR-098](ADR-098-content-in-every-language.md).

## Request

The user asked that the management studio make every kind of element and template, not only designed slides, and gave an example of a request it should take: "תרגם את תבנית מפגש לכל השפות שהוא עדיין לא תומך בהן" (translate the Mifgash template into every language it does not support yet).

## Context

- The studio knew one kind of work. A request was a prompt for designs: plan concepts, make a picture each, write HTML, convert, review, publish into `elements/designs/managed.json`.
- A template's sample lives in another place and another shape: `templates/catalog.json`, `samples[<template>][<lang>]`, a list of `SampleSlide` that the template engine seats on the template's layouts (`packages/templates/src/builtin/kit.ts`). Of the 25 built-in templates, only Atlas had a sample beyond Hebrew and English.
- The other parts of the library (card sets, frames, shapes, graphics, emoji, icons, fonts) each have their own catalog, generator and contract, and most are imported sets rather than authored work.

## Decision

- **Kinds of request.** A request is `design`, `template` (the sample of a built-in template in languages), or `auto`. An `auto` request is read by one structured Claude call (`template_prompts.route_*`) that sees the templates (their Hebrew and English names from `apps/desktop/src/templates/messages.ts`, read through `web/tools/instructions.mjs`, and the languages each sample is and is not written in) and makes it one of the two. A request for a kind the studio does not make yet stops with the reason and what it can do instead. `auto` is the form's default.
- **A template request has a variant a language**, each with its own Claude conversation, running side by side. A language the sample lacks is translated; one it has is rewritten as the instructions say. The layouts, colours and pictures do not change.
- **Claude writes the catalog's own format.** The variant's folder holds the template, a digest of it in words (`template.md`: the theme, its families and text styles, and every box of every layout with its size, style and how many lines it holds), and the English and Hebrew samples. Claude writes `<lang>.json` as a `SampleSlide[]` with the English sample's structure. The system prompt adds what the language needs: shorter wording where it runs longer, leading where its letters are taller, phrase breaks where it breaks anywhere, and which of its letters the template's families leave to the system's font. The years of the English sample are left out (AGENTS.md: no stale dates).
- **The render is the app's engine.** The render page builds each slide with `sampleSlides`, as the catalog's export and the app do, and draws all of them in one deck: each at full size and 384 px wide, and a sheet of all of them in the language's direction. It runs the design check with every rule, as the acceptance of a template does. It builds the slide the translation was written from (English, or Hebrew for a right-to-left language) with the same seed, so its elements have the same ids: a finding that slide has on the same elements is the template's, shown apart and not counted. The contract: the same slides on the same layouts, as many fills per role, the same pictures, valid text, no placeholder words, and no more than a quarter of the longer texts left in English or without the language's letters.
- **Publishing** writes `samples[<template>][<lang>]` into the author copy's `templates/catalog.json`, which may hold unpublished authored work, so that copy (not the published one) is the base. Languages keep the registry's order, the file is written as `export-templates.mjs` writes it (Python's `json.dumps(…, indent=2)` and a line end give the same bytes), and nothing else in it changes. The dry run's report counts the catalog as the studio's file, so any other difference between it and the published catalog (another template's unpublished languages, say) is listed part by part among the unexpected changes (`catalog_changes`). A catalog that would pass the 25 MB Pages serves is refused.
- **`export-templates.mjs`** keeps a language the template's source file does not write (the studio writes into the catalog, not into `archive/templates-source/<id>.ts`), and checks it against the layouts as they are drawn now. Its `--check` now writes nothing: it used to rewrite the records of the template pictures, and the catalog with them.

## Considered and rejected

- **One agent with a shell for every kind.** It would cover card sets and frames at once, but it takes away the studio's guarantees: a folder Claude cannot leave, renders by the app's own engine, a contract per kind, and a publication whose changes are known before it is sent.
- **Writing translations into the template's TypeScript source.** The sources of the first twenty-two templates live outside the repository, in the author copy's archive. The catalog is what the app reads, and the export now keeps what it holds.
- **Sending a whole language through one review of all languages.** Fourteen languages of sixteen slides is more than one conversation can look at with care; a variant a language keeps each review to its own slides.

## Verification

- Unit tests of the server: 37 passed (24 before, 13 new in `tests/test_templates.py`): request validation, the listing, the digest, the fonts note, the work folder, the render input, the merge and its byte format, publishing into an author copy and putting it back, the catalog's unpublished work, inherited findings in the prompt.
- The pages typecheck, and pass eslint and prettier.
- The routing call, on the user's sentence: `template`, `mifgash`, exactly its fourteen missing languages, titled "מפגש · 14 שפות" ($0.05). A card-set request came back unsupported, with the reason in Hebrew; an invitation came back a design.
- A real request in a scratch studio, "תרגם את תבנית מפגש לגרמנית", with one review round: routed, written, rendered (16 slides and the sheet), reviewed and fixed by Claude (it shortened a card title that ran into its text, and fixed lone words and split compounds), and left with no findings of its own; $2.78. The renders were looked at: German figures and times, names natural to German readers, no years, page numbers running on. Publishing was prepared against a copy of the author library: the dry run of `media-publish.mjs` changed `templates/catalog.json` alone, the merge added `samples.mifgash.de` and nothing else, and cancelling put the file back byte for byte.
- A render of the English sample under a German variant: every design-check finding was matched to the English slide's, and the sample was refused as still English.

## Open for the user

- **Run it.** The studio now takes "תרגם את תבנית מפגש לכל השפות שהוא עדיין לא תומך בהן". At about $2.8 a language with one review round, Mifgash's fourteen languages cost about $40, more with the default two rounds.
- **Kinds not made yet:** new templates (theme, layouts, pictures), card sets, frames, shapes and graphics. Each needs its own folder layout, render, contract and merge, on the pattern of the template kind; the router names them as not made yet.
- **The catalog's size.** It is 19 MB of the 25 MB Pages serves. A sample adds about 18 KB a language, so every template in all sixteen languages would pass the limit; the studio refuses such a publication, and the catalog would then have to be split.
- **A stale record in the published library.** The published `templates/catalog.json` records ten pictures (Anan, Atlas, Mutzar, Shvav) with ids and sizes that are not those of the published picture files. An export of any template corrects them in the author copy, which then publishes them.
- **The names of a template in other languages** come from the app's translations, not the library: a translated sample does not translate the template's name in the interface.
