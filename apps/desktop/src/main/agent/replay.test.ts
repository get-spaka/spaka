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
