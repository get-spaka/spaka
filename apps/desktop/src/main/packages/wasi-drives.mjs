// Loaded before the build host, and in each of its threads (Q557): on Windows,
// Rolldown's WebAssembly reads only paths that begin with "/", where the WASI
// it is given opens the drive of the folder it runs in as "D:\". Each drive is
// opened instead as /c, /d…, which build-host.mjs translates to and from, and
// the target of a link (an absolute Windows path in pnpm's junctions, a
// relative one with backslashes in its symbolic links) is handed to it in
// that form. Elsewhere, nothing changes.
import { existsSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";

const wasi = createRequire(import.meta.url)("node:wasi");
if (process.platform === "win32" && !wasi.WASI.spakaDrives) {
  const drives = [..."CDEFGHIJKLMNOPQRSTUVWXYZ"].filter((letter) => existsSync(`${letter}:\\`));
  const Original = wasi.WASI;
  wasi.WASI = class WASI extends Original {
    static spakaDrives = drives;
    constructor(options = {}) {
      const preopens = Object.fromEntries(drives.map((letter) => [`/${letter.toLowerCase()}`, `${letter}:\\`]));
      super({ ...options, preopens });
      const readlink = this.wasiImport.path_readlink;
      // path_readlink(fd, path, path_len, buf, buf_len, bufused): the target rewritten in place.
      this.wasiImport.path_readlink = (fd, path, pathLength, buf, bufLength, bufUsed) => {
        const errno = readlink(fd, path, pathLength, buf, bufLength, bufUsed);
        if (errno !== 0 || !this.spakaMemory) return errno;
        const memory = Buffer.from(this.spakaMemory.buffer);
        const used = memory.readUInt32LE(bufUsed);
        const target = memory.toString("utf8", buf, buf + used);
        // An absolute target, D:\a\b (a junction), as /d/a/b; a relative one, ..\b (a
        // symbolic link, as pnpm 12 makes where Windows lets it), as ../b.
        const match = /^(\\\\\?\\)?([A-Za-z]):\\/.exec(target);
        const rest = (match ? target.slice(match[0].length) : target).replaceAll("\\", "/");
        const guest = Buffer.from(match ? `/${match[2].toLowerCase()}/${rest}` : rest);
        if (guest.equals(memory.subarray(buf, buf + used))) return errno;
        if (guest.length > bufLength) return errno;
        guest.copy(memory, buf);
        memory.writeUInt32LE(guest.length, bufUsed);
        return errno;
      };
    }
    initialize(instance) {
      this.spakaMemory = instance.exports.memory;
      return super.initialize(instance);
    }
    start(instance) {
      this.spakaMemory = instance.exports.memory;
      return super.start(instance);
    }
  };
  syncBuiltinESMExports();
}
