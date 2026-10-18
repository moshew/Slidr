# ADR-107 — An installation may read a library of its own

Status: Implemented on 2026-10-18. It changes one rule of [ADR-090](ADR-090-media-library-on-the-web.md): a release build read only the published library.

## Request

"אני רוצה לאפשר למשתמש להפחית התקנה שמפנה את הספריה לכתובת שלו ולא לpages. איך הוא יכול לעשות זאת בלי לבנות הכל מחדש"

## Context

- The pages never name the library. They read it through the core's `media` protocol, and only `media_library.rs` knows the address. So the frontend needs no change, and the address can be chosen when the app runs.
- `SLIDR_MEDIA_URL` names another copy, but only in a development build. Before this change, pointing a release build elsewhere meant building the app again, and that build was neither signed nor updated by the released installers.
- The installer is NSIS. It is signed after it is built, so it cannot be changed per user. Tauri's updater runs a newer installer with `/UPDATE` and nothing else.

## Decision

- **A file beside the executable names the copy**: `media-library.json`, `{ "url": "https://…" }`. `base_url()` reads it when the app starts. The development variable comes first, then the file, then the published site. The rule of the variable holds here too: HTTPS, or plain HTTP only on this machine. The byte-order mark Notepad may write is skipped. A file that is not JSON, or names no address the app may read, leaves the published library standing.
- **The installer writes it** (`src-tauri/windows/hooks.nsh`, `bundle.windows.nsis.installerHooks`). It takes the address from `/MEDIA=<url>` on its command line, or else copies a `media-library.json` that lies beside it. `/MEDIA=` with no address removes the file. An install with neither leaves the file alone, so an update keeps the address. An uninstall removes the file, but not the uninstall an update runs.
- **The address is parsed by hand, not with `GetOptions`.** `GetOptions` ends a value at the next `/`, so an address would come out as `https:`. The hook takes everything up to the next space, or between quotes.
- **It is not a setting of the app.** Whoever can write beside the executable can replace the executable, so the file grants nothing new. The Settings dialog does not offer it.

## Consequences

- The released, signed installer serves any copy, and so do its updates. A copy is any static site laid out like the published one (docs/media-library.md, "A library of your own"). `pnpm media:publish --dry-run --out <dir>` stages it from an author's copy.
- An unquoted address whose path has a part beginning like one of Tauri's options (`/P`, `/R`, `/NS`, `/UPDATE`, `/ARGS`) turns that option on too. Tauri reads those with `GetOptions`, which skips quoted text, so the documentation tells users to quote the address.
- The cache is not split by address. After the address changes, the manifest of the old one stands until the new one is read: at once when the app starts online.

## Checks

- Rust: `an_installation_may_name_a_copy_of_its_own`: an address with and without its final slash, with a byte-order mark, on the loopback; plain HTTP on the network, `file:`, an empty address, plain text and `{}` refused. All 14 tests of `media_library.rs` pass.
- The hook was compiled with makensis 3.09 (amd64-unicode) into a stand-in of Tauri's script: its `Install` and `Uninstall` sections and `un.onInit`'s `/UPDATE`, with Tauri's `/P` check. It was run under wine 9: unquoted; quoted from cmd.exe, also with `/public/` in the path (passive stays off); the whole option quoted; lower case; followed by another option; no option and `/UPDATE` (kept); `/MEDIA=` (removed); the file beside the installer; both (`/MEDIA=` wins); the uninstall of an update (kept) and a plain uninstall (removed, folder gone).
- Tauri's own installer: `tauri bundle --bundles nsis` (CLI 2.12, the hook included from `tauri.conf.json`) around a stand-in `slidr.exe`, run under 32-bit wine. Quoted with `/public/`, then `/S /UPDATE` and `/S` (kept), `/MEDIA=` (removed), the file beside the installer, unquoted, and the uninstaller (removed).
- Not run: the app reading a copy, and the installer, on Windows.
