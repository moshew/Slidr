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

Only this file is kept in the repository. The folders are written by `pnpm build`
(`build/media.ts`), from the packages and the files the app's code names; they are emptied and
written again by every build.
