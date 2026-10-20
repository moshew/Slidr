# ADR-097 — Images are made while the agent goes on

Status: Implemented on 2026-10-16.

## Context

The user saw a deck being built on GitHub Copilot stop at every image: the chat showed "Generating an image · slide 2" at work and "Thinking…" under it, and nothing else happened for most of a minute. The diagnostics log of that session (2026-10-15) shows why. The agent asked for the image of each slide together with the next slide, as the prompt wants: `image_generate` and `slide_create_from_html` started in the same breath. The slide was made in a second; the image took 38 seconds for slide 1 and 47 for slide 2. A harness gives the model the results of the calls it made at once only when all of them are back, so the model waited for the image every time. That is so for every harness, not only Copilot's.

`image_generate` and `image_fill_placeholders` returned only once the images were made and placed, so that their result could say what was made.

## Decision

An image that goes into an element is asked for, and the call returns at once. The image goes into the element when it is ready, in the same turn and the same undo step.

- **Background work of a turn.** `Background` (`packages/agent-tools/src/background.ts`) holds the work a turn's calls leave running after their results, with the slides each one changes. `startTurn` takes one; the chat's turns have one, and no other turn does (the gallery's picks, the e2e helpers, the eval), so their calls still wait for all their work.
- **`ctx.later(slideIds, work, meanwhile)`.** A tool hands over the rest of its work: in a turn with a `Background` the call returns `meanwhile`, and the work goes on. Its final result is made as the call's would have been, with the write summary and the lint findings, and the result of the call carries it as `later`, which the bridge does not send. Without a `Background` the call waits for the work and returns its result.
- **Which calls.** `image_generate` with `elementId`, and `image_fill_placeholders`, return `making` (the slides and elements) and a note. `image_generate` without an element (images the agent places itself) or with `optionsFor` (images the user picks from) still waits: the agent needs their ids. `image_edit` waits too: its result says what kind of edit the provider made, which the agent must tell the user.
- **The agent is told.** The result of the agent's next call carries `meanwhile`, a list of the calls whose work ended since: the tool, its input, and its result or its error. A failure carries it at the end of its message. Each is told once.
- **A picture waits.** `slide_render` and `deck_render_contact_sheet` wait for the work on the slides they show (`looksAt`). The chat waits before it takes the mark of the look (`DeckApi.ready`), so that a picture taken after an image arrived counts as a look at the slide with it.
- **The turn waits.** When the agent says it is done, the chat waits for the images still being made before the design check, since a write after the turn's end is refused. The chat shows the call at work meanwhile. Stop ends the wait; the images that come later write nothing.
- **The chip.** The chip of such a call stays at work after the harness reports the call finished, and ends as the image did, with the final result as its summary. It takes its slide from `making`.
- **The prompt.** The deck chat is told that an image arrives about a minute after it is asked for: ask for a slide's image as soon as the slide exists, build on, and look at the slides with images last.

## Consequences

- A deck with images is built in about the time of its slides, not of its slides and images one after another.
- A picture of a slide taken right after its image was asked for still waits for the image. The prompt says to look at those slides last.
- The image call no longer returns a preview of the image; the agent sees it in the picture of its slide.
- A bad image the agent never looks at is known only from `meanwhile`. A slide whose image arrived after the agent last looked is unseen, and the design check sends the agent back to look at it.
- No time limit is kept in the Deck API, which has no timers (SPEC 14.2): the providers end every run within 240 seconds, with an error when they must.
- The tool listing grew by about 260 characters, and the deck prompt by about 270; both stay within their budgets.

## Checks

- `packages/agent-tools/src/services.test.ts`: in a turn with a `Background`, `image_generate` into an element returns at once with `making`, and the image goes in when it comes, in the turn's transaction; the next result tells of it once; a picture of a slide waits for that slide's image and not for another's; a failed image is told at the end of a failing call's message; nothing is written once the turn is over; `image_fill_placeholders` returns at once and fills its placeholders later; an image without an element is still waited for.
- `desktop/src/agent/agentService.test.ts`: the call after the image runs while it is made, the image's chip stays at work until the image is in, and the picture after it needs no second look; a turn that ends before its image waits for it, and the design check sends the agent back to look at the slide; Stop ends the wait, and the image that comes later goes nowhere. With the wait at the turn's end taken out, the last two fail.
