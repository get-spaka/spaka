// Puts the recordings of several runs next to each other, all starting at the
// moment the request was sent, so the approaches can be compared by eye.
//
//   node src/measure/side-by-side.ts <out name> <run dir> <run dir> [<run dir>]
//
// Needs ffmpeg on the machine. Throwaway spike code.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const [name, ...dirs] = process.argv.slice(2);
if (!name || dirs.length < 2) throw new Error("usage: side-by-side.ts <out name> <run dir> <run dir> [<run dir>]");

const inputs: string[] = [];
const filters: string[] = [];
const width = dirs.length === 2 ? 960 : 640;
dirs.forEach((dir, i) => {
  const run = JSON.parse(readFileSync(path.join(root, dir, "run.json"), "utf8"));
  if (!run.recording) throw new Error(`${dir} has no recording`);
  // Each recording starts a little before its request: cut that lead so that all start at t = 0.
  inputs.push("-ss", (run.videoLeadMs / 1000).toFixed(3), "-i", path.join(root, run.recording));
  filters.push(`[${i}:v]scale=${width}:-2,setsar=1,fps=25[v${i}]`);
});
const out = path.join(root, "recordings", `${name}.mp4`);
execFileSync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-y",
    ...inputs,
    "-filter_complex", `${filters.join(";")};${dirs.map((_, i) => `[v${i}]`).join("")}hstack=inputs=${dirs.length}[out]`,
    "-map", "[out]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "21", "-movflags", "+faststart", out,
  ],
  { stdio: "inherit" },
);
console.log(path.relative(root, out));
