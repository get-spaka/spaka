#!/usr/bin/env python3
"""Measurements for spike 2 (desktop shell), on the packaged apps.

  measure.py sizes    [shell ...]
  measure.py startup  electron|electrobun|electrobun-cef [runs]
  measure.py memory   electron|electrobun|electrobun-cef [idle seconds]
  measure.py first-launch [runs]            (Electrobun's self-extracting first start)

Every launch goes through `open` with an emptied environment, which is what
a start from Finder or the Dock gives an app. Results are printed as JSON
and saved under measure/results/.
"""
import ctypes
import json
import os
import re
import shutil
import statistics
import subprocess
import sys
import time
from pathlib import Path

# MEASURE_SUFFIX=-displayed keeps a second set of results beside the first.
SUFFIX = os.environ.get("MEASURE_SUFFIX", "")
ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "measure" / "results"
TMP = RESULTS / "tmp"

APPS = {
    "electron": {
        "app": ROOT / "electron/dist/mac-arm64/Upstart Spike Electron.app",
        "artifacts": [
            ROOT / "electron/dist/Upstart Spike Electron-0.0.1-arm64-mac.zip",
            ROOT / "electron/dist/Upstart Spike Electron-0.0.1-arm64.dmg",
        ],
        "claude": "Contents/Resources/app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude",
    },
    # The same Electron app with the preview in an <iframe> instead of a WebContentsView.
    "electron-iframe": {
        "app": ROOT / "electron/dist/mac-arm64/Upstart Spike Electron.app",
        "env": {"SPIKE_EMBED": "iframe"},
        "artifacts": [],
        "claude": "Contents/Resources/app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude",
    },
    # The WebContentsView embedding plus a transparent view for what the interface draws over the preview.
    "electron-overlay": {
        "app": ROOT / "electron/dist/mac-arm64/Upstart Spike Electron.app",
        "env": {"SPIKE_OVERLAY": "1"},
        "artifacts": [],
        "claude": "Contents/Resources/app.asar.unpacked/node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude",
    },
    "electrobun": {
        "app": ROOT / "electrobun/build/stable-macos-arm64/Upstart Spike Electrobun.app",
        "artifacts": [
            ROOT / "electrobun/artifacts/stable-macos-arm64-UpstartSpikeElectrobun.app.tar.zst",
            ROOT / "electrobun/artifacts/macos-arm64-UpstartSpikeElectrobun.dmg",
        ],
        "claude": "Contents/Resources/app/claude/claude",
    },
    # The same Electrobun app built with SPIKE_CEF=1: Chromium bundled.
    "electrobun-cef": {
        "app": ROOT / "electrobun/build-cef/stable-macos-arm64/Upstart Spike Electrobun CEF.app",
        "artifacts": [
            ROOT / "electrobun/artifacts-cef/stable-macos-arm64-UpstartSpikeElectrobunCEF.app.tar.zst",
            ROOT / "electrobun/artifacts-cef/macos-arm64-UpstartSpikeElectrobunCEF.dmg",
        ],
        "claude": "Contents/Resources/app/claude/claude",
    },
}

_libsystem = ctypes.CDLL("/usr/lib/libSystem.B.dylib")
_responsible = _libsystem.responsibility_get_pid_responsible_for_pid
_responsible.argtypes = [ctypes.c_int]
_responsible.restype = ctypes.c_int


def now_ms():
    return int(time.time() * 1000)


def sh(*args, **kwargs):
    return subprocess.run(args, capture_output=True, text=True, **kwargs).stdout


def processes():
    """[(pid, ppid, rss_kb, command)] for every process of this user."""
    rows = []
    for line in sh("ps", "-axo", "pid=,ppid=,rss=,command=").splitlines():
        parts = line.strip().split(None, 3)
        if len(parts) == 4:
            rows.append((int(parts[0]), int(parts[1]), int(parts[2]), parts[3]))
    return rows


def app_processes(app: Path):
    """The app's own processes, plus the system's web-engine helpers that
    macOS holds the app responsible for (WKWebView renders in XPC services
    that are children of launchd, not of the app)."""
    rows = processes()
    own = {pid for pid, _, _, command in rows if str(app) in command}
    found = []
    for pid, ppid, rss, command in rows:
        if pid in own:
            found.append((pid, rss, command, "own"))
        elif _responsible(pid) in own:
            found.append((pid, rss, command, "held responsible for"))
    return found


def footprint_kb(pid: int):
    """Physical footprint, the figure Activity Monitor shows as Memory."""
    out = sh("footprint", "-p", str(pid))
    match = re.search(r"Footprint:\s+([\d.]+)\s+(KB|MB|GB|B)", out)
    if not match:
        return None
    value = float(match.group(1))
    return round(value * {"B": 1 / 1024, "KB": 1, "MB": 1024, "GB": 1024 * 1024}[match.group(2)])


def launch(app: Path, out: Path, **env):
    if out.exists():
        shutil.rmtree(out)
    args = ["env", "-i", f"HOME={os.environ['HOME']}", f"USER={os.environ['USER']}", "/usr/bin/open", "-n"]
    for key, value in {"SPIKE_OUT": str(out), **env}.items():
        args += ["--env", f"{key}={value}"]
    started = now_ms()
    subprocess.run(args + [str(app)], check=True)
    return started


def marks(out: Path):
    path = out / "marks.jsonl"
    if not path.exists():
        return {}
    found = {}
    for line in path.read_text().splitlines():
        mark = json.loads(line)
        found.setdefault(mark["name"], mark["t"])
    return found


def wait_for_mark(out: Path, name: str, timeout=60):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if name in marks(out):
            return True
        time.sleep(0.05)
    return False


def wait_until_gone(app: Path, timeout=20):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if not app_processes(app):
            return True
        time.sleep(0.2)
    return False


def stop(app: Path):
    for pid, _, command, kind in app_processes(app):
        if kind == "own" and "/Contents/MacOS/" in command:
            try:
                os.kill(pid, 15)
            except ProcessLookupError:
                pass
    if not wait_until_gone(app, 8):
        for pid, _, _, kind in app_processes(app):
            if kind == "own":
                try:
                    os.kill(pid, 9)
                except ProcessLookupError:
                    pass


def screen_state():
    out = sh("ioreg", "-n", "Root", "-d1", "-a")
    return "locked" if "<key>CGSSessionScreenIsLocked</key>\n\t\t\t<true/>" in out or "IOConsoleLocked</key>\n\t<true/>" in out else "unlocked"


def summary(values):
    values = sorted(values)
    return {"median": round(statistics.median(values)), "min": values[0], "max": values[-1], "runs": len(values)}


# --- commands ---------------------------------------------------------------

def cmd_startup(shell, runs=10):
    app = APPS[shell]["app"]
    stop(app)
    rows = []
    for i in range(runs + 1):
        out = TMP / f"startup-{shell}-{i}"
        t0 = launch(app, out, SPIKE_EXIT_ON="preview-loaded", **APPS[shell].get("env", {}))
        if not wait_for_mark(out, "preview-loaded", 40):
            print(f"run {i}: no preview-loaded mark", file=sys.stderr)
            stop(app)
            continue
        found = marks(out)
        rows.append({name: t - t0 for name, t in found.items()})
        # Electrobun's first start leaves its unpacking launcher behind.
        if not wait_until_gone(app, 6):
            stop(app)
        time.sleep(0.5)
    first, rest = rows[0], rows[1:]  # the first run warms the disk cache
    result = {
        "shell": shell,
        "screen": screen_state(),
        "what": "milliseconds from `open` to each mark; warm starts",
        "warm_up_run": first,
        "runs": rest,
        "summary": {name: summary([r[name] for r in rest if name in r]) for name in ("main-start", "ui-mounted", "ui-painted", "preview-loaded") if any(name in r for r in rest)},
    }
    save(f"startup-{shell}{SUFFIX}", result)


def cmd_memory(shell, idle=30):
    app = APPS[shell]["app"]
    stop(app)
    out = TMP / f"memory-{shell}"
    launch(app, out, **APPS[shell].get("env", {}))
    if not wait_for_mark(out, "preview-loaded", 40):
        raise SystemExit("the app never reported its preview as loaded")
    time.sleep(idle)
    rows = []
    for pid, rss, command, kind in app_processes(app):
        # Label by executable: the part after Contents/MacOS/ up to the first argument.
        if "/Contents/MacOS/" in command:
            name = re.split(r" --| /", command.split("/Contents/MacOS/", 1)[1])[0]
        else:
            name = command.split("/")[-1]
        role = re.search(r"--type=([\w-]+)", command)
        rows.append({
            "pid": pid,
            "process": name[:70] + (f" [{role.group(1)}]" if role else ""),
            "attribution": kind,
            "footprint_mb": round((footprint_kb(pid) or 0) / 1024, 1),
            "rss_mb": round(rss / 1024, 1),
        })
    stop(app)
    result = {
        "shell": shell,
        "screen": screen_state(),
        "what": f"memory {idle} s after the preview finished loading, nothing touched",
        "processes": rows,
        "total_footprint_mb": round(sum(r["footprint_mb"] for r in rows), 1),
        "total_rss_mb": round(sum(r["rss_mb"] for r in rows), 1),
    }
    save(f"memory-{shell}{SUFFIX}", result)


def tree_bytes(path: Path):
    total = 0
    for root, _, files in os.walk(path):
        for name in files:
            full = os.path.join(root, name)
            if not os.path.islink(full):
                total += os.path.getsize(full)
    return total


def zstd_bytes(app: Path, exclude=None):
    tar = ["tar", "-cf", "-", "-C", str(app.parent)]
    if exclude:
        tar += ["--exclude", exclude]
    tar += [app.name]
    p1 = subprocess.Popen(tar, stdout=subprocess.PIPE)
    p2 = subprocess.Popen(["zstd", "-19", "-T0", "--long=27", "-c"], stdin=p1.stdout, stdout=subprocess.PIPE)
    p1.stdout.close()
    size = 0
    while chunk := p2.stdout.read(1 << 20):
        size += len(chunk)
    return size


def cmd_sizes(only=None):
    mb = lambda n: round(n / 1e6, 1)
    result = {"unit": "MB (10^6 bytes)", "shells": {}}
    previous = RESULTS / "sizes.json"
    if only and previous.exists():
        result["shells"] = json.loads(previous.read_text())["shells"]
    for shell, spec in APPS.items():
        if only and shell not in only:
            continue
        app = spec["app"]
        claude = app / spec["claude"]
        entry = {
            "app_on_disk": mb(tree_bytes(app)),
            "of_which_agent_binary": mb(claude.stat().st_size),
            "artifacts_as_built": {a.name: mb(a.stat().st_size) for a in spec["artifacts"] if a.exists()},
            "same_compressor_zstd19": {
                "whole_app": mb(zstd_bytes(app)),
                "without_agent_binary": mb(zstd_bytes(app, exclude="claude")),
            },
        }
        result["shells"][shell] = entry
        print(shell, json.dumps(entry), flush=True)
    save("sizes", result)


def cmd_first_launch(runs=3):
    """Electrobun's distributed app is a small launcher plus a compressed
    archive; the first start unpacks it in place before the app runs."""
    spec = APPS["electrobun"]
    dmg = spec["artifacts"][1]
    work = TMP / "first-launch"
    rows = []
    for i in range(runs):
        if work.exists():
            shutil.rmtree(work)
        work.mkdir(parents=True)
        mount = sh("hdiutil", "attach", "-nobrowse", "-readonly", str(dmg))
        volume = re.search(r"(/Volumes/.+)$", mount.strip().splitlines()[-1]).group(1)
        source = next(Path(volume).glob("*.app"))
        app = work / source.name
        subprocess.run(["cp", "-R", str(source), str(app)], check=True)
        subprocess.run(["hdiutil", "detach", volume], capture_output=True)
        before = tree_bytes(app)
        out = TMP / f"first-launch-{i}"
        t0 = launch(app, out, SPIKE_EXIT_ON="preview-loaded")
        ok = wait_for_mark(out, "preview-loaded", 90)
        found = marks(out)
        rows.append({
            "wrapper_mb": round(before / 1e6, 1),
            "unpacked_mb": round(tree_bytes(app) / 1e6, 1),
            **{name: t - t0 for name, t in found.items()},
            "completed": ok,
        })
        time.sleep(2)
        leftovers = [(pid, command[-60:]) for pid, _, command, kind in app_processes(app) if kind == "own"]
        rows[-1]["processes_left_after_quit"] = leftovers
        stop(app)
    shutil.rmtree(work, ignore_errors=True)
    save("first-launch-electrobun", {"screen": screen_state(), "what": "first start of the app as copied out of the DMG", "runs": rows})


def save(name, result):
    RESULTS.mkdir(parents=True, exist_ok=True)
    result = {"measured_at": time.strftime("%Y-%m-%d %H:%M:%S %z"), **result}
    (RESULTS / f"{name}.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "sizes":
        cmd_sizes(sys.argv[2:] or None)
    elif command == "startup":
        cmd_startup(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 10)
    elif command == "memory":
        cmd_memory(sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 30)
    elif command == "first-launch":
        cmd_first_launch(int(sys.argv[2]) if len(sys.argv) > 2 else 3)
    else:
        print(__doc__)
        sys.exit(1)
