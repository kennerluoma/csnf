/* Read a .fig export (File → Save local copy) without Figma's API, and convert it to the REST
   `GET /files/:key` shape that extract.ts consumes. No quota, no plugin, no login.

   .fig = zip { canvas.fig, meta.json, thumbnail.png, images/<sha1> }. canvas.fig = "fig-kiwi" header,
   then two length-prefixed chunks (zstd or raw deflate): a kiwi schema, then a kiwi "Message" holding
   every node as a flat `nodeChanges` list with parentIndex {guid, position}. Field names come from the
   schema embedded in the file, so this survives Figma version bumps as long as names are stable.
   Reference: figma/kiwi and sketch-hq/fig2sketch (both MIT). */
import { readFileSync } from 'node:fs'
import { inflateRawSync, zstdDecompressSync } from 'node:zlib'

// ---- zip (stored + deflate entries only; Figma writes stored) ----
export function readZip(file: string): Map<string, () => Buffer> {
  const buf = readFileSync(file)
  const entries = new Map<string, () => Buffer>()
  // find end-of-central-directory
  let eocd = buf.length - 22
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--
  if (eocd < 0) throw new Error(`${file}: not a zip`)
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50)
      throw new Error('bad central directory')
    const method = buf.readUInt16LE(p + 10)
    const csize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const offset = buf.readUInt32LE(p + 42)
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8')
    entries.set(name, () => {
      const nl = buf.readUInt16LE(offset + 26)
      const el = buf.readUInt16LE(offset + 28)
      const start = offset + 30 + nl + el
      const data = buf.subarray(start, start + csize)
      return method === 8 ? inflateRawSync(data) : Buffer.from(data)
    })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

// ---- kiwi ----
class Reader {
  i = 0
  private b: Buffer
  constructor(b: Buffer) {
    this.b = b
  }
  byte() {
    return this.b[this.i++]
  }
  bool() {
    return this.byte() > 0
  }
  uint() {
    let v = 0
    for (let shift = 0; shift < 36; shift += 7) {
      const x = this.byte()
      v |= (x & 127) << shift
      if (x < 128) break
    }
    return v >>> 0
  }
  int() {
    const v = this.uint()
    return v & 1 ? ~(v >>> 1) : v >>> 1
  }
  uint64() {
    let v = 0n
    for (let shift = 0n; shift < 64n; shift += 7n) {
      const x = BigInt(this.byte())
      v |= (x & 127n) << shift
      if (x < 128n) break
    }
    return v
  }
  int64() {
    const v = this.uint64()
    return Number(v & 1n ? ~(v >> 1n) : v >> 1n)
  }
  float() {
    const b = this.byte()
    if (b === 0) return 0
    let bits =
      (b | (this.byte() << 8) | (this.byte() << 16) | (this.byte() << 24)) >>> 0
    bits = ((bits << 23) | (bits >>> 9)) >>> 0
    const dv = new DataView(new ArrayBuffer(4))
    dv.setUint32(0, bits)
    return dv.getFloat32(0)
  }
  string() {
    const start = this.i
    while (this.b[this.i] !== 0) this.i++
    const s = this.b.subarray(start, this.i).toString('utf8')
    this.i++
    return s
  }
}
type Field = { name: string; type: number; array: boolean; value: number }
type KType = { name: string; kind: number; fields: Map<number, Field> }
const PRIMS = [
  'bool',
  'byte',
  'int',
  'uint',
  'float',
  'string',
  'int64',
  'uint64',
] as const

function readSchema(b: Buffer): Array<KType> {
  const r = new Reader(b)
  const types: Array<KType> = []
  const n = r.uint()
  for (let i = 0; i < n; i++) {
    const name = r.string()
    const kind = r.byte()
    const fields = new Map<number, Field>()
    const fc = r.uint()
    for (let j = 0; j < fc; j++) {
      const f: Field = {
        name: r.string(),
        type: r.int(),
        array: r.bool(),
        value: r.uint(),
      }
      fields.set(f.value, f)
    }
    types.push({ name, kind, fields })
  }
  return types
}
function decodeMessage(r: Reader, types: Array<KType>, rootName: string): any {
  const root = types.find((t) => t.name === rootName)!
  const value = (typeId: number, array: boolean): any => {
    if (array) {
      const n = r.uint()
      const out = []
      for (let i = 0; i < n; i++) out.push(value(typeId, false))
      return out
    }
    if (typeId < 0) return (r as any)[PRIMS[~typeId]]()
    const t = types[typeId]
    if (t.kind === 0) return t.fields.get(r.uint())?.name
    if (t.kind === 1) {
      const o: Record<string, unknown> = {}
      for (const f of t.fields.values()) o[f.name] = value(f.type, f.array)
      return o
    }
    return message(t)
  }
  const message = (t: KType) => {
    const o: Record<string, unknown> = {}
    for (;;) {
      const id = r.uint()
      if (id === 0) return o
      const f = t.fields.get(id)
      if (!f) throw new Error(`unknown field ${id} in ${t.name}`)
      o[f.name] = value(f.type, f.array)
    }
  }
  return message(root)
}
function chunk(b: Buffer, at: number): [Buffer, number] {
  const size = b.readUInt32LE(at)
  const data = b.subarray(at + 4, at + 4 + size)
  const isZstd = data.readUInt32LE(0) === 0xfd2fb528
  return [
    isZstd ? zstdDecompressSync(data) : inflateRawSync(data),
    at + 4 + size,
  ]
}
export function decodeCanvas(canvas: Buffer) {
  if (canvas.subarray(0, 8).toString() !== 'fig-kiwi')
    throw new Error('not a fig-kiwi canvas')
  const version = canvas.readUInt32LE(8)
  const [schemaBuf, next] = chunk(canvas, 12)
  const [dataBuf] = chunk(canvas, next)
  const types = readSchema(schemaBuf)
  return {
    version,
    message: decodeMessage(new Reader(dataBuf), types, 'Message'),
  }
}

// ---- .fig nodes → REST shape ----
type Guid = { sessionID: number; localID: number }
type FigNode = Record<string, any> & { guid: Guid; type: string; name: string }
const gid = (g: Guid) => `${g.sessionID}:${g.localID}`
const TYPE: Record<string, string> = {
  ROUNDED_RECTANGLE: 'RECTANGLE',
  SYMBOL: 'COMPONENT',
}
const WEIGHT = (style: string) => {
  const s = style.toLowerCase()
  if (/black|heavy/.test(s)) return 900
  if (/extra\s*bold|ultra/.test(s)) return 800
  if (/bold/.test(s)) return 700
  if (/semi|demi/.test(s)) return 600
  if (/medium/.test(s)) return 500
  if (/light|thin/.test(s)) return 300
  return 400
}

export type FigImport = {
  file: Record<string, unknown> // REST-shaped FigmaFile
  images: Map<string, () => Buffer> // image hash → bytes (from the zip)
  pages: Array<string>
}

export function figToRest(
  path: string,
  opts: { page?: string; pages?: Array<string> } = {},
): FigImport {
  const zip = readZip(path)
  const canvas = zip.get('canvas.fig')
  if (!canvas) throw new Error(`${path}: no canvas.fig inside`)
  const meta = JSON.parse(zip.get('meta.json')?.().toString() ?? '{}') as {
    file_name?: string
  }
  const { version, message } = decodeCanvas(canvas())
  const nodes = new Map<string, FigNode>()
  let rootId = ''
  for (const n of message.nodeChanges as Array<FigNode>) {
    n.children = []
    nodes.set(gid(n.guid), n)
    if (!rootId) rootId = gid(n.guid)
  }
  for (const n of nodes.values()) {
    const p = n.parentIndex as { guid: Guid; position: string } | undefined
    if (p && nodes.has(gid(p.guid))) nodes.get(gid(p.guid))!.children.push(n)
  }
  for (const n of nodes.values())
    (n.children as Array<FigNode>).sort((a, b) =>
      String(a.parentIndex?.position ?? '').localeCompare(
        String(b.parentIndex?.position ?? ''),
      ),
    )
  const doc = nodes.get(rootId)!
  const pages = (doc.children as Array<FigNode>).map((p) => p.name)

  const components: Record<string, { name: string; description: string }> = {}
  const images = new Map<string, () => Buffer>()
  const imageHex = (paint: any) => {
    const h = paint?.image?.hash
    if (!h) return undefined
    return Buffer.from(h as Array<number>).toString('hex')
  }

  const convert = (
    n: FigNode,
    px: number,
    py: number,
    inheritedInvisible = false,
    depth = 0,
    overrides: Map<string, FigNode> = new Map(),
  ): any => {
    // Instance overrides (text, fills, visibility) keyed by the symbol child's guid; merged in
    // when this node is being expanded as part of an instance.
    const o = overrides.get(gid(n.guid))
    if (o)
      n = {
        ...n,
        ...o,
        guid: n.guid,
        children: n.children,
        parentIndex: n.parentIndex,
      }
    const m = n.transform ?? { m02: 0, m12: 0 }
    const x = px + (m.m02 ?? 0)
    const y = py + (m.m12 ?? 0)
    const size = n.size ?? { x: 0, y: 0 }
    const restType = TYPE[n.type] ?? n.type
    const visible = n.visible !== false && !inheritedInvisible
    const fills = (n.fillPaints ?? [])
      .map((p: any) => ({
        type: p.type,
        visible: p.visible !== false,
        opacity: p.opacity,
        color: p.color
          ? { r: p.color.r, g: p.color.g, b: p.color.b, a: p.color.a }
          : undefined,
        imageRef: imageHex(p),
      }))
      .filter((p: any) => p.type)
    for (const p of fills)
      if (p.imageRef && !images.has(p.imageRef)) {
        const entry = zip.get(`images/${p.imageRef}`)
        if (entry) images.set(p.imageRef, entry)
      }
    const out: Record<string, unknown> = {
      id: gid(n.guid),
      name: n.name,
      type: restType,
      visible,
      absoluteBoundingBox: { x, y, width: size.x, height: size.y },
      fills,
      cornerRadius: n.cornerRadius,
    }
    if (n.stackMode && n.stackMode !== 'NONE') {
      out.layoutMode = n.stackMode
      out.itemSpacing = n.stackSpacing ?? 0
      out.paddingTop = n.stackVerticalPadding ?? 0
      out.paddingLeft = n.stackHorizontalPadding ?? 0
      out.paddingBottom = n.stackPaddingBottom ?? n.stackVerticalPadding ?? 0
      out.paddingRight = n.stackPaddingRight ?? n.stackHorizontalPadding ?? 0
      out.primaryAxisAlignItems = n.stackPrimaryAlignItems
      out.counterAxisAlignItems = n.stackCounterAlignItems
    }
    if (n.type === 'TEXT') {
      out.characters = n.textData?.characters ?? ''
      const lh = n.lineHeight as { value?: number; units?: string } | undefined
      out.style = {
        fontFamily: n.fontName?.family,
        fontPostScriptName: n.fontName?.postscript,
        fontWeight: WEIGHT(n.fontName?.style ?? ''),
        fontSize: n.fontSize,
        textAlignHorizontal: n.textAlignHorizontal,
        lineHeightPx:
          lh?.units === 'PIXELS'
            ? lh.value
            : lh?.value && n.fontSize
              ? (lh.value / 100) * n.fontSize
              : undefined,
        letterSpacing: n.letterSpacing?.value,
      }
    }
    const top = n.type === 'CANVAS' || n.type === 'DOCUMENT'
    if (n.type === 'INSTANCE' && n.symbolData?.symbolID) {
      out.componentId = gid(n.symbolData.symbolID)
      // Instances carry no children of their own in a .fig: expand the symbol's subtree in place
      // (the REST API does this server-side). Text overrides are not applied yet.
      const sym = nodes.get(out.componentId as string)
      if (!n.children?.length && sym && depth < 12) {
        const ov = new Map<string, FigNode>(overrides)
        for (const so of (n.symbolData?.symbolOverrides ?? []) as Array<
          Record<string, unknown> & { guidPath?: { guids?: Array<Guid> } }
        >) {
          const guids = so.guidPath?.guids ?? []
          const last = guids.at(-1)
          if (!last) continue
          const { guidPath: _gp, ...fields } = so
          ov.set(gid(last), {
            ...(ov.get(gid(last)) ?? {}),
            ...fields,
          } as FigNode)
        }
        out.children = (sym.children as Array<FigNode>).map((c) =>
          convert(c, x, y, false, depth + 1, ov),
        )
      }
    }
    if (n.children?.length)
      out.children = (n.children as Array<FigNode>).map((c) =>
        convert(c, top ? 0 : x, top ? 0 : y, false, depth + 1, overrides),
      )
    return out
  }

  // components come from every page (instances on the chosen page point at symbols elsewhere)
  for (const n of nodes.values())
    if (n.type === 'SYMBOL')
      components[gid(n.guid)] = {
        name: n.name,
        description: n.description ?? '',
      }
  const chosen = opts.pages ?? (opts.page ? [opts.page] : undefined)
  const wanted = chosen
    ? (doc.children as Array<FigNode>).filter((p) => chosen.includes(p.name))
    : (doc.children as Array<FigNode>)
  if (chosen && !wanted.length)
    throw new Error(
      `page(s) ${chosen.join(', ')} not found; pages: ${pages.join(', ')}`,
    )
  const document = {
    id: '0:0',
    name: 'Document',
    type: 'DOCUMENT',
    children: wanted.map((p) => convert(p, 0, 0)),
  }
  return {
    file: {
      name: meta.file_name ?? path,
      version: `fig-v${version}`,
      lastModified: new Date().toISOString(),
      styles: {},
      components,
      document,
      source: 'fig-file',
    },
    images,
    pages,
  }
}
