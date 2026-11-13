// A template as a .zip (Q236): read without a library, stored or deflated
// entries only, never a path outside the template, never more than it may
// hold; written the same way, byte for byte the same for the same files, so
// that a release's checksum names its contents.
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

export type ZipLimits = { files: number; bytes: number };

/** What a template may hold, unpacked. */
export const ZIP_LIMITS: ZipLimits = { files: 2000, bytes: 200 * 1024 * 1024 };

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const UTF8 = 0x0800;

/** A path a template may hold: relative, forward slashes, nothing that climbs out. */
export function safePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("\\") || /^[a-z]:/i.test(path)) return false;
  return path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

/** The files of a .zip, by path. Folders, macOS's __MACOSX/ and .DS_Store are left out. */
export function readZip(zip: Buffer, limits: ZipLimits = ZIP_LIMITS): Map<string, Buffer> {
  let end = -1;
  for (let at = zip.length - 22; at >= Math.max(0, zip.length - 22 - 0xffff); at--)
    if (zip.readUInt32LE(at) === EOCD) {
      end = at;
      break;
    }
  if (end < 0) throw new Error("This is not a .zip file.");
  const count = zip.readUInt16LE(end + 10);
  const offset = zip.readUInt32LE(end + 16);
  if (count === 0xffff || offset === 0xffffffff) throw new Error("This .zip is too large (ZIP64) for a template.");
  if (count > limits.files) throw new Error(`This .zip holds more than ${limits.files} files.`);

  const files = new Map<string, Buffer>();
  let total = 0;
  let at = offset;
  for (let i = 0; i < count; i++) {
    if (at + 46 > zip.length || zip.readUInt32LE(at) !== CENTRAL) throw new Error("This .zip is damaged.");
    const flags = zip.readUInt16LE(at + 8);
    const method = zip.readUInt16LE(at + 10);
    const crc = zip.readUInt32LE(at + 16);
    const packed = zip.readUInt32LE(at + 20);
    const size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const extra = zip.readUInt16LE(at + 30);
    const comment = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extra + comment;

    if (name.endsWith("/")) continue;
    if (name.startsWith("__MACOSX/") || name.split("/").at(-1) === ".DS_Store") continue;
    if (!safePath(name)) throw new Error(`This .zip holds a file outside the template: ${name}`);
    if (flags & 1) throw new Error("This .zip is encrypted.");
    if (method !== 0 && method !== 8) throw new Error(`${name} is compressed in a way Upstart does not read.`);
    total += size;
    if (total > limits.bytes) throw new Error(`This .zip holds more than ${limits.bytes / 1024 / 1024} MB.`);

    if (local + 30 > zip.length || zip.readUInt32LE(local) !== LOCAL) throw new Error("This .zip is damaged.");
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(start, start + packed);
    if (data.length !== packed) throw new Error("This .zip is damaged.");
    let bytes: Buffer;
    try {
      bytes = method === 0 ? Buffer.from(data) : inflateRawSync(data, { maxOutputLength: Math.max(size, 1) });
    } catch {
      throw new Error(`${name} is damaged in this .zip.`);
    }
    if (bytes.length !== size || crc32(bytes) >>> 0 !== crc) throw new Error(`${name} is damaged in this .zip.`);
    files.set(name, bytes);
  }
  return files;
}

/** A .zip of these files, in path order, deflated, dated 1980-01-01 so that the same files make the same bytes. */
export function writeZip(files: Map<string, Buffer>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const path of [...files.keys()].sort()) {
    if (!safePath(path)) throw new Error(`Not a path a template may hold: ${path}`);
    const bytes = files.get(path)!;
    const name = Buffer.from(path, "utf8");
    const packed = deflateRawSync(bytes, { level: 9 });
    const crc = crc32(bytes) >>> 0;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(LOCAL, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(UTF8, 6);
    head.writeUInt16LE(8, 8);
    head.writeUInt16LE(0, 10); // 00:00
    head.writeUInt16LE(0x21, 12); // 1980-01-01
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(packed.length, 18);
    head.writeUInt32LE(bytes.length, 22);
    head.writeUInt16LE(name.length, 26);
    head.writeUInt16LE(0, 28);
    locals.push(head, name, packed);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(CENTRAL, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(UTF8, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0, 12);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(bytes.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    centrals.push(entry, name);
    offset += 30 + name.length + packed.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(EOCD, 0);
  end.writeUInt16LE(files.size, 8);
  end.writeUInt16LE(files.size, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}
