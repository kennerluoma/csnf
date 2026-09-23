/* Pure logic behind `pnpm extract --from-url` (scripts/website.ts): URL filtering, robots.txt,
   sitemaps, link discovery from HTML, the in-browser DOM snapshot, section segmentation and
   collection detection. No I/O here except `snapshotDom`, which runs inside the page. Tested by
   scripts/website.test.ts. */

// ---- URLs ----

export type UrlVerdict =
  | { ok: true; url: string; path: string }
  | { ok: false; url: string; why: string }

const NON_HTML =
  /\.(pdf|jpe?g|png|gif|webp|avif|svg|ico|bmp|tiff?|heic|zip|gz|tgz|rar|7z|mp3|mp4|m4v|mov|webm|wav|ogg|m4a|xml|rss|atom|json|txt|csv|css|js|mjs|map|woff2?|ttf|otf|eot|docx?|xlsx?|pptx?|dmg|exe|ics)$/i
const NOT_A_PAGE =
  /^\/(cdn-cgi|wp-json|wp-admin|wp-content|wp-includes|api|_next|_astro|assets|static)(\/|$)|\/(feed|rss)\/?$/i
export const LOGIN_PATH =
  /(^|\/)(login|log-in|signin|sign-in|signup|sign-up|register|account|my-account|auth|wp-login\.php|cart|checkout)(\/|$)/i
const PAGINATION_PARAMS = ['page', 'p', 'paged', 'pg']

/* Canonical form of a page URL on `origin`: no hash, no trailing slash (except the root), no
   `index.html`, `//` collapsed. Anything that is not a crawlable page gets a reason instead.
   Callers drop `off-origin` silently (it is never followed) and record the rest as skipped. */
export function classifyUrl(
  href: string,
  base: string,
  origin: string,
): UrlVerdict {
  const raw = href.trim()
  let u: URL
  try {
    u = new URL(raw, base)
  } catch {
    return { ok: false, url: raw, why: 'invalid URL' }
  }
  if (u.protocol === 'mailto:') return { ok: false, url: raw, why: 'mailto' }
  if (u.protocol === 'tel:') return { ok: false, url: raw, why: 'tel' }
  if (u.protocol !== 'http:' && u.protocol !== 'https:')
    return { ok: false, url: raw, why: 'not http' }
  if (u.origin !== origin) return { ok: false, url: u.href, why: 'off-origin' }
  u.hash = ''
  let path = u.pathname.replace(/\/{2,}/g, '/').replace(/\/index\.html?$/i, '/')
  if (path.length > 1) path = path.replace(/\/+$/, '')
  const full = u.origin + path + u.search
  if (NON_HTML.test(path)) return { ok: false, url: full, why: 'not HTML' }
  const pageNo = /\/page\/(\d+)$/.exec(path)
  if (pageNo && Number(pageNo[1]) > 1)
    return { ok: false, url: full, why: 'pagination' }
  for (const p of PAGINATION_PARAMS) {
    const v = u.searchParams.get(p)
    if (v && Number(v) > 1) return { ok: false, url: full, why: 'pagination' }
  }
  if (u.search) return { ok: false, url: full, why: 'query variant' }
  if (LOGIN_PATH.test(path)) return { ok: false, url: full, why: 'login page' }
  if (NOT_A_PAGE.test(path)) return { ok: false, url: full, why: 'not a page' }
  return { ok: true, url: u.origin + path, path }
}

/* The same URL without its query string, for a skipped query variant (`/work?tag=x` → `/work`). */
export const withoutQuery = (url: string) => url.replace(/[?#].*$/, '')

export const routeSlug = (path: string) =>
  path === '/'
    ? 'home'
    : path
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'page'

export const dirOf = (path: string) => {
  const i = path.lastIndexOf('/')
  return i <= 0 ? '/' : path.slice(0, i)
}

/* "/about-us" → "About Us"; "/" → "Home". */
export const routeName = (path: string) => {
  if (path === '/') return 'Home'
  const last = decodeURIComponent(path.split('/').pop() ?? '')
  return last
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}

// ---- robots.txt ----

export type Robots = {
  rules: Array<{ allow: boolean; pattern: string }>
  sitemaps: Array<string>
}

/* Groups for our agent token win over `*` (the standard's "most specific group"). */
export function parseRobots(text: string, agent = 'kiln'): Robots {
  type Group = { agents: Array<string>; rules: Robots['rules'] }
  const groups: Array<Group> = []
  const sitemaps: Array<string> = []
  let current: Group | undefined
  let lastWasAgent = false
  for (const line of text.split(/\r?\n/)) {
    const clean = line.replace(/#.*$/, '').trim()
    const m = /^([a-zA-Z-]+)\s*:\s*(.*)$/.exec(clean)
    if (!m) continue
    const key = (m[1] ?? '').toLowerCase()
    const value = (m[2] ?? '').trim()
    if (key === 'sitemap') {
      if (value) sitemaps.push(value)
      continue
    }
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
      lastWasAgent = true
      continue
    }
    lastWasAgent = false
    if (!current) continue
    if ((key === 'allow' || key === 'disallow') && value)
      current.rules.push({ allow: key === 'allow', pattern: value })
  }
  const own = groups.filter((g) =>
    g.agents.some((a) => a !== '*' && agent.toLowerCase().includes(a)),
  )
  const chosen = own.length ? own : groups.filter((g) => g.agents.includes('*'))
  return { rules: chosen.flatMap((g) => g.rules), sitemaps }
}

const ruleRegex = (pattern: string) => {
  const anchored = pattern.endsWith('$')
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
  return new RegExp('^' + body + (anchored ? '$' : ''))
}

/* Longest matching rule wins; Allow wins a tie; no match = allowed. */
export function robotsAllows(robots: Robots, path: string): boolean {
  let best: { allow: boolean; len: number } | undefined
  for (const r of robots.rules) {
    if (!ruleRegex(r.pattern).test(path)) continue
    const len = r.pattern.length
    if (!best || len > best.len || (len === best.len && r.allow))
      best = { allow: r.allow, len }
  }
  return best ? best.allow : true
}

// ---- sitemap.xml ----

export function parseSitemap(xml: string): {
  urls: Array<string>
  sitemaps: Array<string>
} {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) =>
    decodeEntities(m[1] ?? ''),
  )
  return /<sitemapindex[\s>]/i.test(xml)
    ? { urls: [], sitemaps: locs }
    : { urls: locs, sitemaps: [] }
}

// ---- HTML-only reading (inspect mode: no browser) ----

export const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))

const stripScripts = (html: string) =>
  html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')

const attr = (tag: string, name: string) => {
  const m = new RegExp(
    `\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    'i',
  ).exec(tag)
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : undefined
}

export type FoundLink = { href: string; zone: 'nav' | 'main' }

/* Links in document order; those inside <header>/<nav>/<footer> are `nav` (crawled first). */
export function htmlLinks(html: string): Array<FoundLink> {
  const body = stripScripts(html)
  const chrome: Array<[number, number]> = []
  for (const m of body.matchAll(/<(header|nav|footer)\b[^>]*>[\s\S]*?<\/\1>/gi))
    chrome.push([m.index, m.index + m[0].length])
  const out: Array<FoundLink> = []
  for (const m of body.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(m[0], 'href')
    if (href === undefined) continue
    const inChrome = chrome.some(([a, b]) => m.index >= a && m.index < b)
    out.push({ href, zone: inChrome ? 'nav' : 'main' })
  }
  return out
}

export function htmlTitle(html: string) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  return m
    ? decodeEntities(m[1] ?? '')
        .replace(/\s+/g, ' ')
        .trim()
    : ''
}

/* og:image first, then <img> sources in order; absolute, deduped. */
export function htmlImages(html: string, base: string): Array<string> {
  const out: Array<string> = []
  const add = (src: string | undefined) => {
    if (!src || src.startsWith('data:')) return
    try {
      const abs = new URL(src, base).href
      if (!out.includes(abs)) out.push(abs)
    } catch {
      // not a URL
    }
  }
  for (const m of html.matchAll(/<meta\b[^>]*>/gi))
    if (/property\s*=\s*["']og:image["']/i.test(m[0]))
      add(attr(m[0], 'content'))
  for (const m of stripScripts(html).matchAll(/<img\b[^>]*>/gi))
    add(attr(m[0], 'src'))
  return out
}

export function htmlStylesheets(html: string, base: string): Array<string> {
  const out: Array<string> = []
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    if (!/rel\s*=\s*["']?[^"'>]*stylesheet/i.test(m[0])) continue
    const href = attr(m[0], 'href')
    if (!href) continue
    try {
      out.push(new URL(href, base).href)
    } catch {
      // not a URL
    }
  }
  return out
}

export const htmlInlineStyles = (html: string) =>
  [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(
    (m) => m[1] ?? '',
  )

// ---- fonts and colours from CSS text ----

export type FontSource = {
  family: string
  source: 'google' | 'typekit' | 'font-face' | 'local'
  url?: string
}

const FONT_HOSTS: Array<[RegExp, FontSource['source']]> = [
  [/fonts\.googleapis\.com|fonts\.bunny\.net/i, 'google'],
  [/use\.typekit\.net|p\.typekit\.net/i, 'typekit'],
]

/* Families named by a font-service stylesheet URL (Google: `family=Inter:wght@400|Lora`). */
export function fontServiceFamilies(href: string): Array<FontSource> {
  const hit = FONT_HOSTS.find(([re]) => re.test(href))
  if (!hit) return []
  let u: URL
  try {
    u = new URL(href)
  } catch {
    return []
  }
  const fams = u.searchParams
    .getAll('family')
    .flatMap((f) => f.split('|'))
    .map((f) => f.split(':')[0]?.replace(/\+/g, ' ').trim() ?? '')
    .filter(Boolean)
  return fams.length
    ? fams.map((family) => ({ family, source: hit[1], url: href }))
    : [{ family: '(kit)', source: hit[1], url: href }]
}

export const cleanFamily = (f: string) =>
  (f.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '')

/* @font-face rules: family + first url() (resolved, recorded, never downloaded). */
export function fontFacesInCss(css: string, base: string): Array<FontSource> {
  const out: Array<FontSource> = []
  for (const m of css.matchAll(/@font-face\s*{([^}]*)}/gi)) {
    const body = m[1] ?? ''
    const fam = /font-family\s*:\s*([^;]+)/i.exec(body)?.[1]
    if (!fam) continue
    const src = /url\(\s*["']?([^"')]+)["']?\s*\)/i.exec(body)?.[1]
    let url: string | undefined
    if (src && !src.startsWith('data:'))
      try {
        url = new URL(src, base).href
      } catch {
        url = undefined
      }
    out.push({
      family: cleanFamily(fam),
      source: url || src ? 'font-face' : 'local',
      ...(url && { url }),
    })
  }
  return out
}

export const hex2 = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0')

/* #rgb/#rrggbb/rgb()/rgba() in CSS text, by frequency. (oklch etc. are left to the renderer.) */
export function coloursInCss(
  css: string,
): Array<{ hex: string; uses: number }> {
  const counts = new Map<string, number>()
  const bump = (h: string) => counts.set(h, (counts.get(h) ?? 0) + 1)
  for (const m of css.matchAll(
    /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b/gi,
  )) {
    let h = (m[1] ?? '').toLowerCase()
    if (h.length <= 4)
      h = h
        .split('')
        .slice(0, 3)
        .map((c) => c + c)
        .join('')
    bump('#' + h.slice(0, 6))
  }
  for (const m of css.matchAll(
    /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)/gi,
  )) {
    const a = m[4]
    const alpha = a ? (a.endsWith('%') ? parseFloat(a) / 100 : Number(a)) : 1
    if (alpha < 0.5) continue
    bump('#' + [m[1], m[2], m[3]].map((v) => hex2(Number(v))).join(''))
  }
  return [...counts.entries()]
    .map(([h, uses]) => ({ hex: h, uses }))
    .sort((a, b) => b.uses - a.uses)
}

// ---- DOM snapshot (runs in the page) ----

export type Box = [number, number, number, number]
export type Layout = {
  direction: 'row' | 'column'
  gap: number
  padding: Array<number>
}
export type SnapNode = {
  tag: string
  id: string
  cls: string
  role: string
  label: string
  box: Box
  bg: string | null
  bgImage: string | null
  color: string | null
  font: {
    family: string
    size: number
    weight: number
    lineHeight: number | null
  } | null
  /* Full text for text elements (p, h1–h6, a, li, …); the element's own text nodes otherwise. */
  text: string
  ownText: boolean
  href: string | null
  src: string | null
  alt: string | null
  level: number | null
  inputType: string | null
  layout: Layout | null
  radius: number | null
  children: Array<SnapNode>
}
export type Snapshot = {
  url: string
  title: string
  description: string
  siteName: string
  width: number
  height: number
  root: SnapNode
  fontFaces: Array<FontSource>
  fontLinks: Array<string>
}

/* Serialised into the page by Playwright (`page.evaluate(snapshotDom)`): it must not reference
   anything outside its own body. */
export function snapshotDom(): Snapshot {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  const colourCache = new Map<string, string | null>()
  const toHex = (c: string): string | null => {
    if (!c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)') return null
    const cached = colourCache.get(c)
    if (cached !== undefined) return cached
    let out: string | null = null
    if (ctx) {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = '#000'
      ctx.fillStyle = c
      ctx.fillRect(0, 0, 1, 1)
      const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data
      out =
        a < 128
          ? null
          : '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
    }
    colourCache.set(c, out)
    return out
  }
  const px = (v: string) => {
    const n = parseFloat(v)
    return Number.isFinite(n) ? Math.round(n) : 0
  }
  const TEXT_TAGS = new Set([
    'P',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'A',
    'LI',
    'BUTTON',
    'LABEL',
    'FIGCAPTION',
    'BLOCKQUOTE',
    'DT',
    'DD',
    'TD',
    'TH',
    'CAPTION',
    'SUMMARY',
    'TIME',
  ])
  const SKIP = new Set([
    'SCRIPT',
    'STYLE',
    'NOSCRIPT',
    'TEMPLATE',
    'HEAD',
    'META',
    'LINK',
    'BR',
    'WBR',
    'SOURCE',
    'TRACK',
  ])
  /* Visible text of an element: text nodes joined by spaces (so "<h3>Film</h3><p>2019</p>" is
     "Film 2019"), skipping <select>/<option> lists and anything not rendered. */
  const NO_TEXT = new Set([
    'SELECT',
    'OPTION',
    'SCRIPT',
    'STYLE',
    'TEMPLATE',
    'NOSCRIPT',
  ])
  const textOf = (el: Element) => {
    const parts: Array<string> = []
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const parent = t.parentElement
      if (!parent || NO_TEXT.has(parent.tagName) || parent.closest('select'))
        continue
      const v = (t.textContent ?? '').trim()
      if (v) parts.push(v)
    }
    return parts.join(' ').replace(/\s+/g, ' ').trim()
  }
  /* The family that actually renders: the first in the stack the page loaded (a stack that names
     an unlicensed or missing font first falls through to the next one), else the first. */
  const loaded = new Set<string>()
  document.fonts.forEach((f) => {
    if (f.status === 'loaded')
      loaded.add(f.family.replace(/^["']|["']$/g, '').toLowerCase())
  })
  const familyOf = (stack: string) => {
    const fams = stack
      .split(',')
      .map((f) => f.trim().replace(/^["']|["']$/g, ''))
      .filter(Boolean)
    return fams.find((f) => loaded.has(f.toLowerCase())) ?? fams[0] ?? ''
  }
  let budget = 8000
  const walk = (el: Element): SnapNode | null => {
    if (SKIP.has(el.tagName) || budget-- <= 0) return null
    const cs = getComputedStyle(el)
    if (
      cs.display === 'none' ||
      cs.visibility === 'hidden' ||
      cs.opacity === '0'
    )
      return null
    const r = el.getBoundingClientRect()
    const tag = el.tagName.toLowerCase()
    const children: Array<SnapNode> = []
    if (tag !== 'svg' && tag !== 'select')
      for (const c of Array.from(el.children)) {
        const n = walk(c)
        if (n) children.push(n)
      }
    let own = ''
    for (const t of Array.from(el.childNodes))
      if (t.nodeType === 3) own += t.textContent ?? ''
    own = own.replace(/\s+/g, ' ').trim()
    const full = TEXT_TAGS.has(el.tagName) ? textOf(el) : own
    if (r.width === 0 && r.height === 0 && !children.length) return null
    const bgImg = /url\(["']?([^"')]+)["']?\)/.exec(cs.backgroundImage)?.[1]
    const display = cs.display
    const flex = display.includes('flex')
    const grid = display.includes('grid')
    const padding = [
      px(cs.paddingTop),
      px(cs.paddingRight),
      px(cs.paddingBottom),
      px(cs.paddingLeft),
    ]
    const direction: 'row' | 'column' = flex
      ? cs.flexDirection.startsWith('row')
        ? 'row'
        : 'column'
      : grid && cs.gridTemplateColumns.trim().split(/\s+/).length > 1
        ? 'row'
        : 'column'
    const gap =
      flex || grid ? px(direction === 'row' ? cs.columnGap : cs.rowGap) : 0
    const hasLayout = flex || grid || padding.some((p) => p > 0)
    const radius = px(cs.borderTopLeftRadius)
    let src: string | null = null
    let alt: string | null = null
    let href: string | null = null
    let inputType: string | null = null
    if (el instanceof HTMLImageElement) {
      src = el.currentSrc || el.src || null
      alt = el.alt
    } else if (el instanceof HTMLVideoElement) {
      src =
        el.currentSrc ||
        el.src ||
        el.querySelector('source')?.getAttribute('src') ||
        null
      if (src) src = new URL(src, location.href).href
    } else if (
      el instanceof HTMLIFrameElement ||
      el instanceof HTMLEmbedElement
    ) {
      src = el.src || null
    } else if (el instanceof HTMLAnchorElement) {
      href = el.href || null
    } else if (el instanceof HTMLInputElement) {
      inputType = el.type
    } else if (
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    ) {
      inputType = tag
    }
    const level = /^h[1-6]$/.test(tag) ? Number(tag.slice(1)) : null
    const hasOwnText = own.length > 0
    const lh = parseFloat(cs.lineHeight)
    return {
      tag,
      id: el.id,
      cls: typeof el.className === 'string' ? el.className : '',
      role: el.getAttribute('role') ?? '',
      label: el.getAttribute('aria-label') ?? '',
      box: [
        Math.round(r.left + scrollX),
        Math.round(r.top + scrollY),
        Math.round(r.width),
        Math.round(r.height),
      ],
      bg: toHex(cs.backgroundColor),
      bgImage: bgImg ? new URL(bgImg, location.href).href : null,
      color: hasOwnText ? toHex(cs.color) : null,
      font: hasOwnText
        ? {
            family: familyOf(cs.fontFamily),
            size: px(cs.fontSize),
            weight: Number(cs.fontWeight) || 400,
            lineHeight: Number.isFinite(lh) ? Math.round(lh) : null,
          }
        : null,
      text: full.slice(0, 2000),
      ownText: hasOwnText,
      href,
      src,
      alt,
      level,
      inputType,
      layout: hasLayout ? { direction, gap, padding } : null,
      radius: radius > 0 ? radius : null,
      children,
    }
  }
  const fontFaces: Array<FontSource> = []
  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue // cross-origin sheet (Google Fonts CSS): the <link> records it
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue
      const family = (rule.style.getPropertyValue('font-family') || '')
        .trim()
        .replace(/^["']|["']$/g, '')
      const srcDecl = rule.style.getPropertyValue('src')
      const u = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(srcDecl)?.[1]
      const url =
        u && !u.startsWith('data:')
          ? new URL(u, sheet.href ?? location.href).href
          : undefined
      if (family)
        fontFaces.push({
          family,
          source: url || u ? 'font-face' : 'local',
          ...(url && { url }),
        })
    }
  }
  const fontLinks = Array.from(
    document.querySelectorAll('link[rel~="stylesheet"][href]'),
  )
    .map((l) => l.getAttribute('href') ?? '')
    .map((h) => new URL(h, location.href).href)
    .filter((h) =>
      /fonts\.googleapis\.com|fonts\.bunny\.net|typekit\.net/i.test(h),
    )
  const meta = (sel: string) =>
    document.querySelector(sel)?.getAttribute('content') ?? ''
  const empty: SnapNode = {
    tag: 'body',
    id: '',
    cls: '',
    role: '',
    label: '',
    box: [0, 0, 0, 0],
    bg: null,
    bgImage: null,
    color: null,
    font: null,
    text: '',
    ownText: false,
    href: null,
    src: null,
    alt: null,
    level: null,
    inputType: null,
    layout: null,
    radius: null,
    children: [],
  }
  const root = walk(document.body) ?? empty
  if (!root.bg)
    root.bg =
      toHex(getComputedStyle(document.documentElement).backgroundColor) ??
      '#ffffff'
  return {
    url: location.href,
    title: document.title.replace(/\s+/g, ' ').trim(),
    description: meta('meta[name="description"]'),
    siteName: meta('meta[property="og:site_name"]'),
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    root,
    fontFaces,
    fontLinks,
  }
}

// ---- segmentation ----

export type WebImage = {
  src: string
  alt: string
  box: Box
  background?: boolean
  file?: string
}
export type Repeat = {
  count: number
  items: Array<{ title?: string; text?: string; href?: string; image?: string }>
}
export type TreeNode = {
  id: string
  type: string
  name: string
  size: [number, number]
  fill?: string
  radius?: number
  layout?: Layout
  text?: string
  href?: string
  image?: string
  children?: Array<TreeNode>
}
export type WebSection = {
  id: string
  name: string
  type: string
  size: [number, number]
  box: Box
  background?: string
  layout?: Layout
  text: Record<string, string>
  content: {
    headings: Array<{ level: number; text: string }>
    paragraphs: Array<string>
    links: Array<{ text: string; href: string }>
    buttons: Array<string>
  }
  images: Array<WebImage>
  embeds: Array<{ kind: string; src: string }>
  form?: { fields: Array<string> }
  repeat?: Repeat
  regions?: Array<{ id: string; name: string; box: Array<number> }>
  tree?: TreeNode
}

const WORDY = /[\p{L}\p{N}]/u
const SECTION_TAGS = new Set(['section', 'article', 'aside'])
const MIN_SECTION_HEIGHT = 200
const isHeader = (n: SnapNode) => n.tag === 'header' || n.role === 'banner'
const isFooter = (n: SnapNode) => n.tag === 'footer' || n.role === 'contentinfo'
const isNav = (n: SnapNode) => n.tag === 'nav' || n.role === 'navigation'
const isMain = (n: SnapNode) => n.tag === 'main' || n.role === 'main'
const area = (n: SnapNode) => n.box[2] * n.box[3]

function* descendants(n: SnapNode): Generator<SnapNode> {
  for (const c of n.children) {
    yield c
    yield* descendants(c)
  }
}
const contains = (n: SnapNode, targets: Set<SnapNode>) => {
  for (const d of descendants(n)) if (targets.has(d)) return true
  return false
}
const hasContent = (n: SnapNode) =>
  !!n.text ||
  !!n.src ||
  !!n.bgImage ||
  [...descendants(n)].some((d) => !!d.text || !!d.src || !!d.bgImage)

/* Site chrome = the first header, the first nav outside it, the last footer, found outside
   <main>/<article>/<section> (a landmark inside content is content). */
export function findChrome(root: SnapNode) {
  let header: SnapNode | undefined
  let nav: SnapNode | undefined
  let footer: SnapNode | undefined
  let main: SnapNode | undefined
  const [, , pageW, pageH] = root.box
  // A nav is site chrome when it starts near the top or spans the page; a prev/next or "Images"
  // nav inside a viewer is content. Same idea for header (top) and footer (bottom).
  const nearTop = (n: SnapNode) => n.box[1] < 400
  const siteNav = (n: SnapNode) => n.box[1] < 200 || n.box[2] >= pageW * 0.6
  const nearBottom = (n: SnapNode) =>
    n.box[1] + n.box[3] >= pageH * 0.6 || n.box[2] >= pageW * 0.6
  const visit = (n: SnapNode) => {
    for (const c of n.children) {
      if (isMain(c)) {
        main ??= c
      } else if (isHeader(c) && !header && nearTop(c)) {
        header = c
      } else if (isFooter(c) && nearBottom(c)) {
        footer = c
      } else if (isNav(c) && !nav && siteNav(c)) {
        nav = c
      } else if (!SECTION_TAGS.has(c.tag) && !isNav(c) && !isFooter(c)) visit(c)
    }
  }
  visit(root)
  return { header, nav, footer, main }
}

/* Children of `n` minus chrome; a child that wraps chrome is flattened into its own children. */
function contentChildren(n: SnapNode, chrome: Set<SnapNode>): Array<SnapNode> {
  const out: Array<SnapNode> = []
  for (const c of n.children) {
    if (chrome.has(c)) continue
    if (contains(c, chrome)) out.push(...contentChildren(c, chrome))
    else out.push(c)
  }
  return out
}

const visibleKids = (n: SnapNode) =>
  n.children.filter((c) => area(c) > 0 || c.children.length)

/* Two or more children sharing a horizontal band: columns of one section, not stacked sections. */
export function sideBySide(kids: Array<SnapNode>): boolean {
  const boxed = kids.filter((k) => area(k) > 0)
  for (let i = 0; i < boxed.length; i++)
    for (let j = i + 1; j < boxed.length; j++) {
      const a = boxed[i]
      const b = boxed[j]
      if (!a || !b) continue
      const top = Math.max(a.box[1], b.box[1])
      const bottom = Math.min(a.box[1] + a.box[3], b.box[1] + b.box[3])
      const overlap = bottom - top
      if (overlap > 0.5 * Math.min(a.box[3], b.box[3]) && overlap > 8)
        return true
    }
  return false
}

const signature = (n: SnapNode) => `${n.tag}.${n.cls}`
const richItem = (n: SnapNode) => {
  const ds = [...descendants(n)]
  return (
    ds.some((d) => d.tag === 'img' || d.level !== null || !!d.bgImage) ||
    (n.tag === 'a' && !!n.text) ||
    ds.filter((d) => d.tag === 'a').length === 1 ||
    ds.length >= 2
  )
}

/* Full-width blocks each taller than 400 px stacked on top of each other are sections that happen
   to share a class, not a grid of cards. */
const sectionLike = (container: SnapNode, items: Array<SnapNode>) =>
  items.every((i) => i.box[2] >= container.box[2] * 0.9 && i.box[3] >= 400)

/* The container (at most 6 levels down) with the most children sharing one signature (tag +
   class), ≥ 3 of them and ≥ 60 % of its children, each a real item (image, heading, link). */
export function findRepeat(
  n: SnapNode,
): { container: SnapNode; items: Array<SnapNode> } | undefined {
  let best: { container: SnapNode; items: Array<SnapNode> } | undefined
  const visit = (c: SnapNode, depth: number) => {
    const kids = visibleKids(c)
    if (kids.length >= 3) {
      const groups = new Map<string, Array<SnapNode>>()
      for (const k of kids)
        groups.set(signature(k), [...(groups.get(signature(k)) ?? []), k])
      for (const items of groups.values())
        if (
          items.length >= 3 &&
          items.length >= kids.length * 0.6 &&
          !items.every((i) => i.tag === 'p' || i.tag === 'span') &&
          items.every(richItem) &&
          !sectionLike(c, items) &&
          (!best || items.length > best.items.length)
        )
          best = { container: c, items }
    }
    if (depth < 6) for (const k of kids) visit(k, depth + 1)
  }
  visit(n, 0)
  return best
}

function itemOf(n: SnapNode): Repeat['items'][number] {
  const ds = [n, ...descendants(n)]
  const heading = ds.find((d) => d.level !== null)?.text
  const link = ds.find((d) => d.tag === 'a' && d.href)
  const img = ds.find((d) => d.tag === 'img' && d.src)
  const para = ds.find(
    (d) => (d.tag === 'p' || d.ownText) && d.text && d.text !== heading,
  )?.text
  const title =
    heading || link?.label || link?.text || img?.alt || para || undefined
  return {
    ...(title && { title }),
    ...(para && para !== title && { text: para }),
    ...(link?.href && { href: link.href }),
    ...(img?.src && { image: img.src }),
  }
}

type Content = WebSection['content'] & {
  images: Array<WebImage>
  embeds: WebSection['embeds']
  inputs: Array<string>
}

/* Headings, paragraphs, links, buttons, images and embeds, in document order. Text inside a
   link/heading/paragraph is not repeated as its own paragraph. */
export function contentOf(n: SnapNode, skip?: Set<SnapNode>): Content {
  const out: Content = {
    headings: [],
    paragraphs: [],
    links: [],
    buttons: [],
    images: [],
    embeds: [],
    inputs: [],
  }
  const visit = (d: SnapNode, inText: boolean) => {
    if (skip?.has(d)) return
    if (d.bgImage && !d.bgImage.startsWith('data:') && area(d) > 400)
      out.images.push({
        src: d.bgImage,
        alt: d.label,
        box: d.box,
        background: true,
      })
    let textHere = inText
    if (d.level !== null && d.text) {
      out.headings.push({ level: d.level, text: d.text })
      textHere = true
    } else if (d.tag === 'a' && d.href) {
      const img = [...descendants(d)].find((x) => x.tag === 'img')
      out.links.push({
        text: d.text || d.label || img?.alt || '',
        href: d.href,
      })
      textHere = true
    } else if (
      d.tag === 'button' ||
      (d.tag === 'input' && /^(submit|button)$/.test(d.inputType ?? ''))
    ) {
      out.buttons.push(d.text || d.label)
      textHere = true
    } else if (d.inputType) {
      out.inputs.push(d.inputType)
    } else if (d.tag === 'img' && d.src) {
      if (d.box[2] > 2 && d.box[3] > 2)
        out.images.push({ src: d.src, alt: d.alt ?? '', box: d.box })
    } else if (
      (d.tag === 'video' || d.tag === 'iframe' || d.tag === 'embed') &&
      d.src
    ) {
      out.embeds.push({ kind: d.tag, src: d.src })
    } else if (
      !inText &&
      WORDY.test(d.text) &&
      ([
        'p',
        'blockquote',
        'figcaption',
        'dt',
        'dd',
        'td',
        'th',
        'caption',
        'time',
        'label',
      ].includes(d.tag) ||
        (d.tag === 'li' &&
          !d.children.some((c) => c.tag === 'a' && c.text === d.text)))
    ) {
      out.paragraphs.push(d.text)
      textHere = true
    } else if (!inText && d.ownText && WORDY.test(d.text) && d.tag !== 'li') {
      out.paragraphs.push(d.text)
    }
    for (const c of d.children) visit(c, textHere)
  }
  visit(n, false)
  return out
}

/* Figma's generic field names (extract.ts collectText): body > 160 chars ≥ text > 40 ≥ label. */
function textRecord(c: Content, wordmark?: string): Record<string, string> {
  const acc: Record<string, string> = {}
  const put = (key: string, value: string) => {
    if (!WORDY.test(value) || Object.keys(acc).length >= 40) return
    let k = key
    for (let i = 2; k in acc; i++) k = `${key}${i}`
    acc[k] = value
  }
  if (wordmark) put('wordmark', wordmark)
  for (const h of c.headings) put('heading', h.text)
  for (const p of c.paragraphs)
    put(p.length > 160 ? 'body' : p.length <= 40 ? 'label' : 'text', p)
  for (const l of c.links) if (l.text !== wordmark) put('link', l.text)
  for (const b of c.buttons) put('button', b)
  return acc
}

const UTILITY =
  /^(flex|grid|block|inline|hidden|relative|absolute|fixed|sticky|static|container|wrapper|inner|outer|row|col|cols|items|justify|content|self|place|overflow|z|w|h|min|max|size|p[xytrbl]?|m[xytrbl]?|gap|space|text|font|leading|tracking|bg|border|rounded|shadow|opacity|transition|duration|ease|transform|scale|rotate|translate|order|lg|md|sm|xl|2xl|group|peer|pointer|cursor|select|object|aspect|inset|top|left|right|bottom|isolate|mix|underline|whitespace|shrink|grow|basis|truncate|sr|not|has|data|aria|motion|dark|js|is|has|clearfix|visible|invisible|mx|my|columns|divide|ring|outline|fill|stroke|list|align|float|clear|box|table|contents|antialiased|uppercase|lowercase|capitalize|italic|container|section|page|site|main|layout|wp|elementor|et|av|vc|fl|x|y)(-|$|_)/i
const pascal = (s: string) =>
  s
    .replace(/[^a-zA-Z0-9]+(.)?/g, (_, c: string | undefined) =>
      c ? c.toUpperCase() : '',
    )
    .replace(/^./, (c) => c.toUpperCase())

/* A name the author gave the block: aria-label, id, or a semantic-looking class. */
export function authoredName(n: SnapNode): string | undefined {
  if (n.label && n.label.length <= 40) return pascal(n.label)
  if (
    n.id &&
    /^[a-z][a-z-_]{2,30}$/i.test(n.id) &&
    !/^(root|app|__next|main|content|page|wrapper|container)$/i.test(n.id)
  )
    return pascal(n.id)
  for (const token of n.cls.split(/\s+/)) {
    const base = token.split('__')[0] ?? ''
    if (/^[a-z]{3,}(-[a-z]{2,})*$/.test(base) && !UTILITY.test(base)) {
      const name = pascal(
        base.replace(/(^section-|-section$|-wrap(per)?$|-block$)/g, ''),
      )
      if (name.length >= 3) return name
    }
  }
  return undefined
}

/* Main-content blocks of a page: <main>'s children (or the body's, minus chrome), single wrappers
   unwrapped, tall generic wrappers of stacked blocks split, side-by-side columns kept together. */
export function contentBlocks(root: SnapNode, viewportHeight = 900) {
  const chrome = findChrome(root)
  const chromeSet = new Set(
    [chrome.header, chrome.nav, chrome.footer].filter(
      (x): x is SnapNode => !!x,
    ),
  )
  let blocks = (
    chrome.main
      ? contentChildren(chrome.main, chromeSet)
      : contentChildren(root, chromeSet)
  ).filter((b) => area(b) > 0 || b.children.length)
  const generic = (n: SnapNode) => !SECTION_TAGS.has(n.tag) && !isMain(n)
  for (let guard = 0; guard < 12; guard++) {
    const only = blocks[0]
    if (blocks.length !== 1 || !only || !generic(only)) break
    const kids = visibleKids(only)
    if (
      !kids.length ||
      sideBySide(kids) ||
      findRepeat(only)?.container === only
    )
      break
    blocks = kids
  }
  const split = (n: SnapNode): Array<SnapNode> => {
    const kids = visibleKids(n)
    const big = kids.filter(
      (k) => k.box[3] >= MIN_SECTION_HEIGHT || SECTION_TAGS.has(k.tag),
    )
    if (
      generic(n) &&
      n.box[3] > viewportHeight * 1.5 &&
      big.length >= 2 &&
      !sideBySide(kids) &&
      findRepeat(n)?.container !== n
    )
      return kids.flatMap(split)
    return [n]
  }
  blocks = blocks.flatMap(split)
  return { chrome, blocks, hasMain: !!chrome.main }
}

const unionBox = (nodes: Array<SnapNode>): Box => {
  const xs = nodes.map((n) => n.box[0])
  const ys = nodes.map((n) => n.box[1])
  const x2 = nodes.map((n) => n.box[0] + n.box[2])
  const y2 = nodes.map((n) => n.box[1] + n.box[3])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return [x, y, Math.max(...x2) - x, Math.max(...y2) - y]
}

/* Compact tree for the agent (same idea as extract.ts summarize): single-child wrappers without
   their own fill/layout collapse, at most 12 children per level. */
export function summarizeNode(
  n: SnapNode,
  id: string,
  depth: number,
): TreeNode {
  let node = n
  while (
    node.children.length === 1 &&
    !node.bg &&
    !node.text &&
    !node.src &&
    !node.href &&
    !node.layout &&
    node.children[0]
  )
    node = node.children[0]
  const kids =
    depth > 0
      ? node.children
          .filter(hasContent)
          .slice(0, 12)
          .map((c, i) => summarizeNode(c, `${id}.${i}`, depth - 1))
      : []
  return {
    id,
    type: node.tag,
    name: authoredName(node) ?? node.tag,
    size: [node.box[2], node.box[3]],
    ...(node.bg && { fill: node.bg }),
    ...(node.radius !== null && { radius: node.radius }),
    ...(node.layout && { layout: node.layout }),
    ...(node.text && { text: node.text.slice(0, 200) }),
    ...(node.href && { href: node.href }),
    ...((node.src ?? node.bgImage) && {
      image: node.src ?? node.bgImage ?? '',
    }),
    ...(kids.length && { children: kids }),
  }
}

export type Segmented = {
  kind: 'page' | 'screen'
  sections: Array<WebSection>
  hasMain: boolean
}

/* Page → typed sections: Header / Nav, main content blocks (≥ 200 px, or a <section>/<article>;
   runs of smaller blocks are grouped), Footer. First block with an <h1> is a Hero; a block with a
   repeated item grid is a CardGrid; a form is ContactForm / Newsletter / Form; otherwise the
   author's name for it (aria-label, id, class) or Content. One content block = a `screen`, typed
   Screen, with its big regions listed (as extract.ts does for Figma screens). */
export function segment(
  snap: Snapshot,
  slugBase: string,
  viewportHeight = 900,
): Segmented {
  const { chrome, blocks, hasMain } = contentBlocks(snap.root, viewportHeight)
  const inheritBg = (n: SnapNode) => n.bg ?? snap.root.bg ?? undefined
  const groups: Array<Array<SnapNode>> = []
  let run: Array<SnapNode> = []
  for (const b of blocks) {
    if (!hasContent(b) && b.box[3] < 40) continue
    if (b.box[3] >= MIN_SECTION_HEIGHT || SECTION_TAGS.has(b.tag)) {
      if (run.length) groups.push(run)
      run = []
      groups.push([b])
    } else run.push(b)
  }
  if (run.length) groups.push(run)
  // A small run right before a big block is usually its heading: fold it in.
  for (let i = groups.length - 2; i >= 0; i--) {
    const cur = groups[i]
    const next = groups[i + 1]
    if (!cur || !next) continue
    const small = cur.every(
      (b) => b.box[3] < MIN_SECTION_HEIGHT && !SECTION_TAGS.has(b.tag),
    )
    const headingOnly = cur.every(
      (b) => [b, ...descendants(b)].some((d) => d.level !== null) || !b.text,
    )
    if (small && headingOnly && cur.reduce((h, b) => h + b.box[3], 0) < 160) {
      groups.splice(i, 2, [...cur, ...next])
    }
  }
  const kind: Segmented['kind'] = groups.length >= 2 ? 'page' : 'screen'
  const sections: Array<WebSection> = []
  const make = (
    nodes: Array<SnapNode>,
    index: number,
    chromeType?: string,
  ): WebSection => {
    const id = chromeType
      ? `${slugBase}-${chromeType.toLowerCase()}`
      : `${slugBase}-${index}`
    const single = nodes.length === 1 ? nodes[0] : undefined
    const box = single ? single.box : unionBox(nodes)
    const wrapper: SnapNode = single ?? {
      ...(nodes[0] ?? snap.root),
      tag: 'div',
      id: '',
      cls: '',
      label: '',
      box,
      text: '',
      ownText: false,
      href: null,
      src: null,
      bgImage: null,
      level: null,
      layout: null,
      radius: null,
      children: nodes,
    }
    const rep = chromeType ? undefined : findRepeat(wrapper)
    const c = contentOf(wrapper)
    // The text record leaves the repeated items out (they are in `repeat.items`).
    const own = rep ? contentOf(wrapper, new Set([rep.container])) : c
    let wordmark: string | undefined
    if (chromeType === 'Header') {
      const home = [...descendants(wrapper)].find(
        (d) =>
          d.tag === 'a' &&
          d.href !== null &&
          /^https?:\/\/[^/]+\/?$/.test(d.href),
      )
      const logo = home
        ? [home, ...descendants(home)].find((d) => d.tag === 'img')
        : undefined
      wordmark = home?.text || logo?.alt || snap.siteName || undefined
    }
    let type = chromeType ?? ''
    if (!type) {
      const h1 = c.headings.some((h) => h.level === 1)
      const named = single ? authoredName(single) : undefined
      if (kind === 'screen') type = 'Screen'
      else if (index === 0 && h1) type = 'Hero'
      else if (c.inputs.includes('textarea')) type = 'ContactForm'
      else if (c.inputs.includes('email') && c.inputs.length <= 3)
        type = 'Newsletter'
      else if (named) type = named
      else if (c.inputs.length) type = 'Form'
      else if (rep) type = 'CardGrid'
      else type = 'Content'
    }
    const heading = c.headings[0]?.text
    const section: WebSection = {
      id,
      name:
        (heading && heading.length <= 60 ? heading : undefined) ??
        (single ? authoredName(single) : undefined) ??
        type,
      type,
      size: [box[2], box[3]],
      box,
      ...(inheritBg(wrapper) && { background: inheritBg(wrapper) }),
      ...(single?.layout && { layout: single.layout }),
      text: textRecord(own, wordmark),
      content: {
        headings: c.headings,
        paragraphs: c.paragraphs,
        links: c.links,
        buttons: c.buttons,
      },
      images: c.images,
      embeds: c.embeds,
      ...(c.inputs.length && { form: { fields: c.inputs } }),
      ...(rep && {
        repeat: { count: rep.items.length, items: rep.items.map(itemOf) },
      }),
      tree: summarizeNode(wrapper, id, 4),
    }
    if (type === 'Screen') {
      const pageArea = Math.max(
        1,
        snap.width * Math.max(snap.height, viewportHeight),
      )
      section.regions = [...descendants(wrapper)]
        .filter(
          (d) =>
            area(d) >= pageArea * 0.15 && d.children.length && d !== wrapper,
        )
        .filter(
          (d, _, all) =>
            !all.some(
              (o) =>
                o !== d &&
                [...descendants(o)].includes(d) &&
                area(o) - area(d) < area(o) * 0.1,
            ),
        )
        .slice(0, 8)
        .map((d, i) => ({
          id: `${id}.r${i}`,
          name: authoredName(d) ?? (d.label || d.tag),
          box: [
            Math.round((d.box[0] / Math.max(1, snap.width)) * 100),
            Math.round((d.box[1] / Math.max(1, snap.height)) * 100),
            Math.round((d.box[2] / Math.max(1, snap.width)) * 100),
            Math.round((d.box[3] / Math.max(1, snap.height)) * 100),
          ],
        }))
    }
    return section
  }
  if (chrome.header) sections.push(make([chrome.header], 0, 'Header'))
  if (chrome.nav) sections.push(make([chrome.nav], 0, 'Nav'))
  groups.forEach((g, i) => sections.push(make(g, i)))
  if (chrome.footer) sections.push(make([chrome.footer], 0, 'Footer'))
  return { kind, sections, hasMain }
}

/* Every link on a snapshot, `nav` when inside header/nav/footer. */
export function snapshotLinks(root: SnapNode): Array<FoundLink> {
  const out: Array<FoundLink> = []
  const visit = (n: SnapNode, chrome: boolean) => {
    const inChrome = chrome || isHeader(n) || isFooter(n) || isNav(n)
    if (n.tag === 'a' && n.href)
      out.push({ href: n.href, zone: inChrome ? 'nav' : 'main' })
    for (const c of n.children) visit(c, inChrome)
  }
  visit(root, false)
  return out
}

// ---- collections ----

export type CrawledPage = {
  path: string
  title: string
  sections: Array<WebSection>
  /** Links from content sections only (not header/nav/footer), as paths on this origin. */
  contentLinks: Array<string>
}

export type CollectionField = {
  name: string
  type: 'string' | 'text' | 'number' | 'image[]'
  coverage: string
}
export type Collection = {
  name: string
  listRoute: string
  detailRouteShape: string
  fields: Array<CollectionField>
  instances: Array<{
    url: string
    path: string
    slug: string
    title: string
    fields: Record<string, string | number | Array<string>>
  }>
  /** Pages under the detail path known from links/sitemaps: fetched instances + `notFetched`. */
  found: number
  /** Paths under the detail path that were never fetched (presumed instances, content unknown). */
  notFetched: Array<string>
}

const CHROME_TYPES = new Set(['Header', 'Nav', 'Footer'])
const RANK: Record<CollectionField['type'], number> = {
  string: 0,
  number: 1,
  text: 2,
  'image[]': 3,
}
export const skeletonOf = (sections: Array<WebSection>) =>
  sections
    .filter((s) => !CHROME_TYPES.has(s.type))
    .map((s) => s.type + (s.repeat ? '[]' : ''))
    .join('|')

/* The part of the <title> that is not the site's name ("Film · Alex Olson Studio" → "Film"). */
export function cleanTitle(title: string, siteSuffix: string | undefined) {
  if (!siteSuffix) return title
  const parts = title.split(/\s+[|·•–—-]\s+/)
  const kept = parts.filter((p) => p.trim() !== siteSuffix)
  return (kept.length ? kept : parts).join(' · ').trim()
}

/* The title segment shared by most pages (the site name), if any. */
export function commonTitleSuffix(titles: Array<string>): string | undefined {
  const counts = new Map<string, number>()
  for (const t of titles)
    for (const p of new Set(t.split(/\s+[|·•–—-]\s+/).map((s) => s.trim())))
      if (p) counts.set(p, (counts.get(p) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return top && titles.length >= 2 && top[1] >= titles.length * 0.6
    ? top[0]
    : undefined
}

const YEAR = /\b(1[89]\d\d|20\d\d)\b/
const DIMENSIONS =
  /\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?(?:\s*[x×]\s*\d+(?:[.,]\d+)?)?\s*(?:cm|mm|in\b|inches|")/i

/* Fields of one instance page: title, images, caption/body text, year and dimensions when the
   text carries them. Repeated lists (siblings, related items) and nav bars are not the item. */
export function instanceFields(
  page: CrawledPage,
  siteSuffix: string | undefined,
): { title: string; fields: Record<string, string | number | Array<string>> } {
  const headings: Array<{ level: number; text: string }> = []
  const paragraphs: Array<string> = []
  const images: Array<string> = []
  for (const s of page.sections) {
    if (CHROME_TYPES.has(s.type)) continue
    const repeated = new Set(
      (s.repeat?.items ?? [])
        .flatMap((i) => [i.title, i.text, i.image])
        .filter(Boolean),
    )
    const repeatedImages = new Set((s.repeat?.items ?? []).map((i) => i.image))
    headings.push(...s.content.headings.filter((h) => !repeated.has(h.text)))
    paragraphs.push(
      ...s.content.paragraphs.filter(
        (p) => !repeated.has(p) && !/^\d+\s*\/\s*\d+$/.test(p) && p.length > 1,
      ),
    )
    for (const im of s.images)
      if (
        !im.background &&
        !repeatedImages.has(im.src) &&
        !images.includes(im.file ?? im.src)
      )
        images.push(im.file ?? im.src)
  }
  const h1 = headings.find((h) => h.level === 1)?.text
  const title =
    h1 ?? (cleanTitle(page.title, siteSuffix) || headings[0]?.text || page.path)
  const fields: Record<string, string | number | Array<string>> = { title }
  const text = paragraphs.filter((p) => p !== title)
  if (images.length) fields.images = images
  if (text.length === 1 && (text[0] ?? '').length <= 200)
    fields.caption = text[0] ?? ''
  else if (text.length) fields.body = text.join('\n\n')
  const short = [title, ...text.filter((t) => t.length <= 200)].join(' ')
  const year = YEAR.exec(short)?.[1]
  if (year) fields.year = Number(year)
  const dims = DIMENSIONS.exec(short)?.[0]
  if (dims) fields.dimensions = dims.trim()
  return { title, fields }
}

/* Pages under one parent path that share a section skeleton, ≥ 3 of them linked from one list page
   (content links, not the nav), are one collection: {listRoute, detailRouteShape, fields,
   instances}. Their paths are returned in `members` so the caller drops them from the routes.
   The crawl fetches only a sample of each parent path; `inventory` (every known page path) fills
   in the rest: unfetched siblings count as list-page links and are listed in `notFetched`. */
export function detectCollections(
  pages: Array<CrawledPage>,
  origin: string,
  siteSuffix?: string,
  inventory: Array<string> = [],
): { collections: Array<Collection>; members: Set<string> } {
  const fetched = new Set(pages.map((p) => p.path))
  const byDir = new Map<string, Array<CrawledPage>>()
  for (const p of pages) {
    if (p.path === '/') continue
    const d = dirOf(p.path)
    byDir.set(d, [...(byDir.get(d) ?? []), p])
  }
  const collections: Array<Collection> = []
  const members = new Set<string>()
  for (const [dir, group] of byDir) {
    if (group.length < 3) continue
    const bySkeleton = new Map<string, Array<CrawledPage>>()
    for (const p of group) {
      const k = skeletonOf(p.sections)
      bySkeleton.set(k, [...(bySkeleton.get(k) ?? []), p])
    }
    const mode = [...bySkeleton.values()].sort((a, b) => b.length - a.length)[0]
    if (!mode || mode.length < 3) continue
    const memberPaths = new Set(mode.map((p) => p.path))
    const unfetched =
      dir === '/'
        ? []
        : [
            ...new Set(
              inventory.filter((p) => dirOf(p) === dir && !fetched.has(p)),
            ),
          ].sort()
    const linkable = new Set([...memberPaths, ...unfetched])
    const linkCount = (p: CrawledPage) =>
      new Set(p.contentLinks.filter((l) => linkable.has(l))).size
    const candidates = pages
      .filter((p) => !memberPaths.has(p.path))
      .map((p) => ({ p, n: linkCount(p) }))
      .filter((x) => x.n >= 3)
      .sort(
        (a, b) =>
          (b.p.path === dir ? 1 : 0) - (a.p.path === dir ? 1 : 0) || b.n - a.n,
      )
    const list = candidates[0]?.p
    if (!list) continue
    const instances = mode
      .map((p) => {
        const { title, fields } = instanceFields(p, siteSuffix)
        return {
          url: origin + p.path,
          path: p.path,
          slug: p.path.split('/').pop() ?? '',
          title,
          fields,
        }
      })
      .sort((a, b) => a.path.localeCompare(b.path))
    const names = new Map<
      string,
      { type: CollectionField['type']; n: number }
    >()
    for (const inst of instances)
      for (const [name, v] of Object.entries(inst.fields)) {
        const type: CollectionField['type'] = Array.isArray(v)
          ? 'image[]'
          : typeof v === 'number'
            ? 'number'
            : v.length > 200
              ? 'text'
              : 'string'
        const cur = names.get(name)
        names.set(name, {
          type: cur && RANK[cur.type] > RANK[type] ? cur.type : type,
          n: (cur?.n ?? 0) + 1,
        })
      }
    const name =
      (dir === '/' ? list.path : dir).split('/').filter(Boolean).pop() ??
      'items'
    collections.push({
      name,
      listRoute: list.path,
      detailRouteShape: dir === '/' ? '/:slug' : `${dir}/:slug`,
      fields: [...names.entries()].map(([n, v]) => ({
        name: n,
        type: v.type,
        coverage: `${v.n}/${instances.length}`,
      })),
      instances,
      found: instances.length + unfetched.length,
      notFetched: unfetched,
    })
    for (const p of memberPaths) members.add(p)
  }
  return { collections, members }
}

// ---- polite fetching ----

/* One scheduler per crawled origin. Every request to it (pages, robots.txt, sitemaps, stylesheets,
   same-origin images, browser navigations) goes through `run`, which keeps the crawl gentle:
   at most `concurrency` requests in flight, `minGapMs` between request starts, a timeout, one
   retry with backoff for timeouts / resets / 429 / 503 (honouring Retry-After). It adapts: after
   `slowAfter` consecutive failures it drops to one request at a time and pauses `cooldownMs`;
   after `abortAfter` it stops for good (SiteDownError). Each request kind has an attempt budget,
   retries included, so a failing site can never turn a 30-page crawl into 400 requests. */
export type Politeness = {
  concurrency: number
  minGapMs: number
  timeoutMs: number
  retryDelayMs: number
  slowAfter: number
  cooldownMs: number
  abortAfter: number
  maxRetryAfterMs: number
}
export const POLITE: Politeness = {
  concurrency: 2,
  minGapMs: 300,
  timeoutMs: 15_000,
  retryDelayMs: 2000,
  slowAfter: 2,
  cooldownMs: 3000,
  abortAfter: 8,
  maxRetryAfterMs: 60_000,
}
export const MAX_CONCURRENCY = 4
export const SITE_DOWN =
  'site stopped responding; try again later or pick fewer pages'

export class SiteDownError extends Error {
  constructor(detail?: string) {
    super(detail ? `${SITE_DOWN} (${detail})` : SITE_DOWN)
    this.name = 'SiteDownError'
  }
}
export class BudgetError extends Error {
  constructor(kind: string, n: number) {
    super(`attempt budget for ${kind} requests spent (${n})`)
    this.name = 'BudgetError'
  }
}

/* What one attempt produced: the HTTP status (for the scheduler's health check) and the caller's
   value. A task that throws is a network failure or a timeout. */
export type Attempted<T> = {
  status: number
  retryAfter: string | null
  value: T
}
export type Task<T> = (
  signal: AbortSignal,
  timeoutMs: number,
) => Promise<Attempted<T>>

export function retryAfterMs(
  value: string | null,
  now: number,
): number | undefined {
  if (!value) return undefined
  const s = Number(value.trim())
  if (value.trim() && Number.isFinite(s) && s >= 0) return s * 1000
  const d = Date.parse(value)
  return Number.isFinite(d) ? Math.max(0, d - now) : undefined
}

const errorParts = (e: unknown) => {
  const parts: Array<string> = []
  let cur: unknown = e
  for (let i = 0; i < 4 && cur instanceof Error; i++) {
    parts.push(cur.name, cur.message)
    if ('code' in cur && typeof cur.code === 'string') parts.push(cur.code)
    cur = cur.cause
  }
  return parts.join(' ')
}
const TIMEOUT = /TimeoutError|timed? ?out|ETIMEDOUT|ERR_TIMED_OUT/i
const RESET =
  /ECONNRESET|ECONNREFUSED|EPIPE|UND_ERR|socket|other side closed|fetch failed|ERR_CONNECTION|ERR_EMPTY_RESPONSE|ERR_NETWORK/i

/* A thrown error worth one retry: a timeout or a dropped connection. */
export const transientError = (e: unknown) => {
  const s = errorParts(e)
  return TIMEOUT.test(s) || RESET.test(s)
}

/* Short, stable reason for the skipped list. */
export function errorText(e: unknown, timeoutMs: number): string {
  const s = errorParts(e)
  if (TIMEOUT.test(s))
    return `timed out after ${Math.round(timeoutMs / 1000)} s`
  const code = /ECONNRESET|ECONNREFUSED|EPIPE|ENOTFOUND|EAI_AGAIN/.exec(s)?.[0]
  if (code) return `connection failed (${code})`
  return e instanceof Error ? (e.message.split('\n')[0] ?? e.name) : String(e)
}

const RETRY_STATUS = new Set([429, 503])
const sleep = (ms: number) =>
  new Promise<void>((r) => {
    setTimeout(r, ms)
  })

export class Scheduler {
  readonly p: Politeness
  concurrency: number
  down: string | undefined
  attempts = 0
  readonly used = new Map<string, number>()
  private readonly budget: Record<string, number>
  private active = 0
  private waiters: Array<() => void> = []
  private consecutive = 0
  private nextStart = 0
  private pausedUntil = 0

  constructor(p: Politeness, budget: Record<string, number> = {}) {
    this.p = p
    this.concurrency = Math.max(1, Math.min(MAX_CONCURRENCY, p.concurrency))
    this.budget = budget
  }

  /* Attempts left for a kind (Infinity when it has no budget). */
  left(kind: string) {
    return (this.budget[kind] ?? Infinity) - (this.used.get(kind) ?? 0)
  }
  setBudget(kind: string, n: number) {
    this.budget[kind] = n
  }

  private async acquire() {
    while (this.active >= this.concurrency && !this.down)
      await new Promise<void>((r) => this.waiters.push(r))
    this.active++
  }
  private release() {
    this.active--
    if (this.down) for (const w of this.waiters.splice(0)) w()
    else this.waiters.shift()?.()
  }
  private pause(ms: number) {
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + ms)
  }
  private async turn() {
    const now = Date.now()
    const start = Math.max(now, this.nextStart, this.pausedUntil)
    this.nextStart = start + this.p.minGapMs
    if (start > now) await sleep(start - now)
  }
  private stop(detail?: string) {
    this.down = new SiteDownError(detail).message
    for (const w of this.waiters.splice(0)) w()
  }
  /* The server answered or failed; returns true when the answer was a failure. */
  private health(failed: boolean, retryAfter?: number) {
    if (retryAfter !== undefined) {
      if (retryAfter > this.p.maxRetryAfterMs)
        this.stop(`it asked to wait ${Math.round(retryAfter / 1000)} s`)
      else this.pause(retryAfter)
    }
    if (!failed) {
      this.consecutive = 0
      return
    }
    this.consecutive++
    if (this.consecutive >= this.p.abortAfter)
      this.stop(`${this.consecutive} failed requests in a row`)
    else if (this.consecutive >= this.p.slowAfter) {
      this.concurrency = 1
      this.pause(this.p.cooldownMs)
    }
  }

  async run<T>(kind: string, task: Task<T>): Promise<Attempted<T>> {
    for (let attempt = 0; ; attempt++) {
      await this.acquire()
      let outcome:
        | { ok: true; res: Attempted<T> }
        | { ok: false; error: unknown }
      try {
        if (this.down) throw new SiteDownError()
        if (this.left(kind) <= 0)
          throw new BudgetError(kind, this.budget[kind] ?? 0)
        // Reserve the attempt before waiting for a turn, so parallel callers cannot overspend.
        this.used.set(kind, (this.used.get(kind) ?? 0) + 1)
        this.attempts++
        await this.turn()
        if (this.down) {
          this.used.set(kind, (this.used.get(kind) ?? 1) - 1)
          this.attempts--
          throw new SiteDownError()
        }
        try {
          outcome = {
            ok: true,
            res: await task(
              AbortSignal.timeout(this.p.timeoutMs),
              this.p.timeoutMs,
            ),
          }
        } catch (error) {
          outcome = { ok: false, error }
        }
      } finally {
        this.release()
      }
      const status = outcome.ok ? outcome.res.status : 0
      const failed = !outcome.ok || RETRY_STATUS.has(status) || status >= 500
      const wait = outcome.ok
        ? retryAfterMs(outcome.res.retryAfter, Date.now())
        : undefined
      this.health(failed, RETRY_STATUS.has(status) ? wait : undefined)
      const retry =
        attempt === 0 &&
        !this.down &&
        this.left(kind) > 0 &&
        (outcome.ok ? RETRY_STATUS.has(status) : transientError(outcome.error))
      if (retry) {
        await sleep(Math.max(this.p.retryDelayMs, wait ?? 0))
        continue
      }
      if (outcome.ok) return outcome.res
      throw outcome.error
    }
  }
}

// ---- staged crawl ----

export type Skip = { url: string; why: string }
export type Loaded<T> =
  | { kind: 'page'; finalUrl: string; links: Array<FoundLink>; data: T }
  | { kind: 'skip'; why: string }
export type Group = { prefix: string; count: number; sampled: number }

/* Only real problems go to `skipped`: errors, HTTP errors, robots.txt, logins, a page that
   answered with something other than HTML. Links to files (images, PDFs), mailto/tel, query
   variants, pagination, other origins and endpoints like /wp-json are simply not pages. */
const REPORTED = new Set(['login page'])

/* The group a path belongs to for the page picker: its first segment when another page shares
   it (/services, /services/roofing → "/services"), else "/" (top-level pages). */
export const firstSegment = (path: string) =>
  path === '/' ? '/' : `/${path.split('/')[1] ?? ''}`
export function groupPages(
  paths: Iterable<string>,
  sampledPaths: Iterable<string> = [],
): Array<Group> {
  const all = [...new Set(paths)]
  const segs = new Map<string, number>()
  for (const p of all)
    segs.set(firstSegment(p), (segs.get(firstSegment(p)) ?? 0) + 1)
  const groupOf = (p: string) =>
    (segs.get(firstSegment(p)) ?? 0) >= 2 ? firstSegment(p) : '/'
  const groups = new Map<string, Group>()
  for (const p of all) {
    const prefix = groupOf(p)
    const g = groups.get(prefix) ?? { prefix, count: 0, sampled: 0 }
    g.count++
    groups.set(prefix, g)
  }
  for (const p of new Set(sampledPaths)) {
    const g = groups.get(groupOf(p))
    if (g) g.sampled++
  }
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix),
  )
}

export type CrawlResult<T> = {
  pages: Array<{ url: string; path: string; data: T }>
  skipped: Array<Skip>
  /** Crawlable same-origin pages known from links and sitemaps. */
  found: number
  /** Of those, how many were never requested. */
  notFetched: number
  groups: Array<Group>
  /** Every known page path (fetched or not), for collection detection. */
  inventory: Array<string>
  /** Set when the site stopped responding and the crawl gave up. */
  aborted: string | undefined
}

const INVENTORY_CAP = 10_000

/* Stage A: the start page (fetched alone; no other request starts until it is done) plus the
   sitemap URLs build an inventory of every same-origin page WITHOUT fetching them. Links found on
   pages fetched later join the inventory too. Stage B: fetch at most `max` of them in this order:
   the start page, nav/header/footer links, one representative of each group not sampled yet,
   in-page links, sitemap URLs; a parent path that already has 3 pages sampled waits at the back,
   and none gets more than `perDirCap` (collections are recognised from a sample, not by fetching
   every instance). The scheduler's budget ends the crawl when attempts run out. */
export async function crawl<T>(o: {
  origin: string
  seeds: Array<string>
  sitemap: Array<string>
  discover: boolean
  max: number
  robots: Robots
  scheduler: Scheduler
  perDirCap?: number
  load: (
    url: string,
    signal: AbortSignal,
    timeoutMs: number,
  ) => Promise<Attempted<Loaded<T>>>
}): Promise<CrawlResult<T>> {
  type Entry = {
    url: string
    path: string
    tier: number
    seq: number
    state: 'queued' | 'running' | 'done'
  }
  const inventory = new Map<string, Entry>()
  const queued: Array<Entry> = []
  const done = new Set<string>()
  const skipped = new Map<string, string>()
  const startedDir = new Map<string, number>()
  const startedSeg = new Map<string, number>()
  const segSize = new Map<string, number>()
  const pages: CrawlResult<T>['pages'] = []
  let seq = 0
  const bump = (m: Map<string, number>, k: string) =>
    m.set(k, (m.get(k) ?? 0) + 1)
  const skip = (url: string, why: string) => {
    if (!skipped.has(url)) skipped.set(url, why)
  }
  const add = (href: string, base: string, tier: number) => {
    const v = classifyUrl(href, base, o.origin)
    if (!v.ok) {
      if (REPORTED.has(v.why)) skip(v.url, v.why)
      else if (v.why === 'query variant') add(withoutQuery(v.url), base, tier)
      return
    }
    const cur = inventory.get(v.url)
    if (cur) {
      cur.tier = Math.min(cur.tier, tier)
      return
    }
    if (!robotsAllows(o.robots, v.path)) {
      skip(v.url, 'robots.txt disallows')
      return
    }
    if (inventory.size >= INVENTORY_CAP) return
    const e: Entry = {
      url: v.url,
      path: v.path,
      tier,
      seq: seq++,
      state: 'queued',
    }
    inventory.set(v.url, e)
    bump(segSize, firstSegment(v.path))
    queued.push(e)
  }
  for (const s of o.seeds) add(s, o.origin, 0)
  if (o.discover) for (const s of o.sitemap) add(s, o.origin, 4)

  /* Sort key, lowest first: [tier, pages already started in its group, not the group's own index
     page, discovery tier, discovery order]; undefined = its parent path is capped. A group's first
     pick is therefore its index (/services before /services/roofing) when that is known. */
  const rank = (e: Entry): Array<number> | undefined => {
    const dir = dirOf(e.path)
    const seg = firstSegment(e.path)
    const inDir = dir === '/' ? 0 : (startedDir.get(dir) ?? 0)
    if (o.perDirCap !== undefined && inDir >= o.perDirCap) return undefined
    const inSeg = startedSeg.get(seg) ?? 0
    let tier = e.tier
    if (tier > 2 && inSeg === 0 && (segSize.get(seg) ?? 0) >= 2) tier = 2
    if (inDir >= 3) tier = Math.max(tier, 5)
    return [tier, inSeg, e.path === seg ? 0 : 1, e.tier, e.seq]
  }
  const before = (a: Array<number>, b: Array<number>) => {
    for (let i = 0; i < a.length; i++) {
      const x = a[i] ?? 0
      const y = b[i] ?? 0
      if (x !== y) return x < y
    }
    return false
  }
  const pop = () => {
    let best: { i: number; r: Array<number> } | undefined
    queued.forEach((e, i) => {
      const r = rank(e)
      if (r && (!best || before(r, best.r))) best = { i, r }
    })
    return best ? queued.splice(best.i, 1)[0] : undefined
  }

  const state = { budgetSpent: false }
  let seedsRunning = 0
  const run = async (job: Entry) => {
    let res: Loaded<T>
    try {
      res = (
        await o.scheduler.run('page', (signal, timeoutMs) =>
          o.load(job.url, signal, timeoutMs),
        )
      ).value
    } catch (e) {
      if (e instanceof BudgetError) {
        state.budgetSpent = true
        job.state = 'queued'
        queued.push(job)
      } else if (!(e instanceof SiteDownError))
        skip(job.url, `error: ${errorText(e, o.scheduler.p.timeoutMs)}`)
      return
    }
    if (res.kind === 'skip') {
      skip(job.url, res.why)
      return
    }
    const final = classifyUrl(res.finalUrl, job.url, o.origin)
    if (!final.ok) {
      skip(
        job.url,
        final.why === 'off-origin'
          ? 'redirects off-origin'
          : `redirects to ${final.why}`,
      )
      return
    }
    if (done.has(final.url) || pages.length >= o.max) return
    done.add(final.url)
    if (final.url !== job.url && !inventory.has(final.url)) {
      inventory.set(final.url, { ...job, url: final.url, path: final.path })
      bump(segSize, firstSegment(final.path))
    }
    pages.push({ url: final.url, path: final.path, data: res.data })
    if (o.discover)
      for (const l of res.links)
        add(l.href, final.url, l.zone === 'nav' ? 1 : 3)
  }
  const running = new Set<Promise<void>>()
  for (;;) {
    while (
      !state.budgetSpent &&
      !o.scheduler.down &&
      !(o.discover && seedsRunning) &&
      running.size < o.scheduler.concurrency &&
      pages.length + running.size < o.max
    ) {
      const job = pop()
      if (!job) break
      job.state = 'running'
      bump(startedDir, dirOf(job.path))
      bump(startedSeg, firstSegment(job.path))
      const seed = job.tier === 0
      if (seed) seedsRunning++
      const p: Promise<void> = run(job).finally(() => {
        if (seed) seedsRunning--
        if (job.state === 'running') job.state = 'done'
        running.delete(p)
      })
      running.add(p)
    }
    if (!running.size) break
    await Promise.race(running)
  }
  pages.sort((a, b) =>
    a.path === '/' ? -1 : b.path === '/' ? 1 : a.path.localeCompare(b.path),
  )
  const all = [...inventory.values()]
  return {
    pages,
    skipped: [...skipped.entries()].map(([url, why]) => ({ url, why })),
    found: all.length,
    notFetched: all.filter((e) => e.state === 'queued').length,
    groups: groupPages(
      all.map((e) => e.path),
      pages.map((p) => p.path),
    ),
    inventory: all.map((e) => e.path),
    aborted: o.scheduler.down,
  }
}
