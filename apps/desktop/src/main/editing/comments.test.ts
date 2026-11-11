import { expect, test } from "vitest";
import { Comments, commentsMessage } from "./comments";

const base = {
  route: "/",
  file: "pages/index.liquid",
  line: 4,
  at: 120,
  label: "heading “Chez Margot”",
  snippet: '<h1 class="x">Chez Margot</h1>',
};

test("comments are added, changed, emptied away and kept per project", () => {
  const comments = new Comments();
  const [a] = comments.save("p1", { ...base, text: " Warmer please " });
  expect(a).toMatchObject({ text: "Warmer please" });
  comments.save("p1", { ...base, at: 300, text: "Bigger" });
  expect(comments.save("p1", { ...base, id: a!.id, text: "Warmer" }).map((c) => c.text)).toEqual(["Warmer", "Bigger"]);
  expect(comments.save("p1", { ...base, id: a!.id, text: "  " }).map((c) => c.text)).toEqual(["Bigger"]);
  expect(comments.list("p2")).toEqual([]);
  comments.clear("p1");
  expect(comments.list("p1")).toEqual([]);
});

test("one message: a numbered list for the maker, the elements' places for the agent", () => {
  const message = commentsMessage([
    { ...base, id: "1", text: "Warmer" },
    {
      ...base,
      id: "2",
      route: "/menu",
      line: 9,
      label: "button “Order”",
      snippet: '<a class="btn">Order</a>',
      text: "Link it to the phone",
    },
  ]);
  expect(message.shown).toBe("1. heading “Chez Margot” (/): Warmer\n2. button “Order” (/menu): Link it to the phone");
  expect(message.forAgent).toContain("2 comments");
  expect(message.forAgent).toContain(
    'On page /menu, the element at pages/index.liquid:9:\n   <a class="btn">Order</a>\n   Comment: Link it to the phone',
  );
});
