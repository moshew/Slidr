"""The instructions the studio builds its prompts from, read from the app, never copied:

- the design guidelines and the HTML conventions the app gives its own design agent
  (`packages/prompts`, through `management/web/tools/instructions.mjs`);
- the repository's design quality instruction (`AGENTS.md`);
- the fonts of decks the media library offers (`fonts/catalog.json`).
"""

from __future__ import annotations

import asyncio
import json
import urllib.request
from pathlib import Path

from .config import REPO, WEB, Settings
from .programs import creation_flags, find_node

SOURCES = [
    REPO / "packages" / "prompts" / "src" / "design.ts",
    REPO / "packages" / "prompts" / "src" / "html.ts",
    REPO / "AGENTS.md",
]


class InstructionsError(Exception):
    pass


def _stamp() -> tuple[float, ...]:
    return tuple(p.stat().st_mtime if p.exists() else 0.0 for p in SOURCES)


def quality_bar() -> str:
    """AGENTS.md without its title."""
    text = (REPO / "AGENTS.md").read_text(encoding="utf-8")
    lines = [line for line in text.splitlines() if not line.startswith("# ")]
    return "\n".join(lines).strip()


def fetch_json(url: str, timeout: float = 20) -> object:
    request = urllib.request.Request(url, headers={"User-Agent": "slidr-studio"})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 (fixed site)
        return json.loads(response.read().decode("utf-8"))


class Instructions:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._app: dict | None = None
        self._stamp: tuple[float, ...] | None = None
        self._fonts: list[dict] | None = None
        self._lock = asyncio.Lock()

    async def app(self) -> dict:
        """`design` and `html`, as the app's prompt modules state them now."""
        async with self._lock:
            stamp = _stamp()
            if self._app is not None and stamp == self._stamp:
                return self._app
            node = find_node()
            if not node:
                raise InstructionsError("Node.js was not found; it reads the app's instructions.")
            process = await asyncio.create_subprocess_exec(
                str(node), str(WEB / "tools" / "instructions.mjs"),
                cwd=str(WEB),
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                creationflags=creation_flags(),
            )
            out, err = await asyncio.wait_for(process.communicate(), 120)
            if process.returncode != 0:
                raise InstructionsError(
                    "Could not read the app's instructions: " + err.decode("utf-8", "replace")[-800:]
                )
            self._app = json.loads(out.decode("utf-8"))
            self._stamp = stamp
            return self._app

    async def fonts(self) -> list[dict]:
        """The families of the library's deck fonts, each with the scripts it covers."""
        if self._fonts is None:
            url = self.settings.media_url.rstrip("/") + "/fonts/catalog.json"
            try:
                catalog = await asyncio.to_thread(fetch_json, url)
            except Exception as error:  # noqa: BLE001 - any failure means no catalog
                raise InstructionsError(f"Could not read the library's fonts ({url}): {error}")
            families = catalog.get("families") if isinstance(catalog, dict) else None
            if not isinstance(families, list) or not families:
                raise InstructionsError("The library's font catalog lists no families.")
            self._fonts = [
                {"family": f["family"], "scripts": list(f.get("scripts") or [])}
                for f in families
                if isinstance(f, dict) and isinstance(f.get("family"), str)
            ]
        return self._fonts


def fonts_text(fonts: list[dict]) -> str:
    hebrew = [f["family"] for f in fonts if "he" in f["scripts"]]
    latin_only = [f["family"] for f in fonts if "he" not in f["scripts"]]
    return (
        "## Fonts\n\n"
        "These are the fonts the app has; no other font will be there when a user inserts the "
        "design. Name them exactly as written.\n\n"
        f"- With Hebrew and Latin: {', '.join(hebrew)}\n"
        f"- Latin only: {', '.join(latin_only)}\n\n"
        "Hebrew text must be set in a family with Hebrew. The English file may use a Latin-only "
        "family for display type, paired with the Hebrew one in the Hebrew file."
    )


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")
