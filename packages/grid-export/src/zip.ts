/**
 * A minimal ZIP writer — stored entries, no compression.
 *
 * XLSX is a zip of XML parts, and this is the smallest correct way to produce
 * one without a dependency. Stored rather than deflated because a spreadsheet
 * of a few thousand clinical rows is small, and a deflate implementation is
 * far more code than the saving is worth in a 7 KB budget.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = (CRC_TABLE[(c ^ (bytes[i] as number)) & 0xff] as number) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/**
 * The limits of a classic (non-ZIP64) archive.
 *
 * ── WHY THESE ARE CHECKED RATHER THAN ASSUMED ───────────────────────────────
 *
 * The central directory stores the entry count in 16 bits and every size and
 * offset in 32. Past either, the fields silently WRAP: `setUint16(8, 70000)`
 * writes 4464 and the writer carries on producing a file that no reader can
 * open, with nothing anywhere saying so.
 *
 * A wide free-text export over a large set reaches 4 GB more easily than it
 * sounds — this writer stores entries uncompressed, so the archive is the sum
 * of the sheet XML, and XLSX inline strings are verbose.
 *
 * ZIP64 would raise the ceiling and is a different piece of work. Refusing at
 * the boundary is the honest interim: a caller gets a reason it can act on
 * (narrow the columns, page the export) instead of a corrupt download.
 */
export const ZIP_LIMITS = {
  /** 16-bit entry count in the end-of-central-directory record. */
  entries: 0xffff,
  /** 32-bit sizes and offsets throughout the central directory. */
  bytes: 0xffffffff,
} as const;

export class ZipTooLarge extends Error {
  readonly gridErrorCode = "export-refused" as const;
  constructor(readonly detail: string) {
    super(detail);
    this.name = "ZipTooLarge";
  }
}

export function zip(entries: readonly ZipEntry[]): Uint8Array {
  if (entries.length > ZIP_LIMITS.entries) {
    throw new ZipTooLarge(
      `${entries.length.toLocaleString()} entries exceeds the ${ZIP_LIMITS.entries.toLocaleString()} a ` +
        `classic archive can record; the count is a 16-bit field and would wrap silently.`,
    );
  }
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const size = entry.bytes.length;

    // BEFORE the checksum, which walks every byte. Refusing after hashing four
    // gigabytes is the same answer arrived at expensively — and the test that
    // covers this timed out until the order was right.
    //
    // Checked per entry AND against the running offset below: either can pass
    // on its own while the archive as a whole does not fit.
    if (size > ZIP_LIMITS.bytes) {
      throw new ZipTooLarge(
        `"${entry.name}" is ${size.toLocaleString()} bytes, past the 4 GB a classic archive can record.`,
      );
    }

    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true); // stored
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); // central directory header
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);

    locals.push(local, entry.bytes);
    centrals.push(central);
    offset += local.length + size;
  }

  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  if (offset > ZIP_LIMITS.bytes || centralSize > ZIP_LIMITS.bytes) {
    throw new ZipTooLarge(
      `the archive is ${(offset + centralSize).toLocaleString()} bytes, past the 4 GB a classic ` +
        `archive can address; its offsets are 32-bit fields and would wrap silently.`,
    );
  }

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, end];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
