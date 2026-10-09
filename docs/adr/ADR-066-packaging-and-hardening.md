# ADR-066 — Apply production security and packaging gates

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

The first packaged Tauri build used a restrictive CSP, limited window capabilities, diagnostic logging, failure handling, and packaged-app test suites. Scripts in sandboxed HTML objects require a page nonce; free deck content stays under the renderer's security boundary. The source record measured seven performance targets on a Windows build but did not run the installer itself. Later bundled-media packaging changes the release resource layout ([ADR-074](ADR-074-packaged-media-library.md)), so a current release must check that directory again.
