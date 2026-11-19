import { expect, test } from "vitest";
import { relocated } from "./replay";

test("a recording's folder becomes this check's in every text, a Windows folder too", () => {
  const recorded = {
    type: "assistant",
    message: { content: [{ type: "tool_use", input: { file_path: "/private/var/rec/site/pages/index.liquid" } }] },
    cwd: "/private/var/rec/site",
    n: 3,
  };
  expect(relocated(recorded, "/private/var/rec/site", "C:\\Users\\x\\site")).toEqual({
    type: "assistant",
    message: { content: [{ type: "tool_use", input: { file_path: "C:\\Users\\x\\site/pages/index.liquid" } }] },
    cwd: "C:\\Users\\x\\site",
    n: 3,
  });
});

test("in a streamed tool input, JSON text, a Windows folder is escaped: the input still reads", () => {
  const input = { file_path: "/private/var/rec/site/pages/work.liquid", content: "<h1>Work</h1>" };
  const event = {
    type: "stream_event",
    event: { delta: { type: "input_json_delta", partial_json: JSON.stringify(input) } },
  };
  const moved = relocated(event, "/private/var/rec/site", "C:\\Users\\x\\site") as typeof event;
  expect(JSON.parse(moved.event.delta.partial_json)).toEqual({
    ...input,
    file_path: "C:\\Users\\x\\site/pages/work.liquid",
  });
});
