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
from collections.abc import Sequence
from pathlib import Path

from .config import REPO, WEB, Settings
from .languages import NAMES, SCRIPT, files, listing, names
from .programs import creation_flags, find_node

#: The script tags of the font catalog, by name.
SCRIPT_NAMES = {
    "he": "Hebrew",
    "latin": "Latin",
    "arabic": "Arabic",
    "cyrillic": "Cyrillic",
    "vietnamese": "Vietnamese",
    "devanagari": "Devanagari",
    "japanese": "Japanese",
    "korean": "Korean",
    "chinese": "Chinese",
}
#: The font of Windows that draws a language's letters when no family of the library has them.
SYSTEM_FONTS = {"ja": "Yu Gothic", "ko": "Malgun Gothic", "zh-CN": "Microsoft YaHei", "hi": "Nirmala UI"}

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


def _has(font: dict, script: str) -> bool:
    tags = font.get("scripts") or []
    # A family the catalog tags with nothing is taken for a Latin one.
    return script in tags or (script == "latin" and not tags)


def fonts_text(fonts: list[dict], langs: Sequence[str]) -> str:
    """The library's families by the letters they have, for the scripts of a request's
    languages (the catalog's `scripts` tags), and how a file is set whose letters no family has:
    Japanese, Korean and Chinese always, and any other the catalog tags no family with."""
    scripts: dict[str, list[str]] = {}
    for lang in langs:
        scripts.setdefault(SCRIPT[lang], []).append(lang)
    lines: list[str] = []
    bare: list[str] = []
    for script, of in scripts.items():
        families = [f["family"] for f in fonts if _has(f, script)]
        lines.append(f"- {SCRIPT_NAMES[script]} ({files(of)}): {', '.join(families) or 'none'}")
        if not families:
            bare += of
    text = (
        "## Fonts\n\n"
        "These are the fonts the app has; no other font will be there when a user inserts the "
        "design. Name them exactly as written. By the letters they have:\n\n"
        + "\n".join(lines)
        + "\n\nSet the text of each file in a family that has its letters: Hebrew text in a family "
        "with Hebrew. A left-to-right file may use a family without Hebrew for display type, paired "
        "with a Hebrew one in the Hebrew file."
    )
    if bare:
        # The generic family last: the browser then draws the letters the family lacks in the same
        # font when it converts the HTML as when the app draws the slide, which ends every run's
        # font list in `sans-serif`. Without it the conversion measures other letters and keeps
        # the text as HTML.
        systems = [f"{SYSTEM_FONTS[lang]} for {NAMES[lang]}" for lang in bare if lang in SYSTEM_FONTS]
        latin = [f for f in fonts if _has(f, "latin")]
        example = next((f["family"] for f in latin if "he" not in f["scripts"]), None) or next(
            (f["family"] for f in latin), "Inter"
        )
        text += (
            f"\n\nNo family of the library has {names(bare, 'or')} letters. In {files(bare)}, every "
            "element with text names one family of the library, for the Latin letters and the "
            f"figures, then the generic `sans-serif`, and nothing else: `font-family: '{example}', "
            "sans-serif`. Name no system font: it is not in the library, and a deck does not carry "
            "it. The app draws the letters the family lacks in the system's sans serif for the "
            "language" + (f" (on Windows, {listing(systems)})" if systems else "") + ": choose a "
            "family whose Latin sits well beside it."
        )
    return text


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")
