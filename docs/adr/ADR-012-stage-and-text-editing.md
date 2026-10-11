# ADR-012 — Keep Stage interactions and text editing on the slide

Status: Adopted. This is the current English summary of the decision. The original implementation log remains available in Git history.

## Decision and current interpretation

Stage and Filmstrip are shell-independent components using the deck, `CommandBus`, and selection store. Geometry is in pure functions; drag, resize, rotation, arrow movement, and typing use grouped transactions, with Escape rolling an unfinished gesture back. TipTap takes the renderer's in-place text slot, preserving the displayed box geometry. Later decisions extend this to groups, crop, and active text-frame handles ([ADR-016](ADR-016-stage-crop-lines-groups.md) and [ADR-078](ADR-078-stage-editing-refinements.md)).

Pressing inside a text box opens editing immediately with the caret at the pressed position, whether the box stands alone or belongs to a group. Dragging that press selects text from its starting point, including movement made while the editor is mounting; the editor's coordinate mapping determines the selection in Hebrew, English, and across lines. Hovering editable text shows a text cursor before, during, and after editing. The text box's frame shows a move cursor and starts a move on press, including while the box is only hovered. Resize and rotation handles retain their own actions, and dragging an active editor's frame keeps its text open.
