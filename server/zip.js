// Minimal store-only ZIP writer — no dependencies, no compression. Isomorphic
// (Uint8Array + TextEncoder), so it runs both in Node and in the browser demo.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const _enc = new TextEncoder();
const asBytes = (s) => (typeof s === 'string' ? _enc.encode(s) : new Uint8Array(s));

function concat(arrays) {
  let len = 0;
  for (const a of arrays) len += a.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrays) { out.set(a, o); o += a.length; }
  return out;
}

// files: [{ name, data: string|Uint8Array }] -> Uint8Array of a valid .zip
export function makeZip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  const u16 = (n) => { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n & 0xFFFF, true); return b; };
  const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; };
  const DOS_TIME = 0, DOS_DATE = 0x21; // fixed 1980-01-01 → deterministic archives

  for (const f of files) {
    const name = asBytes(f.name);
    const data = asBytes(f.data);
    const crc = crc32(data);
    const local = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(DOS_TIME), u16(DOS_DATE),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data,
    ]);
    parts.push(local);
    central.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(DOS_TIME), u16(DOS_DATE),
      u32(crc), u32(data.length), u32(data.length), u16(name.length),
      u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    offset += local.length;
  }

  const centralBuf = concat(central);
  const end = concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralBuf.length), u32(offset), u16(0),
  ]);
  return concat([...parts, centralBuf, end]);
}
