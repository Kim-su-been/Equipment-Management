// UTF-8 ZIP using the standard STORE method. Originals are included without conversion.
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++)
    crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}
export const safeFilename = (value) =>
  String(value)
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
    .replace(/^\.+$/, "_")
    .slice(0, 120);
export function makeZip(files) {
  const chunks = [],
    directory = [];
  let offset = 0,
    directorySize = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.name),
      bytes = file.bytes;
    const checksum = crc32(bytes);
    const header = new Uint8Array(30 + name.length),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x800, true);
    h.setUint32(14, checksum, true);
    h.setUint32(18, bytes.length, true);
    h.setUint32(22, bytes.length, true);
    h.setUint16(26, name.length, true);
    header.set(name, 30);
    const central = new Uint8Array(46 + name.length),
      c = new DataView(central.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true);
    c.setUint32(16, checksum, true);
    c.setUint32(20, bytes.length, true);
    c.setUint32(24, bytes.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.set(name, 46);
    chunks.push(header, bytes);
    directory.push(central);
    offset += header.length + bytes.length;
    directorySize += central.length;
  }
  if (files.length > 65535 || offset + directorySize >= 0xffffffff)
    throw new Error("다운로드 가능한 ZIP 크기를 초과했습니다.");
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, directorySize, true);
  e.setUint32(16, offset, true);
  return new Blob([...chunks, ...directory, end], { type: "application/zip" });
}
