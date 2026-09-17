/* Figma → design/manifest.json (+ renders/, assets/). Deterministic, no LLM.
   Run: pnpm extract   (needs FIGMA_TOKEN in .env; file key from agency.json)

   Contract (lenient): every visible top-level FRAME on any page is a route.
   Its direct children are sections. A section's type is its layer name, PascalCased,
   with an optional "Section /" prefix stripped. Text/image roles come from layer names. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { figToRest } from './fig.ts'
import type { FigImport } from './fig.ts'

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

// --normalise <manifest.json>: re-run only the normaliser on an existing manifest (e.g. one exported
// by the Figma plugin, which never talks to the REST API). No token needed in that mode.
const normaliseOnly = process.argv.includes('--normalise')
  ? process.argv[process.argv.indexOf('--normalise') + 1]
  : undefined
// --from-fig <file.fig> [--page <name>]: read a local .fig export (no API, no quota). Frames on the
// chosen page (default: a page named FINAL/Final, else every page) are routes; repeated frame names
// fold into one route with `states`. No renders: export frames as PNG into design/renders/ by hand.
const argAfter = (flag: string) =>
  process.argv.includes(flag)
    ? process.argv[process.argv.indexOf(flag) + 1]
    : undefined
const fromFig = argAfter('--from-fig')
// --from-bundle <figma-export.json>: what the Agency Figma plugin saves. The plugin only dumps the
// file (REST-shaped node JSON, image bytes, frame renders); all the reading happens here, so a
// plugin export, a .fig file and the REST API go through exactly the same extractor.
const fromBundle = argAfter('--from-bundle')
const local = !!fromFig || !!fromBundle
const pageArg = argAfter('--page')
const token = process.env.FIGMA_TOKEN ?? ''
if (!token && !normaliseOnly && !local)
  throw new Error('FIGMA_TOKEN is not set')
const agency = JSON.parse(await readFile('agency.json', 'utf8')) as {
  figmaFileKey: string
}
const fidelity: 'normalised' | 'exact' =
  process.env.AGENCY_FIDELITY === 'exact' ||
  (agency as { fidelity?: string }).fidelity === 'exact'
    ? 'exact'
    : 'normalised'
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
  { nodeId: string; role: string; alt: string; hash?: string }
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
    radius: snapRadius(n.id, n.cornerRadius ?? n.rectangleCornerRadii),
    layout: snapLayout(n.id, layoutOf(n)),
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
    // .fig import: one asset per image (content hash); REST: one per node (export by id)
    out.image = local
      ? `design/assets/${img.imageRef.slice(0, 16)}.${figImageExt(img.imageRef)}`
      : `design/assets/${n.id.replace(':', '-')}.png`
    imageRefs.set(n.id, {
      nodeId: n.id,
      role: role(n.name.replace(/^image\//i, '')),
      alt: '',
      hash: img.imageRef,
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
    if (!key || key === role(n.characters)) {
      // auto-named layer (name = its text): guess the role from length
      const len = n.characters.trim().length
      key = len > 160 ? 'body' : len <= 40 ? 'label' : 'text'
    }
    let k = key
    for (let i = 2; k in acc; i++) k = `${key}${i}`
    acc[k] = n.characters
    if (key === 'text' || key === 'body' || key === 'label')
      lint.push({
        level: 'info',
        node: n.id,
        name: n.name,
        msg: 'text layer not named by role; field name will be generic',
      })
  }
  n.children?.forEach((c) => collectText(c, acc))
}

// ---- normaliser (fidelity: normalised) ----
// Learns the design's own system instead of imposing a grid:
//  1. base unit: the candidate (4/5/6/8/10) that the most spacing values are multiples of, weighted by use.
//  2. anchors: the values the designer actually uses often (top of the usage histogram, multiples of base).
//  3. snap: a value moves to the nearest anchor when it is within `tol` of it; otherwise to the nearest
//     multiple of the base; a genuinely distinct value (far from every anchor) is kept as-is.
//  4. consistency: sections of the same type share padding/gap — the mode wins for near values.
// Every change is recorded in `snapped` so the PR body can list what was rounded.
const snappedRaw: Array<{
  node: string
  prop: string
  from: number | string
  to: number | string
}> = []
const snapped = {
  push(e: (typeof snappedRaw)[number]) {
    if (
      !snappedRaw.some(
        (x) => x.node === e.node && x.prop === e.prop && x.from === e.from,
      )
    )
      snappedRaw.push(e)
  },
  get list() {
    return snappedRaw
  },
}
const RADII = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 999]

type Hist = Map<number, number>
const bump = (h: Hist, v: number, n = 1) => h.set(v, (h.get(v) ?? 0) + n)

function detectBase(h: Hist): number {
  let best = 4
  let bestScore = -1
  for (const b of [4, 5, 6, 8, 10]) {
    let score = 0
    for (const [v, n] of h) if (v > 0 && v % b === 0) score += n * Math.log2(b)
    if (score > bestScore) {
      bestScore = score
      best = b
    }
  }
  return best
}
function anchorsOf(h: Hist, base: number): Array<number> {
  const total = [...h.values()].reduce((a, b) => a + b, 0)
  const sorted = [...h.entries()]
    .filter(([v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
  const out: Array<number> = []
  let acc = 0
  for (const [v, n] of sorted) {
    // anchors: frequent values (≥2 uses or part of the top 85% of usage) that sit on the base grid
    if ((n >= 2 || acc / total < 0.85) && v % base === 0) out.push(v)
    acc += n
  }
  return out.sort((a, b) => a - b)
}
function snapValue(
  v: number,
  anchors: Array<number>,
  base: number,
  tol = 0.12,
): number {
  if (v <= 0 || v > 320) return v // huge values are layout artefacts (space-between), not design decisions
  const near = anchors.reduce<number | undefined>(
    (best, a) =>
      best === undefined || Math.abs(a - v) < Math.abs(best - v) ? a : best,
    undefined,
  )
  if (near !== undefined && Math.abs(near - v) <= Math.max(base / 2, v * tol))
    return near
  const grid = Math.round(v / base) * base
  return Math.abs(grid - v) <= Math.max(2, v * tol) ? grid : v
}

let spacingBase = 4
let spacingAnchors: Array<number> = []
function learnSpacing() {
  const h: Hist = new Map()
  for (const [v, n] of spacing) bump(h, v, n)
  spacingBase = detectBase(h)
  spacingAnchors = anchorsOf(h, spacingBase)
}
function snapLayout<T extends { gap: number; padding: Array<number> }>(
  node: string,
  l?: T,
): T | undefined {
  if (!l || fidelity === 'exact') return l
  const gap = snapValue(l.gap, spacingAnchors, spacingBase)
  if (gap !== l.gap) snapped.push({ node, prop: 'gap', from: l.gap, to: gap })
  const padding = l.padding.map((p, i) => {
    const t = snapValue(p, spacingAnchors, spacingBase)
    if (t !== p) snapped.push({ node, prop: `padding[${i}]`, from: p, to: t })
    return t
  })
  return { ...l, gap, padding }
}
function snapRadius(node: string, r?: number | Array<number>) {
  if (r === undefined || fidelity === 'exact' || Array.isArray(r)) return r
  const t = r >= 500 ? 999 : snapValue(r, RADII, 2, 0.2) // anything ≥ 500 is a pill
  if (t !== r) snapped.push({ node, prop: 'radius', from: r, to: t })
  return t
}
/* Sections of one type should agree: for each layout prop, values near the type's mode move to it. */
function harmoniseSections(
  sections: Array<{
    id: string
    type: string
    layout?: { gap: number; padding: Array<number> }
  }>,
) {
  if (fidelity === 'exact') return
  const byType = new Map<string, Array<(typeof sections)[number]>>()
  for (const s of sections)
    if (s.layout) byType.set(s.type, [...(byType.get(s.type) ?? []), s])
  for (const [, group] of byType) {
    if (group.length < 2) continue
    const props: Array<
      [
        string,
        (l: { gap: number; padding: Array<number> }) => number,
        (l: { gap: number; padding: Array<number> }, v: number) => void,
      ]
    > = [
      ['gap', (l) => l.gap, (l, v) => (l.gap = v)],
      ...[0, 1, 2, 3].map(
        (
          i,
        ): [
          string,
          (l: { gap: number; padding: Array<number> }) => number,
          (l: { gap: number; padding: Array<number> }, v: number) => void,
        ] => [
          `padding[${i}]`,
          (l) => l.padding[i] ?? 0,
          (l, v) => (l.padding[i] = v),
        ],
      ),
    ]
    for (const [name, get, set] of props) {
      const h: Hist = new Map()
      for (const s of group) bump(h, get(s.layout!))
      const mode = [...h.entries()].sort((a, b) => b[1] - a[1])[0]![0]
      for (const s of group) {
        const v = get(s.layout!)
        if (
          v !== mode &&
          Math.abs(v - mode) <= Math.max(spacingBase, v * 0.2)
        ) {
          set(s.layout!, mode)
          snapped.push({
            node: s.id,
            prop: `${name} (harmonised with other ${s.type})`,
            from: v,
            to: mode,
          })
        }
      }
    }
  }
}
/* Type scale: cluster sizes within 10%, keep the most-used size per cluster; weights to the standard set. */
function typeScale(
  entries: Array<{
    family: string
    size: number
    weight: number
    uses: number
  }>,
) {
  if (fidelity === 'exact') return entries
  const usesOf = (sz: number) =>
    entries.filter((e) => e.size === sz).reduce((n, e) => n + e.uses, 0)
  const sizes = [...new Set(entries.map((e) => e.size))].sort((a, b) => a - b)
  const map = new Map<number, number>()
  let cluster: Array<number> = []
  const flush = () => {
    if (!cluster.length) return
    const keep = cluster.reduce((a, b) => (usesOf(b) > usesOf(a) ? b : a))
    for (const c of cluster) map.set(c, keep)
    cluster = []
  }
  for (const sz of sizes) {
    if (cluster.length && sz > cluster[0]! * 1.1) flush()
    cluster.push(sz)
  }
  flush()
  const weightOf = (w: number) =>
    w >= 800 ? 900 : w >= 650 ? 700 : w >= 550 ? 600 : w >= 450 ? 500 : 400
  const merged = new Map<
    string,
    { family: string; size: number; weight: number; uses: number }
  >()
  for (const e of entries) {
    const size = map.get(e.size) ?? e.size
    const weight = weightOf(e.weight)
    if (size !== e.size || weight !== e.weight)
      snapped.push({
        node: 'palette',
        prop: `font ${e.family} ${e.size}/${e.weight}`,
        from: `${e.size}/${e.weight}`,
        to: `${size}/${weight}`,
      })
    const k = `${e.family}/${size}/${weight}`
    const cur = merged.get(k) ?? { family: e.family, size, weight, uses: 0 }
    cur.uses += e.uses
    merged.set(k, cur)
  }
  return [...merged.values()]
}
/* Colours: merge near-duplicates into the most-used member. Distance in RGB; 12 ≈ "same grey to the eye". */
function mergeColours(
  entries: Array<{ hex: string; uses: number; styleName?: string }>,
) {
  if (fidelity === 'exact') return entries
  const rgb = (h: string) =>
    [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const dist = (a: string, b: string) =>
    Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]!))
  const out: Array<{ hex: string; uses: number; styleName?: string }> = []
  for (const e of [...entries].sort((a, b) => b.uses - a.uses)) {
    const near = out.find((o) => dist(o.hex, e.hex) < 12)
    if (near) {
      near.uses += e.uses
      snapped.push({
        node: 'palette',
        prop: 'colour',
        from: e.hex,
        to: near.hex,
      })
    } else out.push({ ...e })
  }
  return out
}

const normalisationRules = () => [
  `spacing: base unit ${spacingBase}px learned from the design (candidates 4/5/6/8/10); values snap to the design's own frequent values (anchors) or the base grid within ~12%`,
  'sections of the same type share gap/padding (mode wins within 20%)',
  'radius → nearest of 0/2/4/6/8/10/12/16/20/24/32/999 within 20%',
  'type sizes clustered within 10% (most-used wins), weights → 400/500/600/700/900',
  'colours within RGB distance 12 merged into the most-used',
]

// ---- normalise-only mode ----
if (normaliseOnly) {
  type Tree = {
    id: string
    layout?: { gap: number; padding: Array<number> }
    radius?: number | Array<number>
    children?: Array<Tree>
  }
  const m = JSON.parse(await readFile(normaliseOnly, 'utf8')) as {
    palette: {
      colors: Array<{ hex: string; uses: number; styleName?: string }>
      fonts: Array<{
        family: string
        size: number
        weight: number
        uses: number
      }>
      radii: Array<{ value: number; uses: number }>
      spacing: Array<{ value: number; uses: number }>
    }
    routes: Array<{
      sections: Array<{
        id: string
        type: string
        layout?: { gap: number; padding: Array<number> }
        tree?: Tree
      }>
    }>
    normalisation?: { snapped?: Array<unknown> }
  }
  if (m.normalisation?.snapped?.length)
    throw new Error(`${normaliseOnly} is already normalised`)
  for (const s of m.palette.spacing) spacing.set(s.value, s.uses)
  learnSpacing()
  const walk = (n: Tree) => {
    n.layout = snapLayout(n.id, n.layout)
    n.radius = snapRadius(n.id, n.radius)
    if (n.layout === undefined) delete n.layout
    if (n.radius === undefined) delete n.radius
    n.children?.forEach(walk)
  }
  for (const r of m.routes) {
    for (const s of r.sections) {
      s.layout = snapLayout(s.id, s.layout)
      if (s.layout === undefined) delete s.layout
      if (s.tree) walk(s.tree)
    }
    harmoniseSections(r.sections)
  }
  m.palette.colors = mergeColours(m.palette.colors).sort(
    (a, b) => b.uses - a.uses,
  )
  m.palette.fonts = typeScale(m.palette.fonts).sort((a, b) => b.uses - a.uses)
  const out = {
    ...m,
    fidelity,
    normalisation: {
      base: fidelity === 'normalised' ? spacingBase : null,
      anchors: fidelity === 'normalised' ? spacingAnchors : [],
      rules: fidelity === 'normalised' ? normalisationRules() : [],
      snapped: snapped.list,
    },
  }
  await writeFile(normaliseOnly, JSON.stringify(out, null, 2) + '\n')
  console.log(
    `normalised ${normaliseOnly}: base ${spacingBase}, anchors ${spacingAnchors.join('/')}, ${snapped.list.length} value(s) snapped`,
  )
  process.exit(0)
}

// ---- main ----
// --from-file <figma.json>: work from a saved REST response (offline / rate-limited); skips image export.
const fromFile = process.argv.includes('--from-file')
  ? process.argv[process.argv.indexOf('--from-file') + 1]
  : undefined
type FigmaFile = {
  name: string
  version: string
  lastModified: string
  styles: Record<string, { name: string; styleType: string }>
  components: Record<string, { name: string; description: string }>
  document: FigmaNode
}
let figImport: FigImport | undefined
if (fromFig) {
  figImport = figToRest(fromFig, { page: pageArg })
  const main =
    pageArg ??
    figImport.pages.find((p) =>
      /^(finals?|site|website|web|pages|desktop|designs?)$/i.test(p.trim()),
    )
  // mobile pages ride along: their frames become the mobile viewport of the same routes
  const mobile = figImport.pages.filter((p) => /mobile/i.test(p) && p !== main)
  // No obvious main page: drop the ones that are never the site (covers, component sheets,
  // sketches, separators, Figma's internal canvas) rather than turning them into routes.
  const junk =
    /^(cover|thumbnail|components?|symbols?|styles?|sketch(es)?|archive|old|wip|playground|moodboard|inspiration|internal only canvas|[-–—_\s]+)$/i
  const kept = figImport.pages.filter((p) => !junk.test(p.trim()))
  const chosen = main
    ? [main, ...mobile]
    : kept.length && kept.length < figImport.pages.length
      ? kept
      : undefined
  if (chosen) figImport = figToRest(fromFig, { pages: chosen })
  console.error(
    `fig: pages [${figImport.pages.join(', ')}] → using ${chosen ? chosen.map((p) => `"${p}"`).join(' + ') : 'all pages'} (pass --page to choose the main page)`,
  )
}
type Bundle = {
  kind: string
  version: number
  file: { name: string; key?: string; lastModified?: string }
  pages: Array<{ id: string; name: string; document: FigmaNode }>
  components?: Record<string, { name: string; description: string }>
  styles?: Record<string, { name: string; styleType: string }>
  images: Array<{ hash: string; base64: string }>
  renders: Array<{ id: string; base64: string }>
}
const bundleRenders = new Map<string, Buffer>()
let bundleRendersWritten = 0
if (fromBundle) {
  const b = JSON.parse(await readFile(fromBundle, 'utf8')) as Bundle
  if (b.kind !== 'agency-figma-export')
    throw new Error(
      `${fromBundle} is not an Agency Figma plugin export (re-export with the current plugin)`,
    )
  const names = b.pages.map((p) => p.name)
  const main = pageArg ?? names.find((p) => /^finals?$/i.test(p.trim()))
  const mobile = names.filter((p) => /mobile/i.test(p) && p !== main)
  const chosen = main ? [main, ...mobile] : names
  const images = new Map<string, () => Buffer>()
  for (const i of b.images)
    images.set(i.hash, () => Buffer.from(i.base64, 'base64'))
  for (const r of b.renders)
    bundleRenders.set(r.id, Buffer.from(r.base64, 'base64'))
  figImport = {
    file: {
      name: b.file.name,
      version: `plugin-v${b.version}`,
      lastModified: b.file.lastModified ?? new Date().toISOString(),
      styles: b.styles ?? {},
      components: b.components ?? {},
      document: {
        id: '0:0',
        name: 'Document',
        type: 'DOCUMENT',
        children: b.pages
          .filter((p) => chosen.includes(p.name))
          .map((p) => p.document),
      },
    },
    images,
    pages: names,
  }
  console.error(
    `bundle: pages [${names.join(', ')}] → using ${chosen.map((p) => `"${p}"`).join(' + ')} · ${b.images.length} image(s), ${b.renders.length} render(s)`,
  )
}
const file = (
  figImport
    ? figImport.file
    : fromFile
      ? JSON.parse(await readFile(fromFile, 'utf8'))
      : await api(`/files/${fileKey}`)
) as FigmaFile
const offline = !!fromFile || local

const routes: Array<Record<string, unknown>> = []
const isRouteFrame = (n: FigmaNode) =>
  visible(n) &&
  (n.type === 'FRAME' || n.type === 'SECTION' || n.type === 'COMPONENT')
// Pass 1: palette over every route frame, then learn the spacing system from it.
for (const page of file.document.children ?? [])
  if (visible(page))
    for (const frame of page.children ?? [])
      if (isRouteFrame(frame)) collectPalette(frame, file.styles)
learnSpacing()
const figExtCache = new Map<string, string>()
function figImageExt(hash: string) {
  let ext = figExtCache.get(hash)
  if (!ext) {
    const b = figImport?.images.get(hash)?.()
    ext = b && b[0] === 0xff && b[1] === 0xd8 ? 'jpg' : 'png'
    figExtCache.set(hash, ext)
  }
  return ext
}

// Pass 2: routes and sections, snapped against the learned system.
// Frames that share a (normalised) name are one route: the first is canonical, the rest are `states`
// (unstructured files keep one frame per screen state). A frame is a `page` when its children stack
// vertically and span the width; otherwise a `screen` (app-like layout: the tree is the design).
const routeKey = (name: string) =>
  name
    .replace(/\s*@.*$/, '')
    .replace(/\s*[–-]\s*(alt|v\d+|copy|final|new|old|option|variant).*$/i, '')
    .replace(/\s*\(.*\)\s*$/, '')
    .replace(/\s+\d+$/, '')
    .trim()
    .toLowerCase()
const routeIndex = new Map<string, number>()
for (const page of file.document.children ?? []) {
  if (!visible(page)) continue
  for (const frame of page.children ?? []) {
    if (!isRouteFrame(frame)) continue
    const name = frame.name.replace(/\s*@.*$/, '')
    const width = Math.round(frame.absoluteBoundingBox?.width ?? 0)
    const isMobile =
      /@mobile/i.test(frame.name) || /mobile/i.test(page.name) || width < 600
    const key = `${isMobile ? 'm:' : ''}${routeKey(name)}`
    const path = /^(home|index|template|landing|start)$/i.test(routeKey(name))
      ? '/'
      : '/' + slug(routeKey(name))
    // Sections are direct children, sorted top→bottom by position (Figma stores children bottom-up in z-order).
    const kids = (frame.children ?? [])
      .filter(visible)
      .sort(
        (a, b) =>
          (a.absoluteBoundingBox?.y ?? 0) - (b.absoluteBoundingBox?.y ?? 0),
      )
    const fw = frame.absoluteBoundingBox?.width ?? 1
    const fh = frame.absoluteBoundingBox?.height ?? 1
    const wide = kids.filter(
      (k) => (k.absoluteBoundingBox?.width ?? 0) >= fw * 0.6,
    )
    const stacked = (() => {
      let lastBottom = -Infinity
      let ok = 0
      for (const k of wide) {
        const b = k.absoluteBoundingBox!
        if (b.y >= lastBottom - 8) ok++
        lastBottom = Math.max(lastBottom, b.y + b.height)
      }
      return ok
    })()
    const kind: 'page' | 'screen' =
      wide.length >= 2 && stacked >= wide.length * 0.8 ? 'page' : 'screen'
    const existing = routeIndex.get(key)
    if (existing !== undefined) {
      // a repeated screen: keep its text + shallow tree as a state of the canonical route
      const text: Record<string, string> = {}
      collectText(frame, text)
      const route = routes[existing]!
      ;(route.states as Array<unknown>).push({
        id: frame.id,
        name: frame.name,
        text,
        tree: summarize(frame, 2),
      })
      continue
    }
    if (!isMobile && width !== 1440)
      lint.push({
        level: 'warn',
        node: frame.id,
        name: frame.name,
        msg: `route frame is ${width}px wide; contract expects 1440`,
      })
    if (kind === 'screen')
      lint.push({
        level: 'info',
        node: frame.id,
        name: frame.name,
        msg: 'frame is a screen (no vertical section stack); mapped to one section with the full tree',
      })
    const sectionOf = (s: FigmaNode) => {
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
        layout: snapLayout(s.id, layoutOf(s)),
        text,
        tree: summarize(s, 4),
      }
    }
    // Screens: chrome instances (nav/header/footer) stay their own sections; everything else is one
    // "Screen" section carrying the full tree, with the big regions listed for orientation.
    const isChrome = (k: FigmaNode) => /nav|header|footer|menu/i.test(k.name)
    const sections =
      kind === 'page'
        ? kids.map(sectionOf)
        : [
            ...kids.filter(isChrome).map(sectionOf),
            {
              ...sectionOf({
                ...frame,
                name: `${name} screen`,
                children: kids.filter((k) => !isChrome(k)),
              }),
              id: frame.id,
              type: 'Screen',
              regions: kids
                .filter((k) => !isChrome(k))
                .filter((k) => {
                  const b = k.absoluteBoundingBox
                  return b && b.width * b.height >= fw * fh * 0.15
                })
                .map((k) => ({
                  id: k.id,
                  name:
                    k.type === 'TEXT'
                      ? `text: ${k.name.slice(0, 40)}${k.name.length > 40 ? '…' : ''}`
                      : k.name,
                  box: [
                    Math.round(
                      ((k.absoluteBoundingBox!.x -
                        frame.absoluteBoundingBox!.x) /
                        fw) *
                        100,
                    ),
                    Math.round(
                      ((k.absoluteBoundingBox!.y -
                        frame.absoluteBoundingBox!.y) /
                        fh) *
                        100,
                    ),
                    Math.round((k.absoluteBoundingBox!.width / fw) * 100),
                    Math.round((k.absoluteBoundingBox!.height / fh) * 100),
                  ],
                })),
            },
          ]
    harmoniseSections(sections)
    routeIndex.set(key, routes.length)
    routes.push({
      id: frame.id,
      name: frame.name,
      path,
      kind,
      page: page.name,
      viewport: isMobile ? 'mobile' : 'desktop',
      width,
      render: `design/renders/${slug(frame.name)}.png`,
      sections,
      states: [],
    })
  }
}

// renders + image assets
await mkdir('design/renders', { recursive: true })
await mkdir('design/assets', { recursive: true })
const routeIds = routes.map((r) => r.id as string)
if (routeIds.length && !offline) {
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
// Plugin export: the frame renders came with the bundle.
if (bundleRenders.size)
  for (const r of routes) {
    const bytes = bundleRenders.get(r.id as string)
    if (bytes) {
      await writeFile(r.render as string, bytes)
      bundleRendersWritten++
    }
  }
if (imageRefs.size && !offline) {
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

// .fig import: image fills come straight out of the zip, one file per content hash.
if (figImport && imageRefs.size) {
  let n = 0
  const done = new Set<string>()
  for (const ref of imageRefs.values()) {
    if (!ref.hash || done.has(ref.hash)) continue
    done.add(ref.hash)
    const bytes = figImport.images.get(ref.hash)?.()
    if (bytes) {
      await writeFile(
        `design/assets/${ref.hash.slice(0, 16)}.${figImageExt(ref.hash)}`,
        bytes,
      )
      n++
    }
  }
  console.error(
    fromBundle
      ? `bundle: wrote ${n} image asset(s) and ${bundleRendersWritten} render(s)`
      : `fig: wrote ${n} image asset(s); renders are NOT produced from a .fig — export frames as PNG into design/renders/`,
  )
}

const manifest = {
  fileKey,
  fileName: file.name,
  source: fromBundle
    ? 'figma-plugin'
    : fromFig
      ? 'fig-file'
      : fromFile
        ? 'rest-file'
        : 'rest',
  version: file.version,
  lastModified: file.lastModified,
  extractedAt: new Date().toISOString(),
  palette: {
    colors: mergeColours([...colors.values()]).sort((a, b) => b.uses - a.uses),
    fonts: typeScale([...fonts.values()]).sort((a, b) => b.uses - a.uses),
    radii: [...radii.entries()]
      .map(([value, uses]) => ({ value, uses }))
      .sort((a, b) => b.uses - a.uses),
    spacing: [...spacing.entries()]
      .map(([value, uses]) => ({ value, uses }))
      .sort((a, b) => b.uses - a.uses),
  },
  routes,
  fidelity,
  normalisation: {
    base: fidelity === 'normalised' ? spacingBase : null,
    anchors: fidelity === 'normalised' ? spacingAnchors : [],
    rules: fidelity === 'normalised' ? normalisationRules() : [],
    snapped: snapped.list,
  },
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
