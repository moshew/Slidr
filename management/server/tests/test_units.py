"""Unit tests of the parts that need no CLI, browser or network."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import pytest
from PIL import Image

from slidr_manager import claude_cli, codex_cli, prompts
from slidr_manager.library import empty_catalog, merge_design, to_webp
from slidr_manager.pipeline import has_errors, slugify, unique_id


# ---------------------------------------------------------------- Claude Code


def test_claude_command_line_names_tools_and_session():
    call = claude_cli.ClaudeCall(
        prompt="x",
        cwd=Path("."),
        system_prompt_file=Path("system.md"),
        tools=["Read", "Write"],
        session_id="abc",
        model="opus",
        json_schema={"type": "object"},
    )
    args = claude_cli.build_args("claude", call)
    assert args[:4] == ["claude", "-p", "--output-format", "stream-json"]
    assert "--restricted" in args and "--strict-mcp-config" in args
    assert args[args.index("--tools") + 1] == "Read,Write"
    assert args[args.index("--allowedTools") + 1 : args.index("--allowedTools") + 3] == ["Read", "Write"]
    assert args[args.index("--session-id") + 1] == "abc"
    assert "--resume" not in args
    assert json.loads(args[args.index("--json-schema") + 1]) == {"type": "object"}


def test_claude_resume_and_no_tools():
    call = claude_cli.ClaudeCall(prompt="x", cwd=Path("."), system_prompt_file=Path("s.md"), resume="abc")
    args = claude_cli.build_args("claude", call)
    assert args[args.index("--tools") + 1] == ""
    assert "--allowedTools" not in args
    assert args[args.index("--resume") + 1] == "abc"


def test_claude_transcript_reads_the_stream():
    seen: list[tuple[str, str]] = []
    transcript = claude_cli.Transcript(lambda kind, text: seen.append((kind, text)))
    lines = [
        {"type": "system", "subtype": "init", "session_id": "s1"},
        {"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": "Write", "input": {"file_path": "C:\\w\\he.html"}},
            {"type": "text", "text": "  Wrote both files. "},
        ]}},
        {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "StructuredOutput", "input": {}}]}},
        {"type": "result", "subtype": "success", "result": "done", "session_id": "s1", "structured_output": {"a": 1}},
    ]
    for line in lines:
        transcript.read(json.dumps(line))
    transcript.read("not json")
    assert transcript.session_id == "s1"
    assert transcript.result and transcript.result["structured_output"] == {"a": 1}
    assert seen == [("tool", "Write he.html"), ("text", "Wrote both files.")]


# ---------------------------------------------------------------- Codex


def test_codex_prompt_and_command_line_follow_the_app():
    prompt = codex_cli.generate_prompt("  a barn  ", "square")
    assert prompt.startswith("Use your image generation tool.")
    assert prompt.endswith("Create ONE square 1:1 image: a barn")
    args = codex_cli.build_args("codex", prompt, Path("ref.png"))
    assert args[1:9] == ["exec", "--json", "--skip-git-repo-check", "--ignore-user-config",
                         "--ignore-rules", "--ephemeral", "-s", "read-only"]
    # The prompt comes before -i, which would take what follows it as files.
    assert args.index(prompt) < args.index("-i")


def test_codex_transcript_and_failures():
    transcript = codex_cli.Transcript()
    for line in [
        {"type": "thread.started", "thread_id": "01a0-ff"},
        {"type": "item.completed", "item": {"type": "agent_message", "text": "C:\\x\\exec-1.png"}},
        {"type": "turn.completed"},
    ]:
        transcript.read(json.dumps(line))
    assert transcript.thread_id == "01a0-ff" and transcript.completed
    bad = codex_cli.Transcript()
    bad.read(json.dumps({"type": "thread.started", "thread_id": "../../etc"}))
    assert bad.thread_id is None
    assert codex_cli.classify("401 Unauthorized") == "not_logged_in"
    assert codex_cli.classify("You've hit your usage limit") == "quota"
    assert codex_cli.classify("something else") == "generation_failed"


def test_codex_pick_prefers_the_named_file(tmp_path: Path):
    older, newer = tmp_path / "exec-1.png", tmp_path / "exec-2.png"
    older.write_bytes(b"1")
    newer.write_bytes(b"2")
    past = time.time() - 100
    os.utime(older, (past, past))
    assert codex_cli.pick([older, newer], None) == newer
    assert codex_cli.pick([older, newer], f"saved {older}") == older
    assert codex_cli.pick([], "x") is None


# ---------------------------------------------------------------- the catalog


def design(did: str, group: str, name: str = "N") -> dict:
    return {
        "id": did,
        "name": {"he": name, "en": name},
        "group": group,
        "groupName": {"he": group, "en": group},
        "slides": {"he": {"id": "a"}, "en": {"id": "b"}},
        "subject": [1, 2],
        "size": [3, 4],
    }


def test_merge_adds_replaces_and_moves_between_groups():
    catalog = empty_catalog()
    merge_design(catalog, design("m-a", "invites"))
    merge_design(catalog, design("m-b", "invites"))
    merge_design(catalog, design("m-c", "sales"))
    assert catalog["groups"] == ["invites", "sales"]
    assert catalog["groupIds"] == {"invites": ["m-a", "m-b"], "sales": ["m-c"]}
    # Replaced in place, names and all.
    merge_design(catalog, design("m-a", "invites", "New"))
    assert catalog["groupIds"]["invites"] == ["m-a", "m-b"]
    assert catalog["names"]["m-a"] == {"he": "New", "en": "New"}
    # A design has one group; a group left empty goes.
    merge_design(catalog, design("m-c", "invites"))
    assert catalog["groups"] == ["invites"]
    assert catalog["groupIds"] == {"invites": ["m-a", "m-b", "m-c"]}
    assert "sales" not in catalog["groupNames"]
    assert catalog["sizes"]["m-c"] == [3, 4] and catalog["subjects"]["m-c"] == [1, 2]


def test_merge_keeps_the_names_a_group_was_published_with():
    catalog = empty_catalog()
    first = design("m-a", "invites")
    first["groupName"] = {"he": "הזמנות", "en": "Invitations"}
    merge_design(catalog, first)
    second = design("m-b", "invites")
    second["groupName"] = {"he": "אחר", "en": "Other"}
    merge_design(catalog, second)
    assert catalog["groupNames"]["invites"] == {"he": "הזמנות", "en": "Invitations"}


def test_webp_keeps_the_size(tmp_path: Path):
    png = tmp_path / "subject.png"
    Image.new("RGB", (64, 36), (10, 20, 30)).save(png)
    data, size = to_webp(png)
    assert data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    assert size == (64, 36)


# ---------------------------------------------------------------- ids and prompts


def test_ids_are_slugs_with_the_managed_prefix_and_unique():
    assert slugify("Garden Wedding!! 2") == "garden-wedding-2"
    taken = {"m-garden"}
    assert unique_id("garden", taken) == "m-garden-2"
    assert unique_id("garden", taken) == "m-garden-3"
    assert "m-garden-3" in taken


def test_findings_reach_the_review_prompt():
    result = {
        "publishable": False,
        "issues": ["No point of the picture lies on top."],
        "langs": {
            "he": {"issues": [], "findings": [{"severity": "error", "rule": "L01", "message": "overflow"}],
                   "editability": 1, "notes": []},
            "en": {"issues": ["Only 2 blocks"], "findings": [], "editability": 0.5, "notes": ["kept html"]},
        },
    }
    text = prompts.review_prompt(result, 1, 2, "renders/r3")
    assert "renders/r3/he-thumb.png" in text
    assert "- he · error · L01: overflow" in text
    assert "- en · contract: Only 2 blocks" in text
    assert "en 50% editable (notes: kept html)" in text
    assert has_errors(result)
    assert not has_errors({"publishable": True, "langs": {"he": {"findings": [{"severity": "warning"}]}}})


def test_system_prompt_carries_the_apps_instructions():
    app = {"design": "## Design guidelines\nDG", "html": "## Writing a slide as HTML\nHC"}
    fonts = [{"family": "Heebo", "scripts": ["he", "latin"]}, {"family": "Inter", "scripts": ["latin"]}]
    text = prompts.system_prompt(app, "QUALITY", fonts, with_html=True)
    for part in ("QUALITY", "DG", "HC", "data-asset=\"__subject__\"", "Heebo", "Latin only: Inter"):
        assert part in text
    plan = prompts.system_prompt(app, "QUALITY", fonts, with_html=False)
    assert "HC" not in plan and "## This folder" not in plan


@pytest.mark.parametrize("count", [1, 3])
def test_plan_prompt(count: int):
    text = prompts.plan_prompt("an invitation", count, [{"id": "invites", "he": "הזמנות", "en": "Invites"}],
                               ["m-x"], None)
    assert "an invitation" in text and "`invites`: הזמנות / Invites" in text and "m-x" in text
    assert ("Plan one design." in text) == (count == 1)
