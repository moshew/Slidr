# The media library

The graphics Slidr offers, kept out of the executable. The installer puts this folder beside
`slidr.exe`, and the app reads it from there (`src/media_dir.rs`), under the address
`http://media.localhost/`.

| Folder              | What is in it                                                       |
| ------------------- | ------------------------------------------------------------------- |
| `icons/lucide/`     | The Lucide icon set: its drawings and its search words              |
| `icons/tabler/`     | The Tabler icon set: line and filled drawings, and its search words |
| `icons/hebrew.json` | The Hebrew search words of both sets                                |
| `images/templates/` | The photographs of the built-in templates                           |
| `fonts/<family>/`   | The built-in fonts of decks                                         |
| `templates/`        | The built-in templates: `index.json` names them in the order they   |
|                     | are shown, and `<id>/template.json` is each one                     |

The icons here are the ones a user puts on a slide. The icons of the app's own interface, and
the two fonts it is set in, are part of the app itself.

Only this file is kept in the repository. The folders are written by `pnpm build`
(`build/media.ts`), from the packages and the files the app's code names; they are emptied and
written again by every build.
