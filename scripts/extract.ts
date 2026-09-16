/* Figma → design/manifest.json (+ renders/, assets/). Deterministic, no LLM.
   Run: pnpm extract   (needs FIGMA_TOKEN in .env; file key from agency.json)

   Contract (lenient): every visible top-level FRAME on any page is a route.
   Its direct children are sections. A section's type is its layer name, PascalCased,
   with an optional "Section /" prefix stripped. Text/image roles come from layer names. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'

type FigmaNode = {
  id: string
  name: string
  type: string
  visible?: boolean
  children?: Array<FigmaNode>
  characters?: string
  style?: Record<string, unknown>
  fills?: Array<{
    type: string
    visible?: boolean
    color?: { r: number; g: number; b: number; a: number }
    opacity?: number
    imageRef?: string
  }>
  strokes?: Array<{
    type: string
    color?: { r: number; g: number; b: number; a: number }
  }>
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number }
  layoutMode?: string
  itemSpacing?: number
  paddingTop?: number
  paddingRight?: number
  paddingBottom?: number
  paddingLeft?: number
  primaryAxisAlignItems?: string
  counterAxisAlignItems?: string
  layoutSizingHorizontal?: string
  layoutSizingVertical?: string
  cornerRadius?: number
  rectangleCornerRadii?: Array<number>
  styles?: Record<string, string>
  componentId?: string
}

const token = process.env.FIGMA_TOKEN
if (!token) throw new Error('FIGMA_TOKEN is not set')
const agency = JSON.parse(await readFile('agency.json', 'utf8')) as {
  figmaFileKey: string
}
const fileKey = agency.figmaFileKey
const api = async (path: string): Promise<any> => {
  // Figma rate-limits bursts (429). Retry with backoff, honouring Retry-After, for up to ~3 minutes.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.figma.com/v1${path}`, {
      headers: { 'X-Figma-Token': token },
    })
    if (res.ok) return res.json()
    const body = await res.text()
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      const retryAfter = Number(res.headers.get('retry-after')) || 0
      const wait = Math.max(
        retryAfter * 1000,
        Math.min(60_000, 5_000 * 2 ** attempt),
      )
      console.error(
        `Figma ${path} → ${res.status}; retrying in ${Math.round(wait / 1000)}s`,
      )
      await new Promise((r) => setTimeout(r, wait))
      continue
    }
    throw new Error(`Figma ${path} → ${res.status} ${body}`)
  }
}

const hex = (c: { r: number; g: number; b: number }) =>
  '#' +
  [c.r, c.g, c.b]
    .map((v) =>
      Math.round(v * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
const pascal = (s: string) =>
  s
    .replace(/^section\s*\/\s*/i, '')
    .replace(/[^a-zA-Z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^./, (c) => c.toUpperCase())
const role = (s: string) =>
  s
    .replace(/^[^a-zA-Z]+/, '')
    .replace(/[^a-zA-Z0-9/]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
    .replace(/^./, (c) => c.toLowerCase())
const visible = (n: FigmaNode) => n.visible !== false && !n.name.startsWith('_')

// ---- palette accumulators ----
const colors = new Map<
  string,
  { hex: string; uses: number; styleName?: string }
>()
const fonts = new Map<
  string,
  {
    family: string
    size: number
    weight: number
    lineHeight?: number
    uses: number
  }
>()
const radii = new Map<number, number>()
const spacing = new Map<number, number>()
const lint: Array<{
  level: 'warn' | 'info'
  node: string
  name: string
  msg: string
}> = []
const imageRefs = new Map<
  string,
  { nodeId: string; role: string; alt: string }
>()

function solidFill(n: FigmaNode) {
  const fill = n.fills?.find(
    (x) => x.type === 'SOLID' && x.visible !== false && x.color,
  )
  return fill?.color ? hex(fill.color) : undefined
}
function collectPalette(
  n: FigmaNode,
  styleNames: Record<string, { name: string } | undefined>,
) {
  if (!visible(n)) return
  const c = solidFill(n)
  if (c) {
    const styleName = n.styles?.fill
      ? styleNames[n.styles.fill]?.name
      : undefined
    const e = colors.get(c) ?? { hex: c, uses: 0, styleName }
    e.uses++
    if (styleName) e.styleName = styleName
    colors.set(c, e)
  }
  if (n.type === 'TEXT' && n.style) {
    const s = n.style as {
      fontFamily?: string
      fontSize?: number
      fontWeight?: number
      lineHeightPx?: number
    }
    const key = `${s.fontFamily}/${s.fontSize}/${s.fontWeight}`
    const e = fonts.get(key) ?? {
      family: s.fontFamily ?? '',
      size: s.fontSize ?? 0,
      weight: s.fontWeight ?? 400,
      lineHeight: s.lineHeightPx,
      uses: 0,
    }
    e.uses++
    fonts.set(key, e)
  }
  const r = n.cornerRadius ?? n.rectangleCornerRadii?.[0]
  if (r) radii.set(r, (radii.get(r) ?? 0) + 1)
  for (const v of [
    n.itemSpacing,
    n.paddingTop,
    n.paddingBottom,
    n.paddingLeft,
    n.paddingRight,
  ]) {
    if (v) spacing.set(v, (spacing.get(v) ?? 0) + 1)
  }
  n.children?.forEach((child) => collectPalette(child, styleNames))
}

function layoutOf(n: FigmaNode) {
  if (!n.layoutMode || n.layoutMode === 'NONE') return undefined
  return {
    direction: n.layoutMode === 'HORIZONTAL' ? 'row' : 'column',
    gap: n.itemSpacing ?? 0,
    padding: [
      n.paddingTop ?? 0,
      n.paddingRight ?? 0,
      n.paddingBottom ?? 0,
      n.paddingLeft ?? 0,
    ],
    align: n.counterAxisAlignItems?.toLowerCase(),
    justify: n.primaryAxisAlignItems?.toLowerCase(),
  }
}

/* Compact tree for the agent: keeps type, name, size, layout, fill, text, radius. Depth-limited. */
function summarize(n: FigmaNode, depth: number): unknown {
  if (!visible(n)) return undefined
  const box = n.absoluteBoundingBox
  const out: Record<string, unknown> = {
    id: n.id,
    type: n.type,
    name: n.name,
    size: box ? [Math.round(box.width), Math.round(box.height)] : undefined,
    fill: solidFill(n),
    radius: n.cornerRadius ?? n.rectangleCornerRadii,
    layout: layoutOf(n),
  }
  if (n.type === 'TEXT') {
    const s = n.style as
      | {
          fontFamily?: string
          fontSize?: number
          fontWeight?: number
          textAlignHorizontal?: string
        }
      | undefined
    out.text = n.characters
    out.font = s
      ? `${s.fontFamily} ${s.fontSize}/${s.fontWeight}${s.textAlignHorizontal && s.textAlignHorizontal !== 'LEFT' ? ' ' + s.textAlignHorizontal.toLowerCase() : ''}`
      : undefined
  }
  if (n.type === 'INSTANCE') out.componentId = n.componentId
  const img = n.fills?.find((f) => f.type === 'IMAGE' && f.imageRef)
  if (img?.imageRef) {
    out.image = `design/assets/${n.id.replace(':', '-')}.png`
    imageRefs.set(n.id, {
      nodeId: n.id,
      role: role(n.name.replace(/^image\//i, '')),
      alt: '',
    })
  }
  if (depth > 0 && n.children?.length)
    out.children = n.children
      .map((c) => summarize(c, depth - 1))
      .filter(Boolean)
  return Object.fromEntries(
    Object.entries(out).filter(([, v]) => v !== undefined),
  )
}

function collectText(n: FigmaNode, acc: Record<string, string>) {
  if (!visible(n)) return
  if (n.type === 'TEXT' && n.characters?.trim()) {
    let key = role(n.name)
    if (!key || key === role(n.characters)) key = 'text'
    let k = key
    for (let i = 2; k in acc; i++) k = `${key}${i}`
    acc[k] = n.characters
    if (key === 'text')
      lint.push({
        level: 'info',
        node: n.id,
        name: n.name,
        msg: 'text layer not named by role; field name will be generic',
      })
  }
  n.children?.forEach((c) => collectText(c, acc))
}

// ---- main ----
const file = (await api(`/files/${fileKey}`)) as {
  name: string
  version: string
  lastModified: string
  styles: Record<string, { name: string; styleType: string }>
  components: Record<string, { name: string; description: string }>
  document: FigmaNode
}

const routes: Array<Record<string, unknown>> = []
for (const page of file.document.children ?? []) {
  if (!visible(page)) continue
  for (const frame of page.children ?? []) {
    if (
      !visible(frame) ||
      (frame.type !== 'FRAME' &&
        frame.type !== 'SECTION' &&
        frame.type !== 'COMPONENT')
    )
      continue
    collectPalette(frame, file.styles)
    const name = frame.name.replace(/\s*@.*$/, '')
    const isMobile = /@mobile/i.test(frame.name)
    const path = /^(home|index|template)$/i.test(name) ? '/' : '/' + slug(name)
    const width = Math.round(frame.absoluteBoundingBox?.width ?? 0)
    if (!isMobile && width !== 1440)
      lint.push({
        level: 'warn',
        node: frame.id,
        name: frame.name,
        msg: `route frame is ${width}px wide; contract expects 1440`,
      })
    // Sections are direct children, sorted top→bottom by position (Figma stores children bottom-up in z-order).
    const kids = (frame.children ?? [])
      .filter(visible)
      .sort(
        (a, b) =>
          (a.absoluteBoundingBox?.y ?? 0) - (b.absoluteBoundingBox?.y ?? 0),
      )
    const sections = kids.map((s) => {
      const text: Record<string, string> = {}
      collectText(s, text)
      if (!s.layoutMode || s.layoutMode === 'NONE')
        lint.push({
          level: 'warn',
          node: s.id,
          name: s.name,
          msg: 'section is not auto-layout; spacing will be inferred from positions',
        })
      const box = s.absoluteBoundingBox
      return {
        id: s.id,
        name: s.name,
        type: pascal(s.name),
        size: box ? [Math.round(box.width), Math.round(box.height)] : undefined,
        background:
          solidFill(s) ??
          solidFill(
            (s.children ?? []).find((c) => /bg|background/i.test(c.name)) ??
              ({} as FigmaNode),
          ),
        layout: layoutOf(s),
        text,
        tree: summarize(s, 4),
      }
    })
    routes.push({
      id: frame.id,
      name: frame.name,
      path,
      viewport: isMobile ? 'mobile' : 'desktop',
      width,
      render: `design/renders/${slug(frame.name)}.png`,
      sections,
    })
  }
}

// renders + image assets
await mkdir('design/renders', { recursive: true })
await mkdir('design/assets', { recursive: true })
const routeIds = routes.map((r) => r.id as string)
if (routeIds.length) {
  const { images } = (await api(
    `/images/${fileKey}?ids=${routeIds.join(',')}&format=png&scale=1`,
  )) as { images: Record<string, string> }
  for (const r of routes) {
    const url = images[r.id as string]
    if (url)
      await writeFile(
        r.render as string,
        Buffer.from(await (await fetch(url)).arrayBuffer()),
      )
  }
}
if (imageRefs.size) {
  const ids = [...imageRefs.keys()]
  const { images } = (await api(
    `/images/${fileKey}?ids=${ids.join(',')}&format=png&scale=2`,
  )) as { images: Record<string, string> }
  for (const id of ids) {
    const url = images[id]
    if (url)
      await writeFile(
        `design/assets/${id.replace(':', '-')}.png`,
        Buffer.from(await (await fetch(url)).arrayBuffer()),
      )
  }
}

const manifest = {
  fileKey,
  fileName: file.name,
  version: file.version,
  lastModified: file.lastModified,
  extractedAt: new Date().toISOString(),
  palette: {
    colors: [...colors.values()].sort((a, b) => b.uses - a.uses),
    fonts: [...fonts.values()].sort((a, b) => b.uses - a.uses),
    radii: [...radii.entries()]
      .map(([value, uses]) => ({ value, uses }))
      .sort((a, b) => b.uses - a.uses),
    spacing: [...spacing.entries()]
      .map(([value, uses]) => ({ value, uses }))
      .sort((a, b) => b.uses - a.uses),
  },
  routes,
  components: Object.entries(file.components).map(([id, c]) => ({
    id,
    name: c.name,
    description: c.description,
  })),
  lint,
}
await writeFile(
  'design/manifest.json',
  JSON.stringify(manifest, null, 2) + '\n',
)
console.log(
  `manifest: ${routes.length} route(s), ${routes.reduce((n, r) => n + (r.sections as Array<unknown>).length, 0)} section(s), ${colors.size} colours, ${fonts.size} text styles, ${imageRefs.size} image(s), ${lint.length} lint note(s)`,
)
