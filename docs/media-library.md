# Media library

Authored Elements content and content resources live in `../Slidr-media`, a sibling of the Slidr repository. The repository contains the application code and its own UI resources. Keep these two directories together when moving the project:

```text
Projects/
  Slidr/       application source
  Slidr-media/ authored content and resources
```

`Slidr-media/elements` holds the designs, card sets, shape data, graphics, frames, emoji and art catalogs. `templates` holds the complete built-in template catalog, each template's installed JSON, and the reference decks. `images`, `icons` and `fonts` hold the content resources. `elements/source` holds generator inputs. `archive` keeps the former source files for provenance. Both source folders are excluded from the installed app.

A ready-made slide is written in a pack file under `elements/source/design-packs/` and put into `elements/designs/index.json` by `apps/desktop/scripts/export-designs.mjs`. A built-in template is written as `archive/templates-source/<id>.ts`, beside the files the first eighteen were made from, and put into `templates/catalog.json` (with `templates/index.json` and `templates/<id>/template.json`) by `apps/desktop/scripts/export-templates.mjs`. Each script's header lists the steps for adding one.

The photo frames are written into `elements/catalogs/frames-catalog.json` by `apps/desktop/scripts/generate-frames-catalog.mjs`. The Elements panel shows an event magnet from a small picture of it, `images/frames/<language>/<frame>.webp`, which `apps/desktop/scripts/generate-frames-thumbs.mjs` makes of the renderer's own drawing: run it after the catalogue is written. A magnet whose picture is of an earlier drawing is drawn live in the panel until then, and `frames.test.ts` fails.

Vite reads the sibling directory in development. During a desktop build, Tauri copies the active media folders beside `slidr.exe` as `media/`; the app reads them through its `media` protocol. The build needs the sibling directory present. Changes to the external catalogs or images do not require moving files back into the repository. Regenerate the affected catalog when adding assets, and run the desktop build to update installed media.

The external directory is separate from this Git repository. Back it up or version it independently together with source changes that refer to its contents.
