import { expect, test } from "vitest";
import { en } from "../../shared/strings/en";
import { exportWarnings, flawNotices, greyAnswer, greyCard, syncNotices } from "./maker";
import type { FoundFlaw } from "./packages";

const t = en.packages;

test("the card of a package in the grey zone: its doubts, two choices, none recommended (Q536)", () => {
  const card = greyCard({
    name: "nanoidd",
    version: "1.0.0",
    description: "Tiny ids.",
    doubts: [{ kind: "young", days: 30 }, { kind: "few-downloads", downloads: 3 }, { kind: "no-repository" }],
  });
  expect(card).toEqual({
    question:
      "The agent wants to add the package nanoidd 1.0.0 to the website: Tiny ids.\n\nSpaka has doubts about it: it was first published 30 days ago; it was downloaded 3 times last week; it links to no source repository.",
    header: "Package",
    options: [
      { label: "Install it", description: t.installHint },
      { label: "Don't install it", description: t.dontInstallHint },
    ],
    multiSelect: false,
  });
  expect(card.options.some((o) => /recommended/i.test(o.label))).toBe(false);
  const choice = (chosen: string) => ({ answer: { kind: "choices" as const, answers: { [card.question]: chosen } } });
  expect(greyAnswer(card, choice("Install it"))).toEqual({ install: true });
  expect(greyAnswer(card, choice("Don't install it"))).toEqual({ install: false });
  expect(greyAnswer(card, choice("Only if it is MIT"))).toEqual({ install: false, words: "Only if it is MIT" });
  expect(greyAnswer(card, { answer: { kind: "words", text: "Use another" } })).toEqual({
    install: false,
    words: "Use another",
  });
  expect(greyAnswer(card, { answer: { kind: "skipped" } })).toEqual({ install: false });
  expect(greyAnswer(card, undefined)).toBeUndefined();
});

test("the notices after package.json changed by hand (Q536, Q540)", () => {
  expect(
    syncNotices({
      installed: [
        { name: "nanoid", version: "5.1.16", doubts: [] },
        { name: "nanoidd", version: "1.0.0", doubts: [{ kind: "similar", to: "nanoid" }] },
      ],
      refused: [
        { name: "mine", specifier: "github:me/mine", why: { kind: "elsewhere" } },
        {
          name: "lodash",
          specifier: "4.17.20",
          why: {
            kind: "rules",
            refusals: [
              {
                kind: "flaw",
                flaw: { id: "GHSA-1", summary: "Prototype pollution", fixed: "4.17.21", malicious: false },
              },
            ],
          },
        },
        { name: "sqlite3", specifier: "^6", why: { kind: "rules", refusals: [{ kind: "compiles", script: "x" }] } },
        { name: "young", specifier: "1.0.0", why: { kind: "problem", text: "young 1.0.0 was published today." } },
      ],
      removed: ["left-pad"],
      notes: [],
    }),
  ).toEqual([
    "Took mine out of package.json: it does not come from npm's registry, the only place Spaka installs packages from for now.",
    "Took lodash out of package.json: it has a known flaw, Prototype pollution (GHSA-1), fixed in 4.17.21.",
    "Took sqlite3 out of package.json: it compiles native code when it is installed, which Spaka never runs.",
    "Took young out of package.json: young 1.0.0 was published today.",
    "Installed the package nanoid 5.1.16 from package.json.",
    "Installed the package nanoidd 1.0.0 from package.json, although its name is close to nanoid, a well-known package.",
    "Removed left-pad, which package.json no longer lists.",
  ]);
  expect(syncNotices({ installed: [], refused: [], removed: ["x"], notes: [], failed: "pnpm said no." })).toEqual([
    "Spaka could not install the packages of package.json: pnpm said no.",
  ]);
});

test("a flaw's notice, one per version, and its button asking the agent for the update (Q538)", () => {
  const flaw = (id: string, fixed?: string) => ({
    id,
    summary: `Flaw ${id}`,
    ...(fixed ? { fixed } : {}),
    malicious: false,
  });
  const found: FoundFlaw[] = [
    { name: "nanoid", version: "5.1.6", via: ["nanoid"], flaw: flaw("GHSA-a", "5.1.16") },
    { name: "nanoid", version: "5.1.6", via: ["nanoid"], flaw: flaw("GHSA-b", "5.1.11") },
    { name: "esbuild", version: "0.24.0", via: ["vite", "wrangler"], flaw: flaw("GHSA-c") },
  ];
  expect(flawNotices(found)).toEqual([
    {
      text: "nanoid 5.1.6 has known flaws: Flaw GHSA-a (GHSA-a); Flaw GHSA-b (GHSA-b). They are fixed in 5.1.16.",
      action: {
        label: "Ask for the update",
        tip: t.askUpdateTip,
        message: "Update the package nanoid to 5.1.16 or later, to be rid of the known flaws GHSA-a, GHSA-b.",
      },
    },
    {
      text: "esbuild 0.24.0, which vite brings, has a known flaw: Flaw GHSA-c (GHSA-c). No version fixes it yet.",
      action: {
        label: "Ask for the update",
        tip: t.askUpdateTip,
        message: "Update the package vite, so that esbuild, which it brings, no longer has the known flaw GHSA-c.",
      },
    },
  ]);
  expect(exportWarnings(found.slice(0, 1))).toEqual([
    "The package nanoid 5.1.6 has a known flaw: Flaw GHSA-a (GHSA-a), fixed in 5.1.16.",
  ]);
});
