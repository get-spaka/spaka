import { describe, expect, test } from "vitest";
import { safeCommand, simpleCommands } from "./bash-gate";

describe("the simple commands of a command line", () => {
  test("words, quotes taken off, joined by &&, ; or new lines", () => {
    expect(simpleCommands("rm -f data/hours/monday.md 'data/a b.md' && ls data;cat \"x.md\"\nwc -l y")).toEqual([
      ["rm", "-f", "data/hours/monday.md", "data/a b.md"],
      ["ls", "data"],
      ["cat", "x.md"],
      ["wc", "-l", "y"],
    ]);
  });

  test("nothing more: pipes, redirections, substitutions, variables, subshells, backgrounding", () => {
    for (const line of [
      "cat a | sh",
      "echo x > a",
      "cat < a",
      "rm $(cat list)",
      "rm `cat list`",
      "rm $HOME/x",
      'echo "$HOME"',
      "(rm a)",
      "rm a &",
      "rm a || true",
      "rm {a,b}",
      "rm -rf ~/x",
      "rm C:\\Users\\x",
      "rm 'unclosed",
    ])
      expect(simpleCommands(line), line).toBeUndefined();
  });
});

describe("the commands that run without asking (Q382)", () => {
  const root = "/Users/x/Upstart/fleur";

  test("file commands on the project's files", () => {
    expect(safeCommand("rm -f data/hours/monday.md data/hours/sunday.md", root, "darwin")).toBe(true);
    expect(safeCommand("rm -rf data/services && mkdir -p data/new", root, "darwin")).toBe(true);
    expect(safeCommand("mv data/a.md data/b.md", root, "darwin")).toBe(true);
    expect(safeCommand("cp parts/hero.liquid parts/hero-2.liquid", root, "darwin")).toBe(true);
    expect(safeCommand("ls data/hours/*.md", root, "darwin")).toBe(true);
    expect(safeCommand(`cat ${root}/pages/index.liquid`, root, "darwin")).toBe(true);
    expect(safeCommand("echo done", root, "darwin")).toBe(true);
  });

  test("anything else is asked", () => {
    expect(safeCommand("node build.mjs", root, "darwin")).toBe(false);
    expect(safeCommand("curl https://example.com", root, "darwin")).toBe(false);
    expect(safeCommand("cd data && rm a.md", root, "darwin")).toBe(false);
    expect(safeCommand("FOO=1 rm a.md", root, "darwin")).toBe(false);
    expect(safeCommand("rm ../other/a.md", root, "darwin")).toBe(false);
    expect(safeCommand("cat /etc/passwd", root, "darwin")).toBe(false);
    expect(safeCommand("rm -rf ~", root, "darwin")).toBe(false);
    expect(safeCommand("", root, "darwin")).toBe(false);
  });

  test("Upstart's own folder, git's, the project itself and all of its top folder are asked", () => {
    expect(safeCommand("rm -rf .upstart/adaptation", root, "darwin")).toBe(false);
    expect(safeCommand("cat .git/config", root, "darwin")).toBe(false);
    expect(safeCommand("rm -rf .", root, "darwin")).toBe(false);
    expect(safeCommand(`rm -rf ${root}`, root, "darwin")).toBe(false);
    expect(safeCommand("rm -rf *", root, "darwin")).toBe(false);
    expect(safeCommand("mv * data", root, "darwin")).toBe(false);
    expect(safeCommand("ls", root, "darwin")).toBe(true);
    expect(safeCommand("ls *", root, "darwin")).toBe(true);
  });

  test("on Windows, Git Bash's paths and Windows' own", () => {
    const winRoot = "C:\\Users\\x\\Documents\\Upstart\\fleur";
    expect(safeCommand("rm -f data/hours/monday.md", winRoot, "win32")).toBe(true);
    expect(safeCommand("rm /c/Users/x/Documents/Upstart/fleur/data/a.md", winRoot, "win32")).toBe(true);
    expect(safeCommand("rm 'C:\\Users\\x\\Documents\\Upstart\\fleur\\data\\a.md'", winRoot, "win32")).toBe(true);
    expect(safeCommand("rm -rf /c/Users/x", winRoot, "win32")).toBe(false);
    expect(safeCommand("rm -rf /d/other", winRoot, "win32")).toBe(false);
    expect(safeCommand("rm 'C:\\Windows\\System32\\x.dll'", winRoot, "win32")).toBe(false);
  });
});
