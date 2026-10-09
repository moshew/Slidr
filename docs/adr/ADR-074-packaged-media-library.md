# ADR-074 — Package built-in media beside the executable

Status: Implemented in `dcda014` and extended in `abc5243` on 2026-10-08. This record describes the committed code in `HEAD`.

## Context

Built-in icon catalogues, template images, deck fonts, and templates are application resources. Embedding their full contents in the JavaScript bundle or executable makes the bundle larger and makes the boundary between application code and media unclear. Development still needs to read the same source files without a packaged installer.

## Decision

- A production build writes a generated `media/` directory as a Tauri resource beside `slidr.exe`. It contains `icons/`, `images/templates/`, `fonts/`, and `templates/`. The build recreates these directories from the source imports on every build; generated contents are not checked into Git.
- The Vite plugin in `apps/desktop/build/media.ts` rewrites recognized `?url` and `?raw` imports in production. Development and tests keep their normal Vite imports. Built-in templates are serialized as `templates/index.json` and `templates/<id>/template.json`; the packaged app loads those files instead of shipping the template construction code.
- Tauri serves these resources through its read-only `media` protocol (`http://media.localhost/` in WebView2). `media_dir.rs` resolves paths inside the media root, rejects traversal, drive and stream syntax, and serves known content types. Pages do not receive the machine's resource path.
- Images may have a decorated `smartFrame`. The model's `imageOpening` helpers and renderer use the frame's opening so the image is clipped and positioned consistently. The new field is optional for existing decks.

## Consequences and checks

The installer must contain the generated media directory; a frontend-only build does not prove installer contents. Media and templates now load from a distinct origin, so CSP and packaged tests must cover that origin. The relevant checks are `apps/desktop/build/media.test.ts`, `apps/desktop/packaged/build.spec.ts`, `apps/desktop/packaged/import.spec.ts`, `apps/desktop/packaged/security.spec.ts`, and the Rust tests in `media_dir.rs`. This record does not claim those checks were rerun for the documentation change.

See also [ADR-066](ADR-066-packaging-and-hardening.md) for earlier packaging and security decisions.
