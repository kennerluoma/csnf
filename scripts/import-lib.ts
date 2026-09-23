/* Pure logic behind `pnpm run import` (scripts/import.ts): an existing site's content → Sanity
   documents. Source readers (WordPress REST JSON, WXR, a JSON or CSV export, a crawled HTML page),
   HTML → Portable Text, the target schema read from `sanity schema extract`, type and field
   mapping, document ids, and the redirect map. No network, no filesystem: tested by
   scripts/import.test.ts. No model calls anywhere. */
import { createHash } from 'node:crypto'
import { findChrome } from './website-lib.ts'
import type { SnapNode } from './website-lib.ts'

// ---- small JSON narrowing helpers (everything read from a source is `unknown`) ----

export type Rec = Record<string, unknown>
export const isRec = (v: unknown): v is Rec =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
export const rec = (v: unknown): Rec => (isRec(v) ? v : {})
export const str = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined
export const list = (v: unknown): Array<unknown> => (Array.isArray(v) ? v : [])

// ---- the one shape every source is read into ----

export type SourceImage = { url: string; alt: string; caption?: string }
export type Item = {
  /** Where the content lived (absolute URL); the document id derives from it. */
  sourceUrl: string
  /** The source's own id (WordPress post id, WXR post_id, the URL for a crawl). */
  sourceId: string
  /** post, page, a custom post type, or a crawl group (news, work, …). */
  sourceType: string
  title: string
  /** URL slug; for WordPress pages the path below the site root ("about/team"). */
  slug: string
  /** ISO 8601 when the source has one. */
  date?: string
  /** Plain text. */
  excerpt?: string
  /** Body HTML (converted to Portable Text by `mapItem`). */
  html: string
  featured?: SourceImage
  /** Category and tag names. */
  terms: Array<string>
  author?: string
  /** Everything else the source said; lands in `sourceMeta` so nothing is lost. */
  meta: Rec
}

// ---- HTML: a small forgiving parser (no dependency) ----

export type HNode = {
  tag: string
  attrs: Record<string, string>
  children: Array<HNode | string>
}

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  laquo: '«',
  raquo: '»',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  times: '×',
  middot: '·',
  bull: '•',
  euro: '€',
  pound: '£',
  shy: '',
  zwj: '',
  zwnj: '',
  eacute: 'é',
  egrave: 'è',
  aacute: 'á',
  agrave: 'à',
  auml: 'ä',
  ouml: 'ö',
  uuml: 'ü',
  szlig: 'ß',
  ccedil: 'ç',
  ntilde: 'ñ',
}

export function decodeHtml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n =
        e[1] === 'x' || e[1] === 'X'
          ? parseInt(e.slice(2), 16)
          : Number(e.slice(1))
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff
        ? String.fromCodePoint(n)
        : m
    }
    return NAMED[e.toLowerCase()] ?? m
  })
}

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])
/* Their content is never part of the page's text. */
const SKIP_CONTENT = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'textarea',
])
/* Opening one of these closes an open <p> (the HTML parsing rule that matters for CMS output). */
const CLOSES_P = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'dl',
  'fieldset',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
])

const TOKEN =
  /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<\?[^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/g
const ATTR = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g

function parseAttrs(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of s.matchAll(ATTR)) {
    const name = (m[1] ?? '').toLowerCase()
    if (name && !(name in out))
      out[name] = decodeHtml(m[2] ?? m[3] ?? m[4] ?? '')
  }
  return out
}

/* HTML (a fragment or a whole document) → a tree under a synthetic `#root`. Unclosed tags close
   at their parent's end, stray end tags are ignored, <p>/<li>/<dt>/<dd>/<tr>/<td> close
   implicitly, script/style content is dropped. Text is entity-decoded. */
export function parseHtml(html: string): HNode {
  const root: HNode = { tag: '#root', attrs: {}, children: [] }
  const stack: Array<HNode> = [root]
  const top = () => stack[stack.length - 1] ?? root
  const text = (t: string) => {
    if (t) top().children.push(decodeHtml(t))
  }
  const closeTo = (tags: Array<string>, stopAt: Array<string> = []) => {
    for (let i = stack.length - 1; i > 0; i--) {
      const t = stack[i]?.tag ?? ''
      if (stopAt.includes(t)) return
      if (tags.includes(t)) {
        stack.length = i
        return
      }
    }
  }
  let lower: string | undefined
  let last = 0
  TOKEN.lastIndex = 0
  for (let m = TOKEN.exec(html); m; m = TOKEN.exec(html)) {
    text(html.slice(last, m.index))
    last = TOKEN.lastIndex
    if (m[1] !== undefined) {
      top().children.push(m[1])
      continue
    }
    const name = m[3]?.toLowerCase()
    if (!name) continue // comment, doctype, processing instruction
    if (m[2] === '/') {
      if (name === 'p' && !stack.some((n) => n.tag === 'p')) continue
      closeTo([name])
      continue
    }
    if (CLOSES_P.has(name))
      closeTo(['p'], ['button', 'td', 'th', 'li', 'blockquote', 'figure'])
    if (name === 'li') closeTo(['li'], ['ul', 'ol'])
    if (name === 'dt' || name === 'dd') closeTo(['dt', 'dd'], ['dl'])
    if (name === 'tr') closeTo(['tr'], ['table', 'tbody', 'thead', 'tfoot'])
    if (name === 'td' || name === 'th') closeTo(['td', 'th'], ['tr', 'table'])
    const node: HNode = {
      tag: name,
      attrs: parseAttrs(m[4] ?? ''),
      children: [],
    }
    if (SKIP_CONTENT.has(name)) {
      lower ??= html.toLowerCase()
      const end = lower.indexOf(`</${name}`, last)
      const close = end < 0 ? html.length : html.indexOf('>', end)
      last = close < 0 ? html.length : close + 1
      TOKEN.lastIndex = last
      continue
    }
    top().children.push(node)
    if (!VOID.has(name) && m[5] !== '/') stack.push(node)
  }
  text(html.slice(last))
  return root
}

export const isEl = (n: HNode | string): n is HNode => typeof n !== 'string'

export function textOf(n: HNode | string): string {
  if (typeof n === 'string') return n
  if (n.tag === 'br') return '\n'
  return n.children.map(textOf).join('')
}
export const cleanText = (s: string) => s.replace(/\s+/g, ' ').trim()

export function* elements(n: HNode): Generator<HNode> {
  for (const c of n.children)
    if (isEl(c)) {
      yield c
      yield* elements(c)
    }
}
export const findEl = (n: HNode, test: (e: HNode) => boolean) => {
  for (const e of elements(n)) if (test(e)) return e
  return undefined
}
const hasClass = (e: HNode, re: RegExp) => re.test(e.attrs.class ?? '')

/* A copy of `n` without the elements `drop` says to drop. */
export function without(n: HNode, drop: (e: HNode) => boolean): HNode {
  return {
    ...n,
    children: n.children
      .filter((c) => !isEl(c) || !drop(c))
      .map((c) => (isEl(c) ? without(c, drop) : c)),
  }
}

// ---- URLs ----

export function absolute(
  href: string | undefined,
  base: string,
): string | undefined {
  if (!href) return undefined
  const v = href.trim()
  if (!v || v.startsWith('data:') || /^javascript:/i.test(v)) return undefined
  try {
    return new URL(v, base).href
  } catch {
    return undefined
  }
}

/* A link in imported text: same-site links become paths (the new site answers them, through the
   redirect map when the path changed), everything else stays absolute. */
export function linkHref(
  href: string | undefined,
  base: string,
  origin: string,
): string | undefined {
  const abs = absolute(href, base)
  if (!abs) return href?.startsWith('#') ? href : undefined
  const u = new URL(abs)
  if (u.origin === origin) return u.pathname + u.search + u.hash
  return u.protocol === 'http:' ||
    u.protocol === 'https:' ||
    u.protocol === 'mailto:' ||
    u.protocol === 'tel:'
    ? abs
    : undefined
}

/* "/news/2024/05/hello/" → "/news/2024/05/hello"; "" → "/". */
export function normalPath(path: string): string {
  let p = path.replace(/\/{2,}/g, '/').replace(/\/index\.html?$/i, '/')
  if (!p.startsWith('/')) p = `/${p}`
  if (p.length > 1) p = p.replace(/\/+$/, '')
  return p || '/'
}

export const slugify = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, '-')
    .replace(/-*\/-*/g, '/')
    .replace(/^[-/]+|[-/]+$/g, '')

/* Best image URL of an <img>: the widest srcset candidate, else src / lazy-load attributes. */
export function imgUrl(e: HNode, base: string): string | undefined {
  const set = e.attrs.srcset ?? e.attrs['data-srcset']
  if (set) {
    let best: { url: string; w: number } | undefined
    for (const part of set.split(/,\s+/)) {
      const [u, d] = part.trim().split(/\s+/)
      const w = Number((d ?? '').replace(/[wx]$/, '')) || 0
      if (u && (!best || w > best.w)) best = { url: u, w }
    }
    const abs = absolute(best?.url, base)
    if (abs) return abs
  }
  return absolute(
    e.attrs['data-src'] ?? e.attrs['data-lazy-src'] ?? e.attrs.src,
    base,
  )
}

// ---- Portable Text ----

export type Span = {
  _type: 'span'
  _key: string
  text: string
  marks: Array<string>
}
export type LinkDef = { _type: 'link'; _key: string; href: string }
export type Block = {
  _type: 'block'
  _key: string
  style: string
  markDefs: Array<LinkDef>
  children: Array<Span>
  listItem?: 'bullet' | 'number'
  level?: number
}
export type ImageBlock = {
  _type: 'imageWithAlt'
  _key: string
  alt?: string
  caption?: Array<Block>
}
export type EmbedBlock = { _type: 'embed'; _key: string; url: string }
export type PtNode = Block | ImageBlock | EmbedBlock
export type ImageRef = {
  key: string
  url: string
  alt: string
  caption?: string
}

const DECORATORS: Record<string, string> = {
  strong: 'strong',
  b: 'strong',
  em: 'em',
  i: 'em',
  cite: 'em',
  code: 'code',
  kbd: 'code',
  samp: 'code',
  u: 'underline',
  ins: 'underline',
  s: 'strike-through',
  strike: 'strike-through',
  del: 'strike-through',
}
const EMBED_TAGS = new Set(['iframe', 'video', 'audio', 'embed', 'object'])
const LIST_TAGS = new Set(['ul', 'ol'])
const TEXT_BLOCKS = new Set([
  'p',
  'pre',
  'address',
  'dt',
  'dd',
  'figcaption',
  'caption',
  'summary',
  'legend',
])
const CONTAINERS = new Set([
  'div',
  'section',
  'article',
  'main',
  'header',
  'footer',
  'aside',
  'nav',
  'dl',
  'details',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'center',
  'fieldset',
  'form',
  'hgroup',
  'picture',
  '#root',
  'body',
  'html',
])

/* A single plain block (image captions, excerpts). */
export function plainBlock(text: string, key: string): Block {
  return {
    _type: 'block',
    _key: key,
    style: 'normal',
    markDefs: [],
    children: [{ _type: 'span', _key: `${key}s0`, text, marks: [] }],
  }
}

type BlockProps = {
  style: string
  listItem?: 'bullet' | 'number'
  level?: number
}

/* HTML → Portable Text: headings, paragraphs, block quotes, nested lists, links (same-site links
   become paths), bold/italic/code/underline/strike, images (standalone, inline or in a <figure>
   with its caption) and embeds (iframes, video, WordPress embed blocks) as `embed` blocks with
   the URL. Tables flatten to one line per row. Keys are deterministic (`<prefix><n>`), so a
   re-import produces the same document. */
export function htmlToPortableText(
  input: string | HNode,
  o: { base: string; origin?: string; keyPrefix?: string },
): { blocks: Array<PtNode>; images: Array<ImageRef>; embeds: Array<string> } {
  const tree = typeof input === 'string' ? parseHtml(input) : input
  const origin = o.origin ?? new URL(o.base).origin
  const prefix = o.keyPrefix ?? 'b'
  const blocks: Array<PtNode> = []
  const images: Array<ImageRef> = []
  const embeds: Array<string> = []
  let n = 0
  const nextKey = () => `${prefix}${n++}`
  let pending: BlockProps = { style: 'normal' }
  let cur: Block | undefined
  let quote = false

  const close = () => {
    const b = cur
    cur = undefined
    if (!b) return
    // Merge neighbours with the same marks, trim the block's edges, drop empty spans.
    const merged: Array<Span> = []
    for (const s of b.children) {
      const prev = merged[merged.length - 1]
      if (prev && prev.marks.join() === s.marks.join()) prev.text += s.text
      else merged.push({ ...s })
    }
    const first = merged[0]
    if (first) first.text = first.text.replace(/^[ \n]+/, '')
    const lastSpan = merged[merged.length - 1]
    if (lastSpan) lastSpan.text = lastSpan.text.replace(/[ \n]+$/, '')
    const kids = merged.filter((s) => s.text)
    if (!kids.some((s) => /\S/.test(s.text))) return
    kids.forEach((s, i) => (s._key = `${b._key}s${i}`))
    const used = new Set(kids.flatMap((s) => s.marks))
    b.children = kids
    b.markDefs = b.markDefs.filter((d) => used.has(d._key))
    blocks.push(b)
  }
  const start = (props: BlockProps) => {
    close()
    pending = props
  }
  const block = () => {
    if (!cur) {
      const key = nextKey()
      const style =
        quote && pending.style === 'normal' ? 'blockquote' : pending.style
      cur = {
        _type: 'block',
        _key: key,
        style,
        markDefs: [],
        children: [],
        ...(pending.listItem && {
          listItem: pending.listItem,
          level: pending.level ?? 1,
        }),
      }
    }
    return cur
  }
  const append = (text: string, marks: Array<string>, pre: boolean) => {
    const t = pre
      ? text
      : text.replace(/[ \t\r\n\f ]+/g, (w) => (w.includes(' ') ? ' ' : ' '))
    if (!t) return
    if (!cur && !/\S/.test(t)) return
    const b = block()
    const prevText = b.children[b.children.length - 1]?.text ?? ''
    const out =
      !pre && (prevText.endsWith(' ') || prevText.endsWith('\n') || !prevText)
        ? t.replace(/^ /, '')
        : t
    if (out) b.children.push({ _type: 'span', _key: '', text: out, marks })
  }
  const image = (e: HNode, caption?: string) => {
    const url = imgUrl(e, o.base)
    if (!url) return
    const props = pending
    close()
    const key = nextKey()
    const alt = cleanText(e.attrs.alt ?? '')
    const cap = caption ? cleanText(caption) : ''
    blocks.push({
      _type: 'imageWithAlt',
      _key: key,
      ...(alt && { alt }),
      ...(cap && { caption: [plainBlock(cap, `${key}c`)] }),
    })
    images.push({ key, url, alt, ...(cap && { caption: cap }) })
    pending = props
  }
  const embedUrl = (e: HNode): string | undefined => {
    const src = e.attrs.src ?? e.attrs['data-src'] ?? e.attrs.data
    if (src) return absolute(src, o.base)
    const source = findEl(e, (x) => x.tag === 'source' && !!x.attrs.src)
    return absolute(source?.attrs.src, o.base)
  }
  const embed = (url: string | undefined) => {
    if (!url) return
    const props = pending
    close()
    blocks.push({ _type: 'embed', _key: nextKey(), url })
    embeds.push(url)
    pending = props
  }

  const inline = (node: HNode | string, marks: Array<string>, pre: boolean) => {
    if (typeof node === 'string') return append(node, marks, pre)
    const tag = node.tag
    if (tag === 'br') return append('\n', marks, true)
    if (tag === 'img') return image(node)
    if (EMBED_TAGS.has(tag)) return embed(embedUrl(node))
    if (
      tag === 'svg' ||
      tag === 'button' ||
      tag === 'input' ||
      tag === 'select'
    )
      return
    if (
      LIST_TAGS.has(tag) ||
      CLOSES_P.has(tag) ||
      tag === 'li' ||
      tag === 'figure'
    )
      // Block content inside an inline context (loose CMS markup): handled as a block.
      return walk({ tag: '#root', attrs: {}, children: [node] }, 1)
    let m = marks
    const deco = DECORATORS[tag]
    if (deco && !m.includes(deco)) m = [...m, deco]
    if (tag === 'a') {
      const kids = node.children.filter((c) => isEl(c) || /\S/.test(c))
      const only = kids.length === 1 ? kids[0] : undefined
      if (only && isEl(only) && only.tag === 'img') return image(only)
      const href = linkHref(node.attrs.href, o.base, origin)
      if (href) {
        const b = block()
        const key = `${b._key}l${b.markDefs.length}`
        b.markDefs.push({ _type: 'link', _key: key, href })
        m = [...m, key]
      }
    }
    const isPre = pre || tag === 'pre'
    for (const c of node.children) inline(c, m, isPre)
  }

  const listItem = (li: HNode, kind: 'bullet' | 'number', level: number) => {
    start({ style: 'normal', listItem: kind, level })
    for (const c of li.children) {
      if (isEl(c) && LIST_TAGS.has(c.tag)) {
        close()
        list(c, level + 1)
        pending = { style: 'normal', listItem: kind, level }
      } else if (isEl(c) && (c.tag === 'p' || c.tag === 'div')) {
        for (const g of c.children) inline(g, [], false)
      } else inline(c, [], false)
    }
    close()
  }
  const list = (e: HNode, level: number) => {
    const kind = e.tag === 'ol' ? 'number' : 'bullet'
    for (const c of e.children)
      if (isEl(c) && c.tag === 'li') listItem(c, kind, level)
      else if (isEl(c) && LIST_TAGS.has(c.tag)) list(c, level + 1)
  }
  const figure = (e: HNode) => {
    const caption = findEl(e, (x) => x.tag === 'figcaption')
    const capText = caption ? textOf(caption) : undefined
    if (
      hasClass(e, /\bwp-block-embed\b/) ||
      hasClass(e, /\bwp-block-video\b/)
    ) {
      const frame = findEl(e, (x) => EMBED_TAGS.has(x.tag))
      const url = frame
        ? embedUrl(frame)
        : absolute(/https?:\/\/\S+/.exec(textOf(e))?.[0], o.base)
      if (url) return embed(url)
    }
    const quoteEl = findEl(e, (x) => x.tag === 'blockquote')
    if (quoteEl) return walk(e, 0)
    const imgs = [...elements(e)].filter((x) => x.tag === 'img')
    if (imgs.length === 1 && imgs[0]) {
      start({ style: 'normal' })
      return image(imgs[0], capText)
    }
    const frame = findEl(e, (x) => EMBED_TAGS.has(x.tag))
    if (frame && !imgs.length) return embed(embedUrl(frame))
    // A gallery: every image, the caption as its own paragraph.
    walk(caption ? without(e, (x) => x === caption) : e, 0)
    if (capText && cleanText(capText)) {
      start({ style: 'normal' })
      append(capText, [], false)
      close()
    }
  }

  const walk = (e: HNode, depth: number) => {
    for (const c of e.children) {
      if (typeof c === 'string') {
        inline(c, [], false)
        continue
      }
      const tag = c.tag
      const h = /^h([1-6])$/.exec(tag)
      if (h) {
        start({ style: `h${h[1] ?? '2'}` })
        for (const g of c.children) inline(g, [], false)
        start({ style: 'normal' })
      } else if (tag === 'blockquote') {
        start({ style: 'normal' })
        const was = quote
        quote = true
        walk(c, depth + 1)
        close()
        quote = was
      } else if (LIST_TAGS.has(tag)) {
        close()
        list(c, 1)
        pending = { style: 'normal' }
      } else if (tag === 'li') {
        listItem(c, 'bullet', 1)
        pending = { style: 'normal' }
      } else if (tag === 'figure') {
        close()
        figure(c)
        pending = { style: 'normal' }
      } else if (tag === 'tr') {
        start({ style: 'normal' })
        const cells = c.children.filter(isEl)
        cells.forEach((cell, i) => {
          if (i) append(' · ', [], true)
          for (const g of cell.children) inline(g, [], false)
        })
        close()
      } else if (TEXT_BLOCKS.has(tag)) {
        start({ style: 'normal' })
        const pre = tag === 'pre'
        for (const g of c.children) inline(g, pre ? ['code'] : [], pre)
        close()
      } else if (tag === 'hr') close()
      else if (CONTAINERS.has(tag)) {
        close()
        walk(c, depth + 1)
        close()
      } else inline(c, [], false)
    }
  }
  walk(tree, 0)
  close()
  return { blocks, images, embeds }
}

/* Plain text of Portable Text blocks (tests, previews). */
export const ptText = (blocks: Array<PtNode>) =>
  blocks
    .map((b) =>
      b._type === 'block'
        ? b.children.map((s) => s.text).join('')
        : `[${b._type}]`,
    )
    .join('\n')

// ---- ids ----

/* Deterministic per source URL, so a re-run upserts the same document. A hyphen, not the plan's
   dot: the dataset is public, and Sanity hides dotted (path) ids from unauthenticated reads, so
   `imported.<sha1>` documents would never reach the site. */
export const ID_PREFIX = 'imported-'
export const sha1 = (s: string | Uint8Array) =>
  createHash('sha1').update(s).digest('hex')
export const importId = (sourceUrl: string) =>
  `${ID_PREFIX}${sha1(canonicalUrl(sourceUrl))}`
/* The same page however the source spelled it: no fragment, no trailing slash, lower-case host. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    u.pathname = normalPath(u.pathname)
    return u.href
  } catch {
    return url.trim()
  }
}

// ---- WordPress REST ----

/* Post types that are content (not menus, templates, blocks, fonts or the media library). */
const WP_INTERNAL =
  /^(attachment|nav_menu_item|wp_block|wp_template|wp_template_part|wp_navigation|wp_global_styles|wp_font_family|wp_font_face|revision|customize_changeset|oembed_cache|user_request|custom_css)$/
export type WpType = { name: string; restBase: string; label: string }

export function wpContentTypes(types: unknown): Array<WpType> {
  const out: Array<WpType> = []
  for (const [key, raw] of Object.entries(rec(types))) {
    const t = rec(raw)
    const name = str(t.slug) ?? key
    const restBase = str(t.rest_base)
    if (!restBase || WP_INTERNAL.test(name)) continue
    if (t.viewable === false) continue
    out.push({ name, restBase, label: str(t.name) ?? name })
  }
  // Pages first (usually few), then posts, then custom types in the API's order.
  const order = (n: string) => (n === 'page' ? 0 : n === 'post' ? 1 : 2)
  return out.sort((a, b) => order(a.name) - order(b.name))
}

/* A route on a WordPress REST root, pretty ("…/wp-json/") or plain ("…/?rest_route=/"). */
export function wpUrl(
  api: string,
  route: string,
  params: Record<string, string>,
): string {
  if (/[?&]rest_route=/.test(api)) {
    const u = new URL(api)
    u.searchParams.set('rest_route', `/${route.replace(/^\/+/, '')}`)
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
    return u.href
  }
  const q = new URLSearchParams(params).toString()
  return `${api.replace(/\/?$/, '/')}${route.replace(/^\/+/, '')}${q ? `?${q}` : ''}`
}

/* WordPress serves resized copies ("photo-1024x768.jpg"); the original ("photo.jpg") is tried
   first, the URL as found second. */
export function originalImageUrls(url: string): Array<string> {
  // Jetpack's image CDN (i0.wp.com/<host>/<path>?w=…) in front of the site's own file.
  const cdn = /^https?:\/\/i[0-3]\.wp\.com\/([^?#]+)/.exec(url)?.[1]
  const own = cdn ? `https://${cdn}` : url
  const m =
    /^(.*\/wp-content\/uploads\/.+?)-\d+x\d+(\.(?:jpe?g|png|gif|webp|avif))(\?.*)?$/i.exec(
      own,
    )
  return [...new Set([...(m ? [`${m[1] ?? ''}${m[2] ?? ''}`] : []), own, url])]
}

const rendered = (v: unknown) => str(rec(v).rendered) ?? str(v) ?? ''

/* The site root a WordPress install lives at ("https://wordpress.org/news"), from its API root
   ("https://wordpress.org/news/wp-json/"). */
export const wpHome = (apiRoot: string) =>
  apiRoot.replace(/\/wp-json\/?.*$/, '').replace(/\/+$/, '')

/* Path of `link` below the site root: "https://x.org/news/about/team/" → "about/team"; the
   root itself → "home". */
export function pathBelow(link: string, home: string): string {
  let p: string
  try {
    p = new URL(link).pathname
  } catch {
    return ''
  }
  let root = '/'
  try {
    root = new URL(home).pathname
  } catch {
    // keep "/"
  }
  const base = normalPath(root)
  let rest = normalPath(p)
  if (base !== '/' && (rest === base || rest.startsWith(`${base}/`)))
    rest = rest.slice(base.length) || '/'
  const slug = rest.replace(/^\/+|\/+$/g, '')
  return slug || 'home'
}

/* One item of `/wp/v2/<type>?_embed`. Undefined for anything not public (password-protected,
   not published): the importer never reads what sits behind a login. */
export function wpItem(
  raw: unknown,
  type: string,
  home: string,
): Item | undefined {
  const r = rec(raw)
  const id = str(r.id)
  const link = str(r.link)
  if (!id || !link) return undefined
  if (r.status !== undefined && r.status !== 'publish') return undefined
  const content = rec(r.content)
  if (content.protected === true) return undefined
  const emb = rec(r._embedded)
  const media = rec(list(emb['wp:featuredmedia'])[0])
  const mediaUrl = str(media.source_url)
  const terms = list(emb['wp:term'])
    .flatMap((group) => list(group))
    .map((t) => str(rec(t).name))
    .filter((t): t is string => !!t)
    .map((t) => decodeHtml(t))
  const author = str(rec(list(emb.author)[0]).name)
  const date = str(r.date_gmt) ? `${str(r.date_gmt) ?? ''}Z` : str(r.date)
  const excerpt = cleanText(textOf(parseHtml(rendered(r.excerpt)))).replace(
    /\s*\[(…|&hellip;|\.\.\.)\]\s*$/,
    '…',
  )
  const slug =
    type === 'page'
      ? pathBelow(link, home)
      : (str(r.slug) ?? pathBelow(link, home))
  const meta: Rec = {}
  for (const k of [
    'modified_gmt',
    'format',
    'sticky',
    'template',
    'parent',
    'menu_order',
    'categories',
    'tags',
    'comment_status',
    'guid',
  ])
    if (
      r[k] !== undefined &&
      r[k] !== '' &&
      !(Array.isArray(r[k]) && !list(r[k]).length)
    )
      meta[k] = k === 'guid' ? rendered(r[k]) : r[k]
  return {
    sourceUrl: link,
    sourceId: id,
    sourceType: type,
    title: cleanText(decodeHtml(textOf(parseHtml(rendered(r.title))))) || slug,
    slug,
    ...(date && { date }),
    ...(excerpt && { excerpt }),
    html: str(content.rendered) ?? '',
    ...(mediaUrl && {
      featured: {
        url: mediaUrl,
        alt: str(media.alt_text) ?? '',
        ...(cleanText(textOf(parseHtml(rendered(media.caption)))) && {
          caption: cleanText(textOf(parseHtml(rendered(media.caption)))),
        }),
      },
    }),
    terms: [...new Set(terms)],
    ...(author && { author }),
    meta,
  }
}

// ---- WXR (WordPress export .xml) ----

const cdata = (s: string) =>
  s.includes('<![CDATA[')
    ? [...s.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/g)]
        .map((m) => m[1] ?? '')
        .join('')
    : decodeHtml(s)
function xmlTag(block: string, tag: string): string | undefined {
  const re = new RegExp(
    `<${tag.replace(':', '\\:')}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag.replace(':', '\\:')}>`,
    'i',
  )
  const m = re.exec(block)
  return m ? cdata(m[1] ?? '').trim() : undefined
}

export type WxrResult = {
  site: string
  items: Array<Item>
  /** Not imported: drafts, private posts, attachments (their files come in through the posts). */
  skipped: Record<string, number>
  attachments: number
}

export function parseWxr(xml: string): WxrResult {
  const channel = xml.split(/<item[\s>]/i)[0] ?? ''
  const site =
    xmlTag(channel, 'wp:base_blog_url') ?? xmlTag(channel, 'link') ?? ''
  const blocks = [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)].map(
    (m) => m[1] ?? '',
  )
  const attachments = new Map<string, { url: string; alt: string }>()
  const posts: Array<string> = []
  const skipped: Record<string, number> = {}
  for (const b of blocks) {
    const type = xmlTag(b, 'wp:post_type') ?? 'post'
    if (type === 'attachment') {
      const id = xmlTag(b, 'wp:post_id')
      const url = xmlTag(b, 'wp:attachment_url')
      const alt = [...b.matchAll(/<wp:postmeta>([\s\S]*?)<\/wp:postmeta>/g)]
        .map((m) => m[1] ?? '')
        .find((pm) => xmlTag(pm, 'wp:meta_key') === '_wp_attachment_image_alt')
      if (id && url)
        attachments.set(id, {
          url,
          alt: alt ? (xmlTag(alt, 'wp:meta_value') ?? '') : '',
        })
      continue
    }
    posts.push(b)
  }
  const items: Array<Item> = []
  for (const b of posts) {
    const type = xmlTag(b, 'wp:post_type') ?? 'post'
    const status = xmlTag(b, 'wp:status') ?? 'publish'
    if (WP_INTERNAL.test(type)) {
      skipped[type] = (skipped[type] ?? 0) + 1
      continue
    }
    if (status !== 'publish' || (xmlTag(b, 'wp:post_password') ?? '') !== '') {
      skipped[status === 'publish' ? 'password' : status] =
        (skipped[status === 'publish' ? 'password' : status] ?? 0) + 1
      continue
    }
    const id = xmlTag(b, 'wp:post_id') ?? ''
    const link = xmlTag(b, 'link') ?? xmlTag(b, 'guid') ?? ''
    const postmeta = new Map<string, string>()
    for (const m of b.matchAll(/<wp:postmeta>([\s\S]*?)<\/wp:postmeta>/g)) {
      const k = xmlTag(m[1] ?? '', 'wp:meta_key')
      const v = xmlTag(m[1] ?? '', 'wp:meta_value')
      if (k && v !== undefined) postmeta.set(k, v)
    }
    const thumb = attachments.get(postmeta.get('_thumbnail_id') ?? '')
    const terms = [
      ...b.matchAll(/<category\b[^>]*>([\s\S]*?)<\/category>/g),
    ].map((m) => cdata(m[1] ?? '').trim())
    const gmt = xmlTag(b, 'wp:post_date_gmt')
    const date =
      gmt && !gmt.startsWith('0000')
        ? `${gmt.replace(' ', 'T')}Z`
        : (xmlTag(b, 'wp:post_date')?.replace(' ', 'T') ?? undefined)
    const excerpt = cleanText(
      textOf(parseHtml(xmlTag(b, 'excerpt:encoded') ?? '')),
    )
    const author = xmlTag(b, 'dc:creator')
    const meta: Rec = {}
    for (const [k, v] of postmeta) if (!k.startsWith('_')) meta[k] = v
    const parent = xmlTag(b, 'wp:post_parent')
    if (parent && parent !== '0') meta.parent = parent
    const name = xmlTag(b, 'wp:post_name') ?? ''
    items.push({
      sourceUrl: link,
      sourceId: id || link,
      sourceType: type,
      title: cleanText(xmlTag(b, 'title') ?? '') || name,
      slug:
        type === 'page' && site && link
          ? pathBelow(link, site)
          : name || slugify(xmlTag(b, 'title') ?? ''),
      ...(date && { date }),
      ...(excerpt && { excerpt }),
      html: xmlTag(b, 'content:encoded') ?? '',
      ...(thumb && { featured: { url: thumb.url, alt: thumb.alt } }),
      terms: [...new Set(terms.filter(Boolean))],
      ...(author && { author }),
      meta,
    })
  }
  return { site, items, skipped, attachments: attachments.size }
}

// ---- JSON / CSV exports: {url, title, date, body, images} ----

/* Plain text (no tags) → paragraphs split on blank lines. */
const asHtml = (body: string) =>
  /<[a-z][\s\S]*>/i.test(body)
    ? body
    : body
        .split(/\n\s*\n/)
        .map(
          (p) =>
            `<p>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`,
        )
        .join('\n')

function images(v: unknown): Array<SourceImage> {
  const raw = typeof v === 'string' ? v.split(/[\s|;]+/) : list(v)
  const out: Array<SourceImage> = []
  for (const x of raw) {
    if (typeof x === 'string') {
      if (x.trim()) out.push({ url: x.trim(), alt: '' })
    } else if (isRec(x)) {
      const url = str(x.url) ?? str(x.src)
      if (url)
        out.push({
          url,
          alt: str(x.alt) ?? '',
          ...(str(x.caption) && { caption: str(x.caption) }),
        })
    }
  }
  return out
}

/* One export row. `type` is optional (post, page, …); without it the first path segment decides
   later (see `groupType`). Extra columns/keys are kept in `meta`. */
export function exportItem(raw: Rec, index: number): Item | undefined {
  const url = str(raw.url) ?? str(raw.link)
  const title = str(raw.title)
  if (!url || !title) return undefined
  let abs: string
  try {
    abs = new URL(url).href
  } catch {
    return undefined
  }
  const imgs = images(raw.images ?? raw.image)
  const [featured, ...rest] = imgs
  const body = str(raw.body) ?? str(raw.content) ?? str(raw.html) ?? ''
  const extra = rest
    .map(
      (i) =>
        `<img src="${i.url.replace(/"/g, '&quot;')}" alt="${i.alt.replace(/"/g, '&quot;')}">`,
    )
    .join('\n')
  const date = str(raw.date)
  const known = new Set([
    'url',
    'link',
    'title',
    'date',
    'body',
    'content',
    'html',
    'images',
    'image',
    'type',
    'slug',
    'excerpt',
    'tags',
    'author',
    'id',
  ])
  const meta: Rec = {}
  for (const [k, v] of Object.entries(raw))
    if (!known.has(k) && v !== '' && v !== undefined) meta[k] = v
  const tags = raw.tags
  const terms =
    typeof tags === 'string'
      ? tags.split(/[,;|]/)
      : list(tags).map((t) => str(t) ?? '')
  const parsedDate =
    date && Number.isFinite(Date.parse(date))
      ? new Date(Date.parse(date)).toISOString()
      : undefined
  return {
    sourceUrl: abs,
    sourceId: str(raw.id) ?? abs,
    sourceType: str(raw.type) ?? '',
    title,
    slug:
      str(raw.slug) ??
      slugify(
        new URL(abs).pathname.split('/').filter(Boolean).pop() ??
          `item-${index}`,
      ),
    ...(parsedDate && { date: parsedDate }),
    ...(str(raw.excerpt) && { excerpt: str(raw.excerpt) }),
    html: [asHtml(body), extra].filter(Boolean).join('\n'),
    ...(featured && { featured }),
    terms: terms.map((t) => t.trim()).filter(Boolean),
    ...(str(raw.author) && { author: str(raw.author) }),
    meta,
  }
}

export function parseJsonExport(text: string): Array<Item> {
  const data: unknown = JSON.parse(text)
  const rows = Array.isArray(data)
    ? data
    : list(rec(data).items ?? rec(data).posts ?? rec(data).documents)
  return rows.flatMap((r, i) => {
    const it = isRec(r) ? exportItem(r, i) : undefined
    return it ? [it] : []
  })
}

/* RFC 4180: quoted fields, doubled quotes, newlines inside quotes, CRLF. */
export function parseCsvRows(text: string): Array<Array<string>> {
  const rows: Array<Array<string>> = []
  let row: Array<string> = []
  let field = ''
  let quoted = false
  const s = text.replace(/^﻿/, '')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"' && !field) quoted = true
    else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.some((f) => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f !== '')) rows.push(row)
  return rows
}

export function parseCsvExport(text: string): Array<Item> {
  const [header, ...rows] = parseCsvRows(text)
  if (!header) return []
  const keys = header.map((h) => h.trim().toLowerCase())
  return rows.flatMap((r, i) => {
    const obj: Rec = {}
    keys.forEach((k, j) => (obj[k] = r[j] ?? ''))
    const it = exportItem(obj, i)
    return it ? [it] : []
  })
}

// ---- HTML crawl (fallback): one page's readable content ----

/* Zero-sized SnapNode twin of an HNode tree, so the crawler's own chrome finder
   (website-lib.ts `findChrome`: header / nav / footer / main landmarks) decides what is site
   chrome without a browser. With no layout every landmark counts as near the top/bottom, which
   is what the landmark order in the markup already says. */
function snapOf(n: HNode, map: Map<SnapNode, HNode>): SnapNode {
  const s: SnapNode = {
    tag: n.tag === '#root' ? 'body' : n.tag,
    id: n.attrs.id ?? '',
    cls: n.attrs.class ?? '',
    role: n.attrs.role ?? '',
    label: n.attrs['aria-label'] ?? '',
    box: [0, 0, 0, 0],
    bg: null,
    bgImage: null,
    color: null,
    font: null,
    text: '',
    ownText: false,
    href: n.attrs.href ?? null,
    src: n.attrs.src ?? null,
    alt: n.attrs.alt ?? null,
    level: /^h[1-6]$/.test(n.tag) ? Number(n.tag[1]) : null,
    inputType: null,
    layout: null,
    radius: null,
    children: [],
  }
  map.set(s, n)
  s.children = n.children.filter(isEl).map((c) => snapOf(c, map))
  return s
}

const metaContent = (doc: HNode, key: string) =>
  findEl(
    doc,
    (e) =>
      e.tag === 'meta' && (e.attrs.property === key || e.attrs.name === key),
  )?.attrs.content
const NOT_CONTENT = new Set([
  'nav',
  'form',
  'aside',
  'footer',
  'button',
  'svg',
  'input',
  'select',
  'textarea',
  'dialog',
])
const NOT_CONTENT_ROLE =
  /^(navigation|complementary|search|banner|contentinfo|dialog)$/
const SHARING =
  /\b(share|sharing|sharedaddy|social|related|comments?|comment-respond|breadcrumbs?|pagination|nav-links|post-navigation|screen-reader-text|skip-link)\b/i

export type PageContent = {
  title: string
  date?: string
  excerpt?: string
  featured?: SourceImage
  /** The main content only: chrome, navigation, forms, sharing and comment widgets removed. */
  body: HNode
}

/* Readable content of a crawled page: <main> (or the one <article> inside it, or the body minus
   header/nav/footer), the title from og:title / the first <h1> / <title>, the published date
   from article:published_time, a <time datetime> or JSON-LD, og:image as the featured image. */
export function pageContent(html: string, url: string): PageContent {
  const doc = parseHtml(html)
  const map = new Map<SnapNode, HNode>()
  const body = findEl(doc, (e) => e.tag === 'body') ?? doc
  const snap = snapOf(body, map)
  const chrome = findChrome(snap)
  const chromeEls = new Set(
    [chrome.header, chrome.nav, chrome.footer].flatMap((s) =>
      s ? [map.get(s)] : [],
    ),
  )
  let root = (chrome.main && map.get(chrome.main)) ?? body
  const articles = [...elements(root)].filter((e) => e.tag === 'article')
  const firstArticle = articles[0]
  if (articles.length === 1 && firstArticle) root = firstArticle
  const content = without(
    root,
    (e) =>
      chromeEls.has(e) ||
      NOT_CONTENT.has(e.tag) ||
      NOT_CONTENT_ROLE.test(e.attrs.role ?? '') ||
      SHARING.test(`${e.attrs.class ?? ''} ${e.attrs.id ?? ''}`) ||
      e.attrs.hidden !== undefined ||
      e.attrs['aria-hidden'] === 'true',
  )
  const h1 = findEl(content, (e) => e.tag === 'h1')
  const docTitle = findEl(doc, (e) => e.tag === 'title')
  const title =
    cleanText(metaContent(doc, 'og:title') ?? '') ||
    (h1 ? cleanText(textOf(h1)) : '') ||
    cleanText(docTitle ? textOf(docTitle) : '').replace(
      /\s+[|–—-]\s+[^|–—-]+$/,
      '',
    )
  const time = findEl(content, (e) => e.tag === 'time' && !!e.attrs.datetime)
  const ld = /"datePublished"\s*:\s*"([^"]+)"/.exec(html)?.[1]
  const rawDate =
    metaContent(doc, 'article:published_time') ?? time?.attrs.datetime ?? ld
  const date =
    rawDate && Number.isFinite(Date.parse(rawDate))
      ? new Date(Date.parse(rawDate)).toISOString()
      : undefined
  const og = absolute(metaContent(doc, 'og:image'), url)
  const excerpt = cleanText(
    metaContent(doc, 'description') ?? metaContent(doc, 'og:description') ?? '',
  )
  // The title is its own field: drop the heading that repeats it.
  const bodyTree =
    h1 && cleanText(textOf(h1)) === title
      ? without(content, (e) => e === h1)
      : content
  return {
    title,
    ...(date && { date }),
    ...(excerpt && { excerpt }),
    ...(og && {
      featured: {
        url: og,
        alt: cleanText(metaContent(doc, 'og:image:alt') ?? ''),
      },
    }),
    body: bodyTree,
  }
}

/* A crawled page → an Item. `type` comes from `groupType` (the crawl knows the site's sections). */
export function pageItem(html: string, url: string, type: string): Item {
  const c = pageContent(html, url)
  const path = normalPath(new URL(url).pathname)
  const slug = path === '/' ? 'home' : slugify(path.slice(1))
  return {
    sourceUrl: url,
    sourceId: url,
    sourceType: type,
    title: c.title || slug,
    slug,
    ...(c.date && { date: c.date }),
    ...(c.excerpt && { excerpt: c.excerpt }),
    html: serialize(c.body),
    ...(c.featured && { featured: c.featured }),
    terms: [],
    meta: {},
  }
}

const escText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (s: string) => escText(s).replace(/"/g, '&quot;')
/* HNode → HTML (the crawl caches the cleaned body as HTML, like every other source). */
export function serialize(n: HNode | string): string {
  if (typeof n === 'string') return escText(n)
  const inner = n.children.map(serialize).join('')
  if (n.tag === '#root') return inner
  const attrs = Object.entries(n.attrs)
    .map(([k, v]) => ` ${k}="${escAttr(v)}"`)
    .join('')
  return VOID.has(n.tag)
    ? `<${n.tag}${attrs}>`
    : `<${n.tag}${attrs}>${inner}</${n.tag}>`
}

/* The source type of a crawled or exported page from its path: the manifest's collection whose
   list route it sits under (plan 07), else its first path segment when at least `min` known pages
   share it (/news/a, /news/b, /news/c → "news"), else "page". */
export function groupType(
  path: string,
  o: {
    collections?: Array<{ name: string; listRoute: string }>
    segmentCounts?: Map<string, number>
    min?: number
  },
): string {
  const p = normalPath(path)
  for (const c of o.collections ?? []) {
    const list = normalPath(c.listRoute)
    if (list !== '/' && p.startsWith(`${list}/`)) return c.name
  }
  const segs = p.split('/').filter(Boolean)
  const first = segs[0]
  if (
    segs.length >= 2 &&
    first &&
    (o.segmentCounts?.get(first) ?? 0) >= (o.min ?? 3)
  )
    return first
  return 'page'
}

// ---- target schema (from `sanity schema extract`) ----

export type FieldKind =
  | 'string'
  | 'number'
  | 'boolean'
  | 'slug'
  | 'richText'
  | 'image'
  | 'imageArray'
  | 'stringArray'
  | 'reference'
  | 'blocks'
  | 'object'
  | 'other'
export type TargetField = {
  name: string
  kind: FieldKind
  blockTypes?: Array<string>
}
export type TargetType = { name: string; fields: Array<TargetField> }

/* Types the importer never writes. */
const NOT_TARGETS = /^(sanity\.|siteSettings$|submission$|assist\.|media\.tag$)/

/* The extracted schema (`sanity schema extract` JSON: an array of {name, type, attributes|value})
   → document types with each field's kind. */
export function targetTypes(schema: unknown): Array<TargetType> {
  const entries = list(schema).filter(isRec)
  const named = new Map<string, Rec>()
  for (const e of entries) {
    const name = str(e.name)
    if (name) named.set(name, e)
  }
  const valueOf = (name: string): Rec => {
    const e = named.get(name)
    if (!e) return {}
    return e.type === 'document'
      ? { type: 'object', attributes: e.attributes }
      : rec(e.value)
  }
  const isBlockObject = (v: Rec) =>
    str(rec(rec(rec(v.attributes)._type).value).value) === 'block'
  const isImage = (v: Rec): boolean => {
    if (v.type === 'inline') return isImage(valueOf(str(v.name) ?? ''))
    return v.type === 'object' && 'asset' in rec(v.attributes)
  }
  const isRichText = (v: Rec): boolean => {
    if (v.type === 'inline') return isRichText(valueOf(str(v.name) ?? ''))
    if (v.type !== 'array') return false
    const of = rec(v.of)
    if (of.type === 'union')
      return list(of.of).some((x) => isBlockObject(rec(x)))
    return isBlockObject(of)
  }
  const kindOf = (v: Rec): TargetField => {
    const name = ''
    if (v.type === 'string') return { name, kind: 'string' }
    if (v.type === 'number') return { name, kind: 'number' }
    if (v.type === 'boolean') return { name, kind: 'boolean' }
    if (v.type === 'inline') {
      const ref = str(v.name) ?? ''
      if (ref === 'slug') return { name, kind: 'slug' }
      if (ref.endsWith('.reference')) return { name, kind: 'reference' }
      if (isRichText(v)) return { name, kind: 'richText' }
      if (isImage(v)) return { name, kind: 'image' }
      return { name, kind: valueOf(ref).type === 'object' ? 'object' : 'other' }
    }
    if (v.type === 'array') {
      if (isRichText(v)) return { name, kind: 'richText' }
      const of = rec(v.of)
      if (of.type === 'string') return { name, kind: 'stringArray' }
      if (of.type === 'union') {
        const names = list(of.of)
          .map((x) => str(rec(rec(x).rest).name))
          .filter((x): x is string => !!x)
        return { name, kind: 'blocks', blockTypes: names }
      }
      const rest = rec(of.rest)
      if (isImage(rest) || isImage(of)) return { name, kind: 'imageArray' }
      return { name, kind: 'other' }
    }
    if (v.type === 'object')
      return { name, kind: isImage(v) ? 'image' : 'object' }
    return { name, kind: 'other' }
  }
  const out: Array<TargetType> = []
  for (const e of entries) {
    const name = str(e.name)
    if (e.type !== 'document' || !name || NOT_TARGETS.test(name)) continue
    const fields: Array<TargetField> = []
    for (const [f, a] of Object.entries(rec(e.attributes))) {
      if (f.startsWith('_')) continue
      fields.push({ ...kindOf(rec(rec(a).value)), name: f })
    }
    out.push({ name, fields })
  }
  return out
}

// ---- mapping ----

/* Source type names that mean the same content, in the order a target is looked for. */
const SYNONYMS: Array<Array<string>> = [
  [
    'post',
    'posts',
    'article',
    'articles',
    'news',
    'blog',
    'journal',
    'stories',
    'story',
    'press',
    'updates',
    'update',
    'insights',
    'writing',
  ],
  ['page', 'pages'],
  ['author', 'authors', 'user', 'users', 'people', 'person', 'team', 'staff'],
  ['category', 'categories', 'topic', 'topics'],
  ['tag', 'tags'],
  [
    'artwork',
    'artworks',
    'work',
    'works',
    'portfolio',
    'projects',
    'project',
    'paintings',
    'painting',
    'pieces',
  ],
  ['exhibition', 'exhibitions', 'shows', 'show'],
  ['event', 'events', 'tribe_events'],
  ['artist', 'artists'],
]
/* Plan 07 collection names → template types (same table as scripts/pages.ts). */
const COLLECTION_TYPES: Array<[RegExp, string]> = [
  [
    /^(work|works|artworks?|paintings?|drawings?|sculptures?|portfolio|projects?|pieces|collection)$/i,
    'artwork',
  ],
  [/^(news|blog|journal|posts?|articles?|writing|stories|press)$/i, 'post'],
  [/^(exhibitions?|shows?)$/i, 'exhibition'],
  [/^(artists?)$/i, 'artist'],
]
/* Taxonomies and people: documents only when the schema has a type for them; otherwise their
   names stay on the items (tags / sourceMeta). */
export const FOLDED = new Set(['category', 'tag', 'author'])

export type TypeMapping = {
  source: string
  count: number
  target?: string
  how: 'name' | 'synonym' | 'collection' | 'fallback' | 'folded' | 'none'
}

export function resolveTypes(
  sources: Array<{ name: string; count: number }>,
  targets: Array<TargetType>,
  collections: Array<{ name: string }> = [],
): Array<TypeMapping> {
  const has = (n: string) => targets.some((t) => t.name === n)
  return sources.map(({ name, count }) => {
    const s = name.toLowerCase()
    if (has(name)) return { source: name, count, target: name, how: 'name' }
    const group = SYNONYMS.find((g) => g.includes(s))
    const syn = group?.find(has)
    if (syn) return { source: name, count, target: syn, how: 'synonym' }
    const col = collections.find((c) => c.name.toLowerCase() === s)
    const colType = COLLECTION_TYPES.find(([re]) =>
      re.test(col?.name ?? s),
    )?.[1]
    if (colType && has(colType))
      return { source: name, count, target: colType, how: 'collection' }
    const canonical = group?.[0] ?? s
    if (FOLDED.has(canonical)) return { source: name, count, how: 'folded' }
    if (has('page'))
      return { source: name, count, target: 'page', how: 'fallback' }
    return { source: name, count, how: 'none' }
  })
}

export type FieldPlan = {
  title?: string
  slug?: string
  date?: string
  excerpt?: string
  body?: string
  /** `page`-style: the body goes into this array as one `richTextBlock`. */
  blocks?: string
  image?: string
  images?: string
  terms?: string
}

const pick = (t: TargetType, kinds: Array<FieldKind>, names: Array<string>) =>
  names.find((n) =>
    t.fields.some((f) => f.name === n && kinds.includes(f.kind)),
  )

export function fieldPlan(t: TargetType): FieldPlan {
  const title = pick(t, ['string'], ['title', 'name', 'heading', 'label'])
  const slug = t.fields.find((f) => f.kind === 'slug')?.name
  const date = pick(
    t,
    ['string'],
    [
      'date',
      'publishedAt',
      'published',
      'publishDate',
      'datePublished',
      'start',
      'releaseDate',
    ],
  )
  const excerpt = pick(
    t,
    ['string'],
    [
      'excerpt',
      'summary',
      'description',
      'intro',
      'lede',
      'subtitle',
      'standfirst',
    ],
  )
  const body = pick(
    t,
    ['richText'],
    ['body', 'content', 'text', 'description', 'bio', 'copy', 'article'],
  )
  const blocksField = t.fields.find(
    (f) =>
      f.kind === 'blocks' && (f.blockTypes ?? []).includes('richTextBlock'),
  )
  const image = pick(
    t,
    ['image'],
    [
      'image',
      'mainImage',
      'featuredImage',
      'coverImage',
      'cover',
      'heroImage',
      'thumbnail',
      'portrait',
      'photo',
    ],
  )
  const images = pick(
    t,
    ['imageArray'],
    ['images', 'gallery', 'photos', 'media'],
  )
  const terms = pick(
    t,
    ['stringArray'],
    ['tags', 'categories', 'keywords', 'topics'],
  )
  return {
    ...(title && { title }),
    ...(slug && { slug }),
    ...(date && { date }),
    ...(excerpt && excerpt !== body && { excerpt }),
    ...(body ? { body } : blocksField && { blocks: blocksField.name }),
    ...(image ? { image } : images && { images }),
    ...(terms && { terms }),
  }
}

/* The mapping table's field lines for one type: source field → target field. */
export function fieldLines(plan: FieldPlan): Array<[string, string]> {
  const out: Array<[string, string]> = []
  const put = (from: string, to: string | undefined) =>
    out.push([from, to ?? 'sourceMeta'])
  put('title', plan.title)
  put('slug', plan.slug)
  put('date', plan.date)
  put('excerpt', plan.excerpt)
  put(
    'body (Portable Text)',
    plan.body ??
      (plan.blocks ? `${plan.blocks}[richTextBlock].content` : undefined),
  )
  put(
    'featured image',
    plan.image ?? (plan.images ? `${plan.images}[0]` : undefined),
  )
  put('categories + tags', plan.terms)
  put('author, modified, …', undefined)
  return out
}

/* Where a document of `type` with `slug` lives on the template (src/routes). */
const ROUTES: Record<string, string> = {
  post: '/news/',
  artist: '/artists/',
  artwork: '/work/',
  exhibition: '/exhibitions/',
  event: '/events/',
}
export function routeFor(type: string, slug: string): string {
  if (type === 'page') return slug === 'home' ? '/' : `/${slug}`
  const base = ROUTES[type]
  return base ? `${base}${slug}` : `/${slug}`
}

/* Where an image goes once its asset exists: a Sanity patch path (`image.asset`,
   `body[_key=="b3"].asset`) on the document. */
export type ImageSlot = { path: string; url: string; alt: string }

export type Mapped = {
  doc: Rec & { _id: string; _type: string }
  images: Array<ImageSlot>
  /** Old path → new path (redirect when they differ). */
  from: string
  to: string
}

/* Documents the importer did not write that already use a slug (per type): an imported page
   "about" next to the build's own "about" page gets "about-imported", and its old URL is not
   redirected (the new site already answers it). */
export type Taken = Map<string, Set<string>>

export function mapItem(
  item: Item,
  target: TargetType,
  o: { importedAt: string; taken?: Taken; assets?: Map<string, string> },
): Mapped {
  const plan = fieldPlan(target)
  const id = importId(item.sourceUrl)
  let origin = ''
  try {
    origin = new URL(item.sourceUrl).origin
  } catch {
    // relative or bad URL: links stay as they are
  }
  const pt = htmlToPortableText(item.html, {
    base: item.sourceUrl,
    ...(origin && { origin }),
    keyPrefix: 'b',
  })
  // Only pages nest ("about/team"); everything else lives at /<type route>/<last segment>.
  const own =
    target.name === 'page'
      ? item.slug
      : (item.slug.split('/').filter(Boolean).pop() ?? '')
  let slug = slugify(own) || slugify(item.title) || id
  const taken = o.taken?.get(target.name)
  const clash = !!taken?.has(slug)
  if (clash) slug = `${slug}-imported`
  const doc: Rec & { _id: string; _type: string } = {
    _id: id,
    _type: target.name,
  }
  const meta: Rec = { sourceType: item.sourceType, ...item.meta }
  const slots: Array<ImageSlot> = []
  const assetRef = (url: string) => {
    const ref = o.assets?.get(url)
    return ref ? { asset: { _type: 'reference', _ref: ref } } : {}
  }

  if (plan.title) doc[plan.title] = item.title
  else meta.title = item.title
  if (plan.slug) doc[plan.slug] = { _type: 'slug', current: slug }
  if (item.date) {
    if (plan.date)
      doc[plan.date] = plan.date === 'date' ? item.date.slice(0, 10) : item.date
    else meta.date = item.date
  }
  if (item.excerpt) {
    if (plan.excerpt) doc[plan.excerpt] = item.excerpt
    else meta.excerpt = item.excerpt
  }
  const withAssets = pt.blocks.map((b) =>
    b._type === 'imageWithAlt'
      ? {
          ...b,
          ...assetRef(pt.images.find((i) => i.key === b._key)?.url ?? ''),
        }
      : b,
  )
  if (plan.body) {
    doc[plan.body] = withAssets
    for (const i of pt.images)
      slots.push({
        path: `${plan.body}[_key=="${i.key}"].asset`,
        url: i.url,
        alt: i.alt,
      })
  } else if (plan.blocks) {
    doc[plan.blocks] = [
      { _type: 'richTextBlock', _key: 'imported-body', content: withAssets },
    ]
    for (const i of pt.images)
      slots.push({
        path: `${plan.blocks}[_key=="imported-body"].content[_key=="${i.key}"].asset`,
        url: i.url,
        alt: i.alt,
      })
  } else if (item.html.trim()) meta.html = item.html
  if (item.featured) {
    const f = item.featured
    const img = {
      _type: 'imageWithAlt',
      ...(f.alt && { alt: f.alt }),
      ...(f.caption && { caption: [plainBlock(f.caption, 'c0')] }),
      ...assetRef(f.url),
    }
    if (plan.image) {
      doc[plan.image] = img
      slots.push({ path: `${plan.image}.asset`, url: f.url, alt: f.alt })
    } else if (plan.images) {
      doc[plan.images] = [{ ...img, _key: 'featured' }]
      slots.push({
        path: `${plan.images}[_key=="featured"].asset`,
        url: f.url,
        alt: f.alt,
      })
    } else meta.featuredImage = f.url
  }
  if (item.terms.length) {
    if (plan.terms) doc[plan.terms] = item.terms
    else meta.terms = item.terms
  }
  if (item.author) meta.author = item.author
  if (pt.embeds.length && !plan.body && !plan.blocks) meta.embeds = pt.embeds
  if (clash) meta.slugWasTaken = slugify(item.slug)
  doc.sourceUrl = item.sourceUrl
  doc.sourceId = item.sourceId
  doc.importedAt = o.importedAt
  doc.sourceMeta = JSON.stringify(meta)
  let from = '/'
  try {
    from = normalPath(new URL(item.sourceUrl).pathname)
  } catch {
    // keep "/"
  }
  const to = routeFor(target.name, slug)
  return { doc, images: slots, from: clash ? to : from, to }
}

// ---- redirects ----

export type Redirect = { from: string; to: string }

/* Old path → new path for every document whose path changed: normalised, deduped (first wins),
   no self-redirects, chains collapsed (a → b, b → c becomes a → c), and never a redirect away
   from a path the new site itself serves. Merged with an existing map, newest first. */
export function redirectMap(
  pairs: Array<Redirect>,
  existing: Array<Redirect> = [],
): Array<Redirect> {
  const next = new Map<string, string>()
  for (const p of [...pairs, ...existing]) {
    const from = normalPath(p.from)
    const to = normalPath(p.to)
    if (
      !p.to.startsWith('/') ||
      p.to.startsWith('//') ||
      from === to ||
      next.has(from)
    )
      continue
    next.set(from, to)
  }
  const live = new Set(pairs.map((p) => normalPath(p.to)))
  const out: Array<Redirect> = []
  for (const [from, first] of next) {
    if (live.has(from)) continue
    let to = first
    const seen = new Set([from])
    for (let hop = next.get(to); hop && !seen.has(to); hop = next.get(to)) {
      seen.add(to)
      to = hop
    }
    if (to !== from) out.push({ from, to })
  }
  return out.sort((a, b) => a.from.localeCompare(b.from))
}

// ---- output ----

const fmt = (n: number) => n.toLocaleString('en-US')

/* The mapping table printed before anything is written (and all `--dry-run` shows). */
export function mappingTable(
  types: Array<TypeMapping>,
  targets: Array<TargetType>,
): string {
  const lines: Array<string> = []
  const shown = new Set<string>()
  const w = Math.max(
    12,
    ...types.map((t) => t.source.length + fmt(t.count).length + 3),
  )
  for (const t of types) {
    const left = `${t.source} (${fmt(t.count)})`.padEnd(w)
    const right =
      t.how === 'folded'
        ? t.source.startsWith('tag') || t.source.startsWith('categor')
          ? 'no document type; names kept on each document (tags / sourceMeta)'
          : 'no document type; name kept in sourceMeta.author'
        : t.target
          ? `${t.target}${t.how === 'fallback' ? '  (no matching type; imported as pages)' : t.how === 'name' ? '' : `  (${t.how})`}`
          : 'not imported: no matching type and no page type'
    const target =
      t.how === 'folded' ? undefined : targets.find((x) => x.name === t.target)
    const again = !!target && shown.has(target.name)
    lines.push(`  ${left} → ${right}${again ? '  (fields as above)' : ''}`)
    if (target && !again) {
      shown.add(target.name)
      for (const [from, to] of fieldLines(fieldPlan(target)))
        lines.push(`      ${from.padEnd(22)} → ${to}`)
    }
  }
  return lines.join('\n')
}

export const countLabel = (n: number, one: string, many = `${one}s`) =>
  `${fmt(n)} ${n === 1 ? one : many}`
export { fmt as formatCount }
