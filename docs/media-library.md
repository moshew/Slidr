# Media library

Authored Elements content and content resources live in `../Slidr-media`, a sibling of the Slidr repository. The repository contains the application code and its own UI resources. Keep these two directories together when moving the project:

```text
Projects/
  Slidr/       application source
  Slidr-media/ authored content and resources
```

`Slidr-media/elements` holds the designs, card sets, shape data, graphics, frames, emoji and art catalogs. `templates` holds the complete built-in template catalog, each template's installed JSON, and the reference decks. `images`, `icons` and `fonts` hold the content resources. `elements/source` holds generator inputs. `archive` keeps the former source files for provenance. Both source folders are excluded from the installed app.

Vite reads the sibling directory in development. During a desktop build, Tauri copies the active media folders beside `slidr.exe` as `media/`; the app reads them through its `media` protocol. The build needs the sibling directory present. Changes to the external catalogs or images do not require moving files back into the repository. Regenerate the affected catalog when adding assets, and run the desktop build to update installed media.

The external directory is separate from this Git repository. Back it up or version it independently together with source changes that refer to its contents.
