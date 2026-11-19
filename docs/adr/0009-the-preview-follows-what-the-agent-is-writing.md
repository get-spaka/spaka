---
status: accepted; measured on macOS under subscription sign-in only, not under an API key
---

# The preview follows what the agent is writing, before the files reach the disk

The agent writes plain files ([ADR 0001](0001-project-is-a-folder-of-plain-files.md)), and the app does not wait for them. It reads the content of every file the agent writes or edits while that content is still being streamed, keeps the unfinished file in an overlay above the project folder, cuts it at the last complete point, closes what is still open, renders it with the runtime and morphs the result into the preview, at most every 60 ms. Matt chose this on 2026-11-10, by eye on the recordings of the live-generation spike ([report](../spikes/live-generation.md)).

Waiting for the files cannot work: the agent writes all the files of a build in a single response, and they reach the disk only when that response ends. Following the stream, the spike measured a first visible change after a median of 1.9 s (within 3 s in 15 runs of 15), a first section started within 10 s in 15 of 15, a complete home page after a median of 21 s, and never more than 1.9 s without movement on screen.

## Considered options

- **Instructions**: the agent emits instructions that build the page directly, and the files are written afterwards. The page looks complete sooner (17 s), then nothing moves for 14 to 33 s while the files are written. It costs 1.7 times the output tokens, met the 3 s target in 10 runs of 15, and in 4 of 15 the page rendered from the files differed from the one the maker had watched.
- **Files, then reload**: the preview refreshes when a file is complete. Nothing shows for 16 to 40 s, then everything at once.

## Consequences

- The approach rests on two details of the agent tool: it streams a tool call's input while the model is writing it, and a file's path comes before its content in that input. If either changes, what is left is "files, then reload". Neither alternative is built as a fallback.
- A file changed by a shell command is not seen while it changes. It is picked up from the disk when the command ends.
- The agent's instructions carry part of the experience: the theme first, then the home page, then what the home page uses, one write per file.
- A first section is started within 10 s, but complete within 10 s in only 6 runs of 15.
- Thinking before the first write is what breaks the 3 s target. The spike ran with the agent tool's default effort; the maker's effort setting, medium by default, applies from the first message, and its effect on that target has not been measured.
- Only Sonnet 5.5 went through the full set of runs. Under an API key the stream was not measured.
