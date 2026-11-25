// The gate in front of the Pi harness's shell where it has no sandbox, on
// Windows (Q381, Q382), after Pi's own permission-gate example: a plain file
// command on the project's files runs at once, any other waits for the
// maker's approval. It is no confinement: it only tells apart the commands
// Spaka asks the agent for (rm data/hours/monday.md) from all the others.
import { posix, win32 } from "node:path";

/** The commands that run at once when every path they name is in the project. */
const FILE_COMMANDS = new Set(["rm", "rmdir", "mv", "cp", "mkdir", "touch", "ls", "cat", "head", "tail", "wc"]);
/** Those that take no path: what they print is all they do. */
const PRINTS = new Set(["echo", "pwd"]);
/** Those whose paths must not be the project itself, nor all of its top folder. */
const REMOVES = new Set(["rm", "rmdir", "mv"]);
/** What a plain command has none of, outside quotes: pipes, redirections, substitutions, groups, the home folder. */
const SPECIAL = new Set([...("|&<>()`$" + "{}\\~")]);
/** The folders of the project that are Spaka's own, or git's. */
const KEPT = new Set([".spaka", ".git"]);

/**
 * Splits a command into simple commands (joined by &&, ; or new lines) of
 * words, the quotes taken off. Undefined for anything more: pipes,
 * redirections, substitutions, variables, subshells, backgrounding, braces,
 * the home folder's ~, or a backslash outside quotes.
 */
export function simpleCommands(command: string): string[][] | undefined {
  const commands: string[][] = [[]];
  let word: string | undefined;
  const end = () => {
    if (word !== undefined) commands.at(-1)!.push(word);
    word = undefined;
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i]!;
    if (c === "'" || c === '"') {
      const close = command.indexOf(c, i + 1);
      if (close < 0) return undefined;
      const inside = command.slice(i + 1, close);
      if (c === '"' && /[$`\\]/.test(inside)) return undefined;
      word = (word ?? "") + inside;
      i = close;
    } else if (c === " " || c === "\t") end();
    else if (c === "\n" || c === ";" || (c === "&" && command[i + 1] === "&")) {
      end();
      if (c === "&") i++;
      if (commands.at(-1)!.length) commands.push([]);
    } else if (SPECIAL.has(c)) return undefined;
    else word = (word ?? "") + c;
  }
  end();
  const all = commands.filter((words) => words.length);
  return all.length ? all : undefined;
}

/**
 * Whether a command runs without asking the maker: only plain file commands
 * (rm, mv, cp, mkdir, ls, cat and the like), every path inside the project's
 * folder and outside its .spaka and .git; nothing that removes the project
 * itself or all of its top folder.
 */
export function safeCommand(command: string, root: string, platform: NodeJS.Platform = process.platform): boolean {
  const commands = simpleCommands(command);
  if (!commands) return false;
  const path = platform === "win32" ? win32 : posix;
  const top = path.resolve(root);
  for (const [name, ...args] of commands) {
    if (PRINTS.has(name!)) continue;
    if (!FILE_COMMANDS.has(name!)) return false;
    for (const arg of args) {
      if (arg.startsWith("-")) continue;
      const at = path.resolve(top, nativePath(arg, platform));
      const rel = path.relative(top, at);
      if (rel.startsWith("..") || path.isAbsolute(rel)) return false;
      const parts = rel.split(/[\\/]/);
      if (KEPT.has(parts[0]!)) return false;
      if (REMOVES.has(name!) && (rel === "" || (parts.length === 1 && /[*?]/.test(parts[0]!)))) return false;
    }
  }
  return true;
}

/** Git Bash's /c/Users/… as Windows writes it, C:\Users\…; other paths as they are. */
function nativePath(arg: string, platform: NodeJS.Platform): string {
  if (platform !== "win32") return arg;
  const drive = /^\/([a-zA-Z])(\/.*)?$/.exec(arg);
  return drive ? `${drive[1]!.toUpperCase()}:${(drive[2] ?? "/").replaceAll("/", "\\")}` : arg;
}
