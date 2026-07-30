// 의존성 없는 최소 ZIP 리더/라이터.
// 쓰기: 무압축(STORE)만 사용 — 백업 내용물이 mp3/webm/jpg라 이미 압축돼 있어 다시 압축해도 안 줄어든다.
// 읽기: STORE + DEFLATE 둘 다 지원(맥 Finder에서 압축 풀었다 다시 압축한 파일도 읽히도록).
// 라이브러리를 안 쓴 이유: 앱을 완전 로컬·무의존으로 유지하기 위해서.

const enc = new TextEncoder()
const dec = new TextDecoder()

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_EOCD = 0x06054b50
const MAX_ZIP_BYTES = 0xffffffff // 4GB — 넘으면 ZIP64가 필요한데 지원하지 않는다

let table: Uint32Array | null = null
function crcTable(): Uint32Array {
  if (table) return table
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  table = t
  return t
}

export function crc32(buf: Uint8Array): number {
  const t = crcTable()
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** JS Date → DOS 형식 (1980년 이전은 1980-01-01로 절삭) */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(d.getFullYear(), 1980)
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

/** TS 버전에 따라 Uint8Array가 제네릭(ArrayBufferLike)이라 Blob 인자로 바로 안 들어간다 */
export const asBlobPart = (u: Uint8Array): BlobPart => u as unknown as BlobPart

export interface ZipEntry {
  name: string // zip 안의 경로 (예: "audio/log-zh/1.webm")
  data: Uint8Array
}

/** 엔트리 배열 → zip Blob (무압축) */
export function createZip(entries: ZipEntry[], now = new Date()): Blob {
  const { time, date } = dosDateTime(now)
  const parts: BlobPart[] = []
  const central: Uint8Array[] = []
  let offset = 0

  for (const e of entries) {
    const name = enc.encode(e.name)
    const crc = crc32(e.data)
    const size = e.data.length

    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, SIG_LOCAL, true)
    lv.setUint16(4, 20, true) // version needed
    lv.setUint16(6, 0x0800, true) // flag: 파일명 UTF-8
    lv.setUint16(8, 0, true) // method: store
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true)
    lv.setUint32(22, size, true)
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true)
    local.set(name, 30)

    const cd = new Uint8Array(46 + name.length)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0, SIG_CENTRAL, true)
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    cv.setUint16(30, 0, true) // extra len
    cv.setUint16(32, 0, true) // comment len
    cv.setUint16(34, 0, true) // disk start
    cv.setUint16(36, 0, true) // internal attrs
    cv.setUint32(38, 0, true) // external attrs
    cv.setUint32(42, offset, true)
    cd.set(name, 46)

    parts.push(asBlobPart(local), asBlobPart(e.data))
    central.push(cd)
    offset += local.length + size
    if (offset > MAX_ZIP_BYTES) {
      throw new Error('백업이 4GB를 넘어 zip으로 만들 수 없어요. 오래된 녹음을 정리한 뒤 다시 시도해 주세요.')
    }
  }

  const cdSize = central.reduce((n, c) => n + c.length, 0)
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, SIG_EOCD, true)
  ev.setUint16(4, 0, true)
  ev.setUint16(6, 0, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, cdSize, true)
  ev.setUint32(16, offset, true)
  ev.setUint16(20, 0, true)

  if (entries.length > 0xffff) throw new Error('백업 파일 개수가 65535개를 넘어 zip으로 만들 수 없어요.')

  return new Blob([...parts, ...central.map(asBlobPart), asBlobPart(eocd)], { type: 'application/zip' })
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as any).DecompressionStream
  if (!DS) throw new Error('이 브라우저는 압축된 zip을 읽을 수 없어요. 내보내기로 만든 원본 파일을 그대로 넣어 주세요.')
  const stream = new Blob([asBlobPart(data)]).stream().pipeThrough(new DS('deflate-raw'))
  const buf = await new Response(stream).arrayBuffer()
  return new Uint8Array(buf)
}

/** zip 바이트 → { 경로: 내용 } (디렉터리 엔트리는 제외) */
export async function readZip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)

  // EOCD 찾기 (주석이 최대 65535바이트라 뒤에서부터 탐색)
  let eocd = -1
  const start = Math.max(0, bytes.length - 22 - 0xffff)
  for (let i = bytes.length - 22; i >= start; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('zip 파일이 아니거나 파일이 손상됐어요.')

  const count = view.getUint16(eocd + 10, true)
  let ptr = view.getUint32(eocd + 16, true)
  if (count === 0xffff || ptr === 0xffffffff) {
    throw new Error('ZIP64 형식은 지원하지 않아요. 백업을 나눠서 다시 만들어 주세요.')
  }

  const out = new Map<string, Uint8Array>()
  for (let i = 0; i < count; i++) {
    if (view.getUint32(ptr, true) !== SIG_CENTRAL) throw new Error('zip 목차가 손상됐어요.')
    const method = view.getUint16(ptr + 10, true)
    const crc = view.getUint32(ptr + 16, true)
    const csize = view.getUint32(ptr + 20, true)
    const usize = view.getUint32(ptr + 24, true)
    const nameLen = view.getUint16(ptr + 28, true)
    const extraLen = view.getUint16(ptr + 30, true)
    const commentLen = view.getUint16(ptr + 32, true)
    const localOff = view.getUint32(ptr + 42, true)
    const name = dec.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen))
    ptr += 46 + nameLen + extraLen + commentLen

    if (name.endsWith('/')) continue // 디렉터리
    if (name.startsWith('__MACOSX/') || name.split('/').pop()?.startsWith('._')) continue // 맥 리소스 포크

    if (view.getUint32(localOff, true) !== SIG_LOCAL) throw new Error(`"${name}" 항목이 손상됐어요.`)
    const lNameLen = view.getUint16(localOff + 26, true)
    const lExtraLen = view.getUint16(localOff + 28, true)
    const dataStart = localOff + 30 + lNameLen + lExtraLen
    const raw = bytes.subarray(dataStart, dataStart + csize)

    let data: Uint8Array
    if (method === 0) data = raw
    else if (method === 8) data = await inflateRaw(raw)
    else throw new Error(`"${name}"의 압축 방식(${method})을 지원하지 않아요.`)

    if (data.length !== usize || crc32(data) !== crc) {
      throw new Error(`"${name}" 내용이 손상됐어요. 백업 파일을 다시 확인해 주세요.`)
    }
    out.set(name, data)
  }
  return out
}
