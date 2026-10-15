"""The work of a request: plan concepts, then make each one a design.

```text
request ──plan (Claude, structured)──► N concepts ──► one variant each, side by side:
variant: picture (Codex) ─► HTML in two languages (Claude, looking at the picture)
         ─► render + design check (headless, the app's engine) ─► review rounds (Claude looks
         at the renders and fixes) ─► ready: the person approves, or asks for a change
```

Each variant keeps one Claude conversation, so a review or a change asked for later is a turn
of the same session, with everything it saw before.
"""

from __future__ import annotations

import asyncio
import hashlib
import re
import uuid
from collections.abc import Coroutine
from pathlib import Path
from typing import Any

from PIL import Image

from . import claude_cli, codex_cli, prompts
from .config import Settings
from .instructions import Instructions, quality_bar
from .library import Library
from .render import forget_old, render_dir, snap
from .store import RUNNING, Store, read_json, write_json

TOOLS = ["Read", "Write", "Edit", "Glob"]
WATCHED = ("he.html", "en.html", "brief.json")
ASPECTS = set(codex_cli.SHAPES)
SLUG = re.compile(r"[^a-z0-9]+")


class StudioError(Exception):
    pass


def slugify(text: str) -> str:
    return SLUG.sub("-", text.lower()).strip("-")[:40] or "design"


def unique_id(slug: str, taken: set[str]) -> str:
    base = f"m-{slugify(slug)}"
    candidate, n = base, 2
    while candidate in taken:
        candidate = f"{base}-{n}"
        n += 1
    taken.add(candidate)
    return candidate


def fingerprint(work: Path) -> dict[str, str | None]:
    return {
        name: hashlib.sha256((work / name).read_bytes()).hexdigest() if (work / name).exists() else None
        for name in WATCHED
    }


def picture_size(path: Path) -> tuple[int, int]:
    with Image.open(path) as image:
        return image.size


def has_errors(result: dict) -> bool:
    if not result.get("publishable"):
        return True
    return any(
        f.get("severity") == "error"
        for side in (result.get("langs") or {}).values()
        for f in side.get("findings") or []
    )


class Studio:
    def __init__(
        self, settings: Settings, store: Store, instructions: Instructions, library: Library
    ) -> None:
        self.settings = settings
        self.store = store
        self.instructions = instructions
        self.library = library
        self.claude_slots = asyncio.Semaphore(settings.max_claude)
        self.codex_slots = asyncio.Semaphore(settings.max_codex)
        self.render_slots = asyncio.Semaphore(settings.max_render)
        self.tasks: dict[str, asyncio.Task] = {}

    # ------------------------------------------------------------------ tasks

    def _spawn(self, key: str, work: Coroutine[Any, Any, None]) -> None:
        if key in self.tasks and not self.tasks[key].done():
            work.close()
            raise StudioError("This is already running.")
        task = asyncio.create_task(work)
        self.tasks[key] = task
        task.add_done_callback(lambda _t: self.tasks.pop(key, None) if self.tasks.get(key) is _t else None)

    def cancel(self, key: str) -> bool:
        task = self.tasks.get(key)
        if task and not task.done():
            task.cancel()
            return True
        return False

    def busy(self, key: str) -> bool:
        task = self.tasks.get(key)
        return bool(task and not task.done())

    # ------------------------------------------------------------------ prompts

    async def _system_files(self, folder: Path) -> tuple[Path, Path]:
        app = await self.instructions.app()
        fonts = await self.instructions.fonts()
        quality = quality_bar()
        folder.mkdir(parents=True, exist_ok=True)
        plan = folder / "system-plan.md"
        design = folder / "system-design.md"
        plan.write_text(prompts.system_prompt(app, quality, fonts, with_html=False), encoding="utf-8")
        design.write_text(prompts.system_prompt(app, quality, fonts, with_html=True), encoding="utf-8")
        return plan, design

    # ------------------------------------------------------------------ requests

    def start_request(self, data: dict) -> dict:
        request = self.store.create_request(data)
        self._spawn(request["id"], self._plan(request, int(data["count"])))
        return request

    def more(self, rid: str, count: int) -> dict:
        request = self.store.requests.get(rid)
        if not request:
            raise StudioError("No such request.")
        if self.busy(rid):
            raise StudioError("Concepts are being planned for this request already.")
        request["status"] = "planning"
        request["error"] = None
        self.store.save_request(request)
        self._spawn(rid, self._plan(request, count))
        return request

    async def _plan(self, request: dict, count: int) -> None:
        store = self.store
        try:
            known = await self.library.known()
            taken = set(known["ids"]) | store.all_design_ids()
            plan_dir = store.request_dir(request["id"]) / "plan"
            system_plan, _ = await self._system_files(plan_dir)
            made = [
                f"{v['brief']['name']['en']}: {v['brief'].get('concept', '')}"
                for v in (store.variants.get(vid) for vid in request["variantIds"])
                if v
            ]
            prompt = prompts.plan_prompt(
                request["prompt"], count, known["groups"], sorted(taken), request.get("group") or None
            )
            if made:
                prompt += (
                    "\n\nThis request already has these designs; the new ones must differ from "
                    "each of them:\n" + "\n".join(f"- {m}" for m in made)
                )
            async with self.claude_slots:
                result = await claude_cli.run(
                    claude_cli.ClaudeCall(
                        prompt=prompt,
                        cwd=plan_dir,
                        system_prompt_file=system_plan,
                        tools=[],
                        session_id=str(uuid.uuid4()),
                        model=request.get("model") or None,
                        effort=request.get("effort") or None,
                        json_schema=prompts.PLAN_SCHEMA,
                        timeout=20 * 60,
                    )
                )
            concepts = (result.structured or {}).get("concepts") if isinstance(result.structured, dict) else None
            if not concepts:
                raise StudioError("The plan came back without concepts.")
            request["cost"] = round(request.get("cost", 0) + result.cost, 4)
            request["plan"] = (request.get("plan") or []) + concepts[:count]
            request["status"] = "ready"
            store.save_request(request)
            for concept in concepts[:count]:
                brief = self._brief(concept, taken, request.get("group") or None)
                variant = store.create_variant(request, len(request["variantIds"]), brief)
                self._spawn(variant["id"], self._make(variant))
        except asyncio.CancelledError:
            request["status"] = "cancelled"
            store.save_request(request)
            raise
        except Exception as error:  # noqa: BLE001
            request["status"] = "failed"
            request["error"] = str(error)
            store.save_request(request)

    @staticmethod
    def _brief(concept: dict, taken: set[str], group: str | None) -> dict:
        image = concept.get("image") or {}
        return {
            "id": unique_id(concept.get("slug") or concept["name"]["en"], taken),
            "name": concept["name"],
            "group": slugify(group or concept.get("group") or "designs"),
            "groupName": concept.get("groupName") or {},
            "concept": concept.get("concept", ""),
            "art": concept.get("art", ""),
            "copy": concept.get("copy", {}),
            "image": {
                "prompt": image.get("prompt", ""),
                "aspect": image.get("aspect") if image.get("aspect") in ASPECTS else "wide",
            },
        }

    def delete_request(self, rid: str) -> None:
        request = self.store.requests.get(rid)
        if not request:
            return
        self.cancel(rid)
        for vid in request["variantIds"]:
            self.cancel(vid)
        self.store.delete_request(rid)

    # ------------------------------------------------------------------ variants

    def _variant(self, vid: str) -> dict:
        variant = self.store.variants.get(vid)
        if not variant:
            raise StudioError("No such variant.")
        return variant

    def _set(self, variant: dict, status: str, stage: str | None = None) -> None:
        variant["status"] = status
        variant["stage"] = stage
        if status not in ("failed",):
            variant["error"] = None
        self.store.save_variant(variant)

    def _options(self, variant: dict) -> dict:
        return self.store.requests.get(variant["requestId"]) or {}

    async def _guard(self, variant: dict, work: Coroutine[Any, Any, None]) -> None:
        try:
            await work
            self._set(variant, "ready")
        except asyncio.CancelledError:
            self.store.log(variant, "error", "Stopped.", save=False)
            self._set(variant, "cancelled")
            raise
        except Exception as error:  # noqa: BLE001
            variant["error"] = str(error)
            self.store.log(variant, "error", str(error), save=False)
            self._set(variant, "failed")

    async def _make(self, variant: dict) -> None:
        await self._guard(variant, self._make_steps(variant))

    async def _make_steps(self, variant: dict) -> None:
        work = self.store.work_dir(variant)
        work.mkdir(parents=True, exist_ok=True)
        if not (work / "brief.json").exists():
            write_json(work / "brief.json", variant["brief"])
        if not (work / "subject.png").exists():
            await self._image(variant)
        if not (variant.get("sessionId") and (work / "he.html").exists() and (work / "en.html").exists()):
            variant["sessionId"] = None
            await self._turn(
                variant, "writing", prompts.build_prompt(variant["brief"], picture_size(work / "subject.png"))
            )
            await self._apply_brief(variant)
        result = await self._render(variant)
        rounds = int(self._options(variant).get("reviewRounds", 2))
        while variant["reviews"] < rounds:
            variant["reviews"] += 1
            changed = await self._turn(
                variant, "reviewing", prompts.review_prompt(result, variant["reviews"], rounds, self._renders(variant))
            )
            if not changed:
                self.store.log(variant, "info", "Claude reviewed the renders and changed nothing.")
                break
            await self._apply_brief(variant)
            result = await self._render(variant)
        # The contract is not a matter of taste: a design that breaks it gets one turn to mend it,
        # whatever number of review rounds was asked for.
        if not result.get("publishable"):
            self.store.log(variant, "info", "The design breaks the gallery's contract; Claude fixes it.")
            if await self._turn(variant, "reviewing", prompts.fix_prompt(result, self._renders(variant))):
                await self._apply_brief(variant)
                await self._render(variant)

    @staticmethod
    def _renders(variant: dict) -> str:
        """The latest render's folder, as Claude names it from its own folder."""
        return f"renders/r{variant['revision']}"

    async def _turn(self, variant: dict, stage: str, prompt: str) -> bool:
        """One turn of the variant's Claude session. True when it changed a file."""
        work = self.store.work_dir(variant)
        _, system_design = await self._system_files(self.store.variant_dir(variant))
        before = fingerprint(work)
        self._set(variant, stage, "waiting for Claude")
        async with self.claude_slots:
            self._set(variant, stage, None)
            first = not variant.get("sessionId")
            if first:
                variant["sessionId"] = str(uuid.uuid4())
            options = self._options(variant)

            def activity(kind: str, text: str) -> None:
                self.store.log(variant, kind, text)

            result = await claude_cli.run(
                claude_cli.ClaudeCall(
                    prompt=prompt,
                    cwd=work,
                    system_prompt_file=system_design,
                    tools=TOOLS,
                    session_id=variant["sessionId"] if first else None,
                    resume=None if first else variant["sessionId"],
                    model=options.get("model") or None,
                    effort=options.get("effort") or None,
                ),
                activity,
            )
        variant["cost"] = round(variant.get("cost", 0) + result.cost, 4)
        if result.session_id:
            variant["sessionId"] = result.session_id
        if result.text:
            self.store.log(variant, "claude", result.text[:1500], save=False)
        self.store.save_variant(variant)
        after = fingerprint(work)
        if not ((work / "he.html").exists() and (work / "en.html").exists()):
            raise StudioError("Claude did not write he.html and en.html.")
        return before != after

    async def _apply_brief(self, variant: dict) -> None:
        """Takes what Claude changed in brief.json: names and group, or a new picture."""
        work = self.store.work_dir(variant)
        brief = read_json(work / "brief.json")
        if not isinstance(brief, dict):
            write_json(work / "brief.json", variant["brief"])
            return
        current = variant["brief"]
        for key in ("name", "groupName"):
            value = brief.get(key)
            if isinstance(value, dict) and isinstance(value.get("he"), str) and isinstance(value.get("en"), str):
                current[key] = {"he": value["he"].strip(), "en": value["en"].strip()}
        if isinstance(brief.get("group"), str) and brief["group"].strip():
            current["group"] = slugify(brief["group"])
        image = brief.get("image")
        edit = brief.get("imageEdit")
        if isinstance(edit, str) and edit.strip():
            brief.pop("imageEdit", None)
            write_json(work / "brief.json", {**brief, "id": current["id"]})
            await self._image(variant, edit=edit.strip())
        elif isinstance(image, dict) and isinstance(image.get("prompt"), str):
            wanted = {
                "prompt": image["prompt"].strip(),
                "aspect": image.get("aspect") if image.get("aspect") in ASPECTS else "wide",
            }
            if wanted != current.get("image"):
                current["image"] = wanted
                await self._image(variant)
        self.store.save_variant(variant)

    async def _image(self, variant: dict, edit: str | None = None) -> None:
        work = self.store.work_dir(variant)
        image = variant["brief"]["image"]
        self._set(variant, "image", "waiting for Codex")
        fresh = work / "subject.next.png"
        async with self.codex_slots:
            self._set(variant, "image", None)
            if edit:
                self.store.log(variant, "image", f"Changing the picture: {edit}")
            else:
                self.store.log(variant, "image", f"Making the picture ({image['aspect']}): {image['prompt']}")
            for attempt in (1, 2):
                try:
                    await codex_cli.make_image(
                        edit or image["prompt"],
                        fresh,
                        aspect=image["aspect"],
                        reference=(work / "subject.png") if edit else None,
                    )
                    break
                except codex_cli.CodexError as error:
                    if attempt == 2 or error.kind != "generation_failed":
                        raise
                    self.store.log(variant, "error", f"{error} Trying once more.")
        fresh.replace(work / "subject.png")
        w, h = picture_size(work / "subject.png")
        variant["imageRevision"] = int(variant.get("imageRevision", 0)) + 1
        variant["image"] = {"width": w, "height": h, "revision": variant["imageRevision"], **image}
        self.store.log(variant, "image", f"The picture is ready ({w}×{h}).")

    async def _render(self, variant: dict) -> dict:
        work = self.store.work_dir(variant)
        self._set(variant, "rendering", "waiting for the browser")
        async with self.render_slots:
            self._set(variant, "rendering", None)
            variant["revision"] = int(variant.get("revision", 0)) + 1
            result = await snap(
                self.settings, variant["id"], variant["revision"], render_dir(work, variant["revision"])
            )
            forget_old(work, variant["revision"])
        findings = [
            f for side in (result.get("langs") or {}).values() for f in side.get("findings") or []
        ]
        issues = list(result.get("issues") or []) + [
            i for side in (result.get("langs") or {}).values() for i in side.get("issues") or []
        ]
        variant["render"] = {
            "revision": variant["revision"],
            "imageRevision": variant.get("imageRevision", 0),
            "publishable": bool(result.get("publishable")),
            "errors": sum(1 for f in findings if f.get("severity") == "error"),
            "warnings": sum(1 for f in findings if f.get("severity") != "error"),
            "issues": len(issues),
            "editability": {
                lang: side.get("editability") for lang, side in (result.get("langs") or {}).items()
            },
        }
        if variant.get("approved"):
            variant["approved"] = False
            self.store.log(variant, "info", "The design changed, so its approval was withdrawn.", save=False)
        summary = (
            f"Rendered revision {variant['revision']}: "
            f"{variant['render']['errors']} errors, {variant['render']['warnings']} warnings, "
            f"{len(issues)} contract issues."
        )
        self.store.log(variant, "render", summary)
        return result

    # ------------------------------------------------------------------ actions

    def retry(self, vid: str) -> None:
        variant = self._variant(vid)
        if variant["status"] in RUNNING:
            raise StudioError("It is running.")
        variant["error"] = None
        self._set(variant, "queued")
        self._spawn(vid, self._make(variant))

    def refine(self, vid: str, feedback: str) -> None:
        variant = self._variant(vid)
        if variant["status"] in RUNNING:
            raise StudioError("Wait for it to finish, or stop it.")
        if not variant.get("sessionId"):
            raise StudioError("This variant has no design to change yet; retry it first.")
        self.store.log(variant, "feedback", feedback)
        self._set(variant, "queued")
        self._spawn(vid, self._guard(variant, self._refine_steps(variant, feedback)))

    async def _refine_steps(self, variant: dict, feedback: str) -> None:
        await self._turn(variant, "writing", prompts.feedback_prompt(feedback))
        await self._apply_brief(variant)
        result = await self._render(variant)
        if has_errors(result):
            if await self._turn(variant, "reviewing", prompts.fix_prompt(result, self._renders(variant))):
                await self._apply_brief(variant)
                await self._render(variant)

    def new_image(self, vid: str, instruction: str | None) -> None:
        variant = self._variant(vid)
        if variant["status"] in RUNNING:
            raise StudioError("Wait for it to finish, or stop it.")
        self._set(variant, "queued")

        async def steps() -> None:
            await self._image(variant, edit=instruction or None)
            await self._render(variant)

        self._spawn(vid, self._guard(variant, steps()))

    def approve(self, vid: str, approved: bool) -> None:
        variant = self._variant(vid)
        if approved:
            if variant["status"] != "ready":
                raise StudioError("Only a finished design can be approved.")
            if not (variant.get("render") or {}).get("publishable"):
                raise StudioError("Its last render did not pass the gallery's contract; ask for a fix first.")
        variant["approved"] = approved
        self.store.log(variant, "approval", "Approved for publishing." if approved else "Approval withdrawn.")

    def discard(self, vid: str, discarded: bool) -> None:
        variant = self._variant(vid)
        self.cancel(vid)
        variant["discarded"] = discarded
        if discarded:
            variant["approved"] = False
        self.store.save_variant(variant)

    def render_input(self, vid: str) -> dict:
        variant = self._variant(vid)
        work = self.store.work_dir(variant)
        missing = [n for n in ("he.html", "en.html", "subject.png") if not (work / n).exists()]
        if missing:
            raise StudioError(f"Not written yet: {', '.join(missing)}")
        w, h = picture_size(work / "subject.png")
        return {
            "id": variant["id"],
            "designId": variant["designId"],
            "revision": variant.get("revision", 0),
            "html": {
                "he": (work / "he.html").read_text(encoding="utf-8"),
                "en": (work / "en.html").read_text(encoding="utf-8"),
            },
            "image": {
                "url": f"/api/variants/{vid}/files/subject.png?r={variant.get('imageRevision', 0)}",
                "width": w,
                "height": h,
            },
        }

