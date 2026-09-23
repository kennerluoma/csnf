/* An existing site's content → this project's Sanity dataset (plan 08). Uses no model tokens.
     pnpm run import --url <https://site> [--max N] [--dry-run] [--confirm] [--resume] [--json]
     pnpm run import --file <export.xml|.json|.csv> [...]
   (`pnpm import` is pnpm's own lockfile command, hence `run`.)

   Steps, each announced as "▶ <step>" so the platform can show them as job steps:
     detect     WordPress REST (<link rel="https://api.w.org/"> or /wp-json/), else an HTML crawl;
                a file is WXR, JSON or CSV by its content
     inventory  how much there is (X-WP-Total per type, media library size; sitemap for a crawl)
     fetch      every item (or --max), 50 per request with _embed; cached next to the state file
     map        the build's schema (`sanity schema extract`) + design/manifest.json collections →
                the mapping table; --dry-run stops here and writes nothing
     write      createOrReplace, 50 documents per transaction, ids imported-<sha1(source URL)>
     assets     images downloaded once (≤ 25 MB), deduped by content hash, uploaded, then patched in
     redirects  design/redirects.json: old path → new path for every document whose URL changed

   Polite like the design crawler (website-lib.ts Scheduler): 2 requests at a time, 300 ms apart,
   backoff, gives up after 8 failures in a row, robots.txt respected, a named User-Agent. Never
   deletes a document. Refuses a dataset that holds documents it did not write unless --confirm.
   Resumable: --state <file> (default .agency/import/state.json) keeps a cursor per source, the
   fetched items and the ids already written; --resume continues from it. Everything that is not
   I/O lives in ./import-lib.ts. */
import { execFileSync } from 'node:child_process'
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { createClient } from '@sanity/client'
import type { SanityClient } from '@sanity/client'
import {
  crawl,
  htmlLinks,
  POLITE,
  robotsAllows,
  Scheduler,
} from './website-lib.ts'
import type { Attempted, Politeness, Robots } from './website-lib.ts'
import { httpGet, responseSkip, siteRules } from './website.ts'
import type { Get } from './website.ts'
import {
  countLabel,
  fieldLines,
  fieldPlan,
  FOLDED,
  formatCount,
  groupType,
  isRec,
  list,
  mapItem,
  mappingTable,
  normalPath,
  pageItem,
  parseCsvExport,
  parseJsonExport,
  parseWxr,
  originalImageUrls,
  rec,
  redirectMap,
  resolveTypes,
  sha1,
  str,
  targetTypes,
  wpContentTypes,
  wpHome,
  wpItem,
  wpUrl,
} from './import-lib.ts'
import type {
  Item,
  Rec,
  Redirect,
  TargetType,
  Taken,
  TypeMapping,
} from './import-lib.ts'

const log = (...a: Array<unknown>) => console.error(...a)
const say = (line: string) => console.log(line)
const step = (name: string) => say(`▶ ${name}`)

const PER_PAGE = 50
const BATCH = 50
const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const POLITE_IMPORT: Politeness = { ...POLITE, timeoutMs: 60_000 }

export type Options = {
  url?: string
  file?: string
  dryRun: boolean
  confirm: boolean
  resume: boolean
  max?: number
  state: string
  json: boolean
  ignoreRobots: boolean
}

export function parseArgs(argv: Array<string>): Options {
  const after = (flag: string) => {
    const i = argv.indexOf(flag)
    const v = i >= 0 ? argv[i + 1] : undefined
    return v && !v.startsWith('--') ? v : undefined
  }
  const url = after('--url')
  const file = after('--file')
  const resume = argv.includes('--resume')
  if (!url && !file && !resume)
    throw new Error(
      'pnpm run import --url <https://site> | --file <export.xml|.json|.csv>',
    )
  if (url && file) throw new Error('--url or --file, not both')
  const max = Number(after('--max'))
  return {
    ...(url && {
      url: new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).href,
    }),
    ...(file && { file: resolve(file) }),
    dryRun: argv.includes('--dry-run'),
    confirm: argv.includes('--confirm'),
    resume,
    ...(Number.isInteger(max) && max > 0 && { max }),
    state: resolve(after('--state') ?? '.agency/import/state.json'),
    json: argv.includes('--json'),
    ignoreRobots: argv.includes('--ignore-robots'),
  }
}

// ---- state (resume) ----

type SourceKind = 'wordpress' | 'wxr' | 'json' | 'csv' | 'html'
type Source = {
  kind: SourceKind
  url?: string
  file?: string
  api?: string
  label: string
}
type State = {
  version: 1
  source: Source
  startedAt: string
  updatedAt: string
  /** Inventory: items per source type (and media / taxonomies for WordPress). */
  counts: Record<string, number>
  /** WordPress: next page per post type. */
  cursors: Record<string, number>
  /** Crawl / export: pages per first path segment, for grouping. */
  segments: Record<string, number>
  fetched: boolean
  done: Array<string>
  patched: Array<string>
  assets: Record<string, string>
  failedImages: Record<string, string>
  redirects?: number
  complete: boolean
}

function readState(path: string): State | undefined {
  if (!existsSync(path)) return undefined
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const r = rec(raw)
  const src = rec(r.source)
  const kind = str(src.kind)
  if (
    r.version !== 1 ||
    !kind ||
    !['wordpress', 'wxr', 'json', 'csv', 'html'].includes(kind)
  )
    return undefined
  const strings = (v: unknown) =>
    list(v).filter((x): x is string => typeof x === 'string')
  const nums = (v: unknown) =>
    Object.fromEntries(
      Object.entries(rec(v)).filter(
        (e): e is [string, number] => typeof e[1] === 'number',
      ),
    )
  const strs = (v: unknown) =>
    Object.fromEntries(
      Object.entries(rec(v)).filter(
        (e): e is [string, string] => typeof e[1] === 'string',
      ),
    )
  const sourceKind =
    (['wordpress', 'wxr', 'json', 'csv', 'html'] as const).find(
      (k) => k === kind,
    ) ?? 'html'
  return {
    version: 1,
    source: {
      kind: sourceKind,
      label: str(src.label) ?? kind,
      ...(str(src.url) && { url: str(src.url) }),
      ...(str(src.file) && { file: str(src.file) }),
      ...(str(src.api) && { api: str(src.api) }),
    },
    startedAt: str(r.startedAt) ?? new Date().toISOString(),
    updatedAt: str(r.updatedAt) ?? new Date().toISOString(),
    counts: nums(r.counts),
    cursors: nums(r.cursors),
    segments: nums(r.segments),
    fetched: r.fetched === true,
    done: strings(r.done),
    patched: strings(r.patched),
    assets: strs(r.assets),
    failedImages: strs(r.failedImages),
    ...(typeof r.redirects === 'number' && { redirects: r.redirects }),
    complete: r.complete === true,
  }
}

// ---- item store: memory for a dry run, an NDJSON file next to the state otherwise ----

type Store = {
  add: (items: Array<Item>) => Promise<void>
  each: () => AsyncGenerator<Item>
  reset: () => Promise<void>
}
function memoryStore(): Store {
  const items: Array<Item> = []
  return {
    add: async (xs) => {
      items.push(...xs)
    },
    each: async function* () {
      yield* items
    },
    reset: async () => {
      items.length = 0
    },
  }
}
function toItem(v: unknown): Item | undefined {
  const r = rec(v)
  const sourceUrl = str(r.sourceUrl)
  if (!sourceUrl) return undefined
  const f = rec(r.featured)
  const fUrl = str(f.url)
  return {
    sourceUrl,
    sourceId: str(r.sourceId) ?? sourceUrl,
    sourceType: str(r.sourceType) ?? '',
    title: str(r.title) ?? '',
    slug: str(r.slug) ?? '',
    ...(str(r.date) && { date: str(r.date) }),
    ...(str(r.excerpt) && { excerpt: str(r.excerpt) }),
    html: str(r.html) ?? '',
    ...(fUrl && {
      featured: {
        url: fUrl,
        alt: str(f.alt) ?? '',
        ...(str(f.caption) && { caption: str(f.caption) }),
      },
    }),
    terms: list(r.terms).filter((t): t is string => typeof t === 'string'),
    ...(str(r.author) && { author: str(r.author) }),
    meta: rec(r.meta),
  }
}
function fileStore(path: string): Store {
  return {
    add: async (xs) => {
      if (!xs.length) return
      await mkdir(dirname(path), { recursive: true })
      await appendFile(path, xs.map((x) => JSON.stringify(x)).join('\n') + '\n')
    },
    // An interrupted fetch can append a page twice (cached, then killed before the cursor was
    // saved); the first copy wins.
    each: async function* () {
      if (!existsSync(path)) return
      const seen = new Set<string>()
      const lines = createInterface({
        input: createReadStream(path, 'utf8'),
        crlfDelay: Infinity,
      })
      for await (const line of lines) {
        if (!line.trim()) continue
        const it = toItem(JSON.parse(line))
        if (!it || seen.has(it.sourceUrl)) continue
        seen.add(it.sourceUrl)
        yield it
      }
    },
    reset: () => rm(path, { force: true }),
  }
}

// ---- HTTP through the polite scheduler, one per origin ----

const schedulers = new Map<string, Scheduler>()
const schedulerFor = (url: string) => {
  const origin = new URL(url).origin
  let s = schedulers.get(origin)
  if (!s) {
    s = new Scheduler(POLITE_IMPORT)
    schedulers.set(origin, s)
  }
  return s
}

type Got<T> = { status: number; headers: Headers; value: T | undefined }
async function fetchVia<T>(
  get: Get,
  url: string,
  kind: string,
  accept: string,
  read: (res: Response) => Promise<T>,
  s = schedulerFor(url),
): Promise<Got<T>> {
  const r: Attempted<Got<T>> = await s.run(kind, async (signal) => {
    const res = await get(url, { signal, accept })
    const value = res.ok ? await read(res) : undefined
    if (!res.ok) await res.body?.cancel()
    return {
      status: res.status,
      retryAfter: res.headers.get('retry-after'),
      value: { status: res.status, headers: res.headers, value },
    }
  })
  return r.value
}
const getJson = (get: Get, url: string) =>
  fetchVia(get, url, 'api', 'application/json', async (res): Promise<unknown> =>
    JSON.parse(await res.text()),
  )
const getText = (
  get: Get,
  url: string,
  accept = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
) => fetchVia(get, url, 'meta', accept, (res) => res.text())

/* At most `cap` bytes; a larger body is cancelled, not buffered. */
async function readCapped(
  res: Response,
  cap: number,
): Promise<Uint8Array | undefined> {
  const len = Number(res.headers.get('content-length'))
  if (Number.isFinite(len) && len > cap) {
    await res.body?.cancel()
    return undefined
  }
  const reader = res.body?.getReader()
  if (!reader) return new Uint8Array(await res.arrayBuffer())
  const parts: Array<Uint8Array> = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > cap) {
      await reader.cancel()
      return undefined
    }
    parts.push(value)
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.byteLength
  }
  return out
}

// ---- detect ----

async function robotsFor(
  origin: string,
  o: Options,
  get: Get,
): Promise<Robots> {
  const { robots } = await siteRules(
    origin,
    o.ignoreRobots,
    schedulerFor(origin),
    get,
  )
  return robots
}

async function detectWordPress(
  start: string,
  get: Get,
): Promise<string | undefined> {
  const page = await getText(get, start).catch(() => undefined)
  const fromHeader = /<([^>]+)>;\s*rel="https:\/\/api\.w\.org\/"/.exec(
    page?.headers.get('link') ?? '',
  )?.[1]
  const fromHtml =
    /<link\b[^>]*rel=["']https:\/\/api\.w\.org\/["'][^>]*>/i.exec(
      page?.value ?? '',
    )?.[0]
  const href = fromHeader ?? /href=["']([^"']+)["']/i.exec(fromHtml ?? '')?.[1]
  const candidates = [href, `${new URL(start).origin}/wp-json/`].filter(
    (x): x is string => !!x,
  )
  for (const api of candidates) {
    const root = new URL(api.replace(/&amp;/g, '&'), start).href
    const types = await getJson(get, wpUrl(root, 'wp/v2/types', {})).catch(
      () => undefined,
    )
    if (
      types?.value !== undefined &&
      isRec(types.value) &&
      Object.keys(types.value).length
    )
      return root
  }
  return undefined
}

function fileKind(path: string, text: string): SourceKind {
  const ext = extname(path).toLowerCase()
  if (ext === '.xml' || /^\s*<\?xml|<rss\b/i.test(text.slice(0, 500)))
    return 'wxr'
  if (ext === '.json' || /^\s*[[{]/.test(text)) return 'json'
  return 'csv'
}

// ---- the dataset ----

function sanity(): {
  client: SanityClient | undefined
  projectId?: string
  dataset: string
} {
  if (!process.env.VITE_SANITY_PROJECT_ID && existsSync('.env.production'))
    process.loadEnvFile('.env.production')
  const projectId = process.env.VITE_SANITY_PROJECT_ID
  let dataset = process.env.VITE_SANITY_DATASET ?? 'production'
  if (existsSync('agency.json'))
    dataset =
      str(rec(JSON.parse(readFileSync('agency.json', 'utf8'))).sanityDataset) ??
      dataset
  const token = process.env.SANITY_WRITE_TOKEN
  if (!projectId) return { client: undefined, dataset }
  return {
    // A dry run reads with the token too when there is one (it sees drafts); it never writes.
    client: createClient({
      projectId,
      dataset,
      apiVersion: '2026-09-01',
      useCdn: false,
      ...(token && { token }),
    }),
    projectId,
    dataset,
  }
}

/* The build's schema, as `sanity schema extract` sees it (what typegen reads too). */
function loadSchema(): Array<TargetType> {
  const out = 'node_modules/.cache/import/schema.json'
  const env = {
    ...process.env,
    SANITY_STUDIO_PROJECT_ID:
      process.env.SANITY_STUDIO_PROJECT_ID ??
      process.env.VITE_SANITY_PROJECT_ID ??
      '',
    SANITY_STUDIO_DATASET:
      process.env.SANITY_STUDIO_DATASET ??
      process.env.VITE_SANITY_DATASET ??
      'production',
  }
  // The admin app's workspace package: admin/ (studio/ in projects made before the rename).
  // `pnpm --filter` with no match exits 0 and does nothing, so it is looked up, not assumed.
  const pkgDir = ['admin', 'studio'].find((d) =>
    existsSync(`${d}/package.json`),
  )
  const pkgName = pkgDir
    ? str(rec(JSON.parse(readFileSync(`${pkgDir}/package.json`, 'utf8'))).name)
    : undefined
  let why = 'no admin/ or studio/ package'
  if (pkgName)
    try {
      // `schema extract` refuses to overwrite its output, and older CLIs do not create folders.
      rmSync(out, { force: true })
      mkdirSync(dirname(out), { recursive: true })
      execFileSync(
        'pnpm',
        [
          '--filter',
          pkgName,
          'exec',
          'sanity',
          'schema',
          'extract',
          '--path',
          `../${out}`,
        ],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
          env,
          timeout: 180_000,
        },
      )
      if (existsSync(out))
        return targetTypes(JSON.parse(readFileSync(out, 'utf8')))
      why = 'it wrote no file'
    } catch (e) {
      why =
        e instanceof Error ? (e.message.split('\n')[0] ?? e.name) : String(e)
    }
  const cached = 'node_modules/.cache/typegen/schema.json'
  if (!existsSync(cached))
    throw new Error(
      `could not read the schema (sanity schema extract: ${why}); run pnpm typegen once, or build the project from the current template`,
    )
  log(
    `schema extract failed (${why}); using ${cached} from the last pnpm typegen`,
  )
  return targetTypes(JSON.parse(readFileSync(cached, 'utf8')))
}

function manifestCollections(): Array<{ name: string; listRoute: string }> {
  if (!existsSync('design/manifest.json')) return []
  const m = rec(JSON.parse(readFileSync('design/manifest.json', 'utf8')))
  return list(m.collections).flatMap((c) => {
    const r = rec(c)
    const name = str(r.name)
    const listRoute = str(r.listRoute)
    return name && listRoute ? [{ name, listRoute }] : []
  })
}

// ---- main ----

export async function runImport(o: Options, deps: { get?: Get } = {}) {
  const get = deps.get ?? httpGet
  const importedAt = new Date().toISOString()
  const previous = o.resume ? readState(o.state) : undefined
  if (o.resume && !previous)
    throw new Error(`nothing to resume: no import state at ${o.state}`)
  const store = o.dryRun
    ? memoryStore()
    : fileStore(o.state.replace(/\.json$/, '') + '.items.ndjson')
  const now = () => new Date().toISOString()
  let state: State
  const save = async () => {
    if (o.dryRun) return
    state.updatedAt = now()
    await mkdir(dirname(o.state), { recursive: true })
    await writeFile(o.state, JSON.stringify(state, null, 2) + '\n')
  }

  // ▶ detect
  step('detect')
  let source: Source
  if (previous && !o.url && !o.file) source = previous.source
  else if (o.file) {
    if (!existsSync(o.file)) throw new Error(`${o.file} not found`)
    const text = await readFile(o.file, 'utf8')
    const kind = fileKind(o.file, text)
    source = {
      kind,
      file: o.file,
      label:
        kind === 'wxr' ? 'WordPress export' : `${kind.toUpperCase()} export`,
    }
  } else {
    const url = o.url ?? ''
    const api = await detectWordPress(url, get)
    source = api
      ? { kind: 'wordpress', url, api, label: 'WordPress' }
      : { kind: 'html', url, label: 'website (HTML crawl)' }
  }
  const sameSource =
    previous &&
    previous.source.kind === source.kind &&
    (previous.source.url ?? previous.source.file) ===
      (source.url ?? source.file)
  if (o.resume && !sameSource)
    throw new Error(
      `the saved import is for ${previous?.source.url ?? previous?.source.file}; start a new one without --resume`,
    )
  state = sameSource
    ? previous
    : {
        version: 1,
        source,
        startedAt: importedAt,
        updatedAt: importedAt,
        counts: {},
        cursors: {},
        segments: {},
        fetched: false,
        done: [],
        patched: [],
        assets: {},
        failedImages: {},
        complete: false,
      }
  if (!sameSource) await store.reset()
  say(
    `source: ${source.label}${source.api ? ` (REST API ${source.api})` : ''}${source.url ? ` at ${source.url}` : ''}${source.file ? ` ${source.file}` : ''}`,
  )

  // Robots: the API and every page must be allowed (the named agent is "Kiln").
  const origin = source.url ? new URL(source.url).origin : undefined
  const robots = origin
    ? await robotsFor(origin, o, get)
    : { rules: [], sitemaps: [] }
  if (source.api && !robotsAllows(robots, new URL(source.api).pathname))
    throw new Error(
      `robots.txt disallows ${source.api}; not importing (pass --ignore-robots only for a site you own)`,
    )

  // ▶ inventory
  step('inventory')
  const wpTypes: Array<{
    name: string
    restBase: string
    label: string
    total: number
  }> = []
  let fileItems: Array<Item> = []
  if (source.kind === 'wordpress' && source.api) {
    const api = source.api
    const total = async (route: string) => {
      const r = await getJson(
        get,
        wpUrl(api, route, { per_page: '1', _fields: 'id' }),
      ).catch(() => undefined)
      const n = Number(r?.headers.get('x-wp-total'))
      return r && r.status < 400 && Number.isFinite(n) ? n : undefined
    }
    const types = wpContentTypes(
      (await getJson(get, wpUrl(api, 'wp/v2/types', {}))).value,
    )
    for (const t of types) {
      const n = await total(`wp/v2/${t.restBase}`)
      if (n) {
        wpTypes.push({ ...t, total: n })
        state.counts[t.name] = n
      }
    }
    for (const [key, route] of [
      ['images', 'wp/v2/media'],
      ['category', 'wp/v2/categories'],
      ['tag', 'wp/v2/tags'],
      ['author', 'wp/v2/users'],
    ] as const) {
      const n = await total(route)
      if (n !== undefined) state.counts[key] = n
    }
  } else if (source.kind === 'html' && origin && source.url) {
    const { sitemapUrls } = await siteRules(
      origin,
      o.ignoreRobots,
      schedulerFor(origin),
      get,
    )
    state.counts.pages = new Set([
      source.url,
      ...sitemapUrls.filter((u) => u.startsWith(origin)),
    ]).size
  } else if (source.file) {
    const text = await readFile(source.file, 'utf8')
    if (source.kind === 'wxr') {
      const wxr = parseWxr(text)
      fileItems = wxr.items
      state.counts.images = wxr.attachments
      for (const [k, v] of Object.entries(wxr.skipped))
        say(`  not imported: ${countLabel(v, `${k} item`)}`)
    } else
      fileItems =
        source.kind === 'json' ? parseJsonExport(text) : parseCsvExport(text)
    if (o.max) fileItems = fileItems.slice(0, o.max)
    const segs = new Map<string, number>()
    for (const it of fileItems) {
      const seg = normalPath(new URL(it.sourceUrl).pathname).split('/')[1] ?? ''
      if (seg) segs.set(seg, (segs.get(seg) ?? 0) + 1)
    }
    state.segments = Object.fromEntries(segs)
    for (const it of fileItems) {
      const t =
        it.sourceType ||
        groupType(new URL(it.sourceUrl).pathname, { segmentCounts: segs })
      state.counts[t] = (state.counts[t] ?? 0) + 1
    }
  }
  say(`found: ${inventoryLine(source, state.counts)}`)
  await save()

  // ▶ fetch
  step('fetch')
  if (state.fetched && sameSource && o.resume)
    say('  already fetched (resumed)')
  else if (source.kind === 'wordpress' && source.api) {
    const api = source.api
    const home = wpHome(api)
    const withItems = wpTypes.filter((t) => t.total > 0)
    const quotas = shareOut(
      withItems.map((t) => t.total),
      o.max,
    )
    const grand = quotas.reduce((a, q) => a + q, 0)
    let fetched = 0
    let lastReport = 0
    for (const [ti, t] of withItems.entries()) {
      const quota = quotas[ti] ?? 0
      let taken = 0
      for (let page = state.cursors[t.name] ?? 1; taken < quota; page++) {
        const per = Math.min(PER_PAGE, quota - taken)
        const url = wpUrl(api, `wp/v2/${t.restBase}`, {
          per_page: String(per),
          page: String(page),
          _embed: '1',
          orderby: 'id',
          // Oldest first keeps page numbers stable while the site publishes (resume); a --max
          // sample shows the newest instead, which is what the site looks like now.
          order: o.max ? 'desc' : 'asc',
        })
        const r = await getJson(get, url)
        if (r.status === 400) break // past the last page
        if (r.status >= 400) throw new Error(`${url}: HTTP ${r.status}`)
        const rows = list(r.value)
        const items = rows.flatMap((row) => {
          const it = wpItem(row, t.name, home)
          return it ? [it] : []
        })
        const take = Math.min(rows.length, quota - taken)
        await store.add(items.slice(0, take))
        taken += take
        fetched += take
        state.cursors[t.name] = page + 1
        await save()
        if (fetched - lastReport >= PER_PAGE || fetched >= grand) {
          say(
            `fetched ${formatCount(Math.min(fetched, grand))} / ${formatCount(grand)}`,
          )
          lastReport = fetched
        }
        const pages = Number(r.headers.get('x-wp-totalpages'))
        if (!rows.length || (Number.isFinite(pages) && page >= pages)) break
      }
    }
  } else if (source.kind === 'html' && origin && source.url) {
    const s = schedulerFor(origin)
    const max = o.max ?? 10_000
    s.setBudget('page', max * 2)
    const { sitemapUrls } = await siteRules(origin, o.ignoreRobots, s, get)
    let n = 0
    const result = await crawl<Item>({
      origin,
      seeds: [source.url],
      sitemap: sitemapUrls,
      discover: true,
      max,
      robots,
      scheduler: s,
      load: async (url, signal) => {
        const res = await get(url, {
          signal,
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        })
        const finalUrl = res.url || url
        const retryAfter = res.headers.get('retry-after')
        const why = responseSkip(
          res.status,
          finalUrl,
          res.headers.get('content-type') ?? '',
        )
        if (why) {
          await res.body?.cancel()
          return {
            status: res.status,
            retryAfter,
            value: { kind: 'skip', why },
          }
        }
        const html = await res.text()
        const item = pageItem(html, finalUrl, '')
        await store.add([item])
        n++
        if (n % PER_PAGE === 0) say(`fetched ${formatCount(n)} pages`)
        return {
          status: res.status,
          retryAfter,
          value: { kind: 'page', finalUrl, links: htmlLinks(html), data: item },
        }
      },
    })
    const segs = new Map<string, number>()
    for (const p of result.inventory) {
      const seg = p.split('/')[1] ?? ''
      if (seg && p.split('/').length > 2)
        segs.set(seg, (segs.get(seg) ?? 0) + 1)
    }
    state.segments = Object.fromEntries(segs)
    state.counts.pages = result.found
    say(
      `fetched ${formatCount(result.pages.length)} of ${formatCount(result.found)} pages${result.skipped.length ? `; skipped ${result.skipped.length}` : ''}`,
    )
    for (const x of result.skipped.slice(0, 10))
      say(`  skipped ${x.url} (${x.why})`)
    if (result.aborted) throw new Error(result.aborted)
  } else {
    await store.add(fileItems)
    say(`read ${formatCount(fileItems.length)} item(s) from the file`)
  }
  state.fetched = true
  await save()

  // ▶ map
  step('map')
  const targets = loadSchema()
  const collections = manifestCollections()
  const segments = new Map(Object.entries(state.segments))
  const typeOf = (it: Item) =>
    it.sourceType ||
    groupType(new URL(it.sourceUrl).pathname, {
      collections,
      segmentCounts: segments,
    })
  const fetchedCounts = new Map<string, number>()
  for await (const it of store.each())
    fetchedCounts.set(typeOf(it), (fetchedCounts.get(typeOf(it)) ?? 0) + 1)
  const inventoryTypes =
    source.kind === 'wordpress'
      ? [
          ...wpTypes.map((t) => ({ name: t.name, count: t.total })),
          ...['category', 'tag', 'author'].flatMap((k) =>
            state.counts[k] ? [{ name: k, count: state.counts[k] ?? 0 }] : [],
          ),
        ]
      : [...fetchedCounts].map(([name, count]) => ({ name, count }))
  const mapping = resolveTypes(inventoryTypes, targets, collections)
  const targetOf = (type: string) => {
    const m =
      mapping.find((x) => x.source === type) ??
      resolveTypes([{ name: type, count: 0 }], targets, collections)[0]
    return m?.target && m.how !== 'folded'
      ? targets.find((t) => t.name === m.target)
      : undefined
  }
  say('mapping:')
  say(mappingTable(mapping, targets))
  say(
    '  every document also gets sourceUrl, sourceId, importedAt and sourceMeta (JSON of everything else)',
  )

  const { client, projectId, dataset } = sanity()
  const types = [
    ...new Set(
      mapping.flatMap((m) =>
        m.target && m.how !== 'folded' ? [m.target] : [],
      ),
    ),
  ]
  let unrelated: Array<{ type: string; count: number }> = []
  const taken: Taken = new Map()
  if (client) {
    try {
      const rows: unknown = await client.fetch(
        `*[!(_id in path("_.**")) && !(_type match "sanity.*") && !(_id match "imported-*") && !(_id match "drafts.imported-*") && !(_type in ["siteSettings", "submission"])]{_type, "slug": slug.current}`,
      )
      const byType = new Map<string, number>()
      for (const r of list(rows)) {
        const t = str(rec(r)._type) ?? '?'
        byType.set(t, (byType.get(t) ?? 0) + 1)
        const slug = str(rec(r).slug)
        if (slug && types.includes(t))
          taken.set(t, new Set([...(taken.get(t) ?? []), slug]))
      }
      unrelated = [...byType]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count)
    } catch (e) {
      log(
        `could not read the dataset: ${e instanceof Error ? e.message : String(e)}`,
      )
    }
  }
  const unrelatedTotal = unrelated.reduce((a, x) => a + x.count, 0)
  say(
    `dataset ${projectId ?? '(no project id)'}/${dataset}: ${unrelatedTotal ? `${countLabel(unrelatedTotal, 'document')} the importer did not write (${unrelated.map((u) => `${u.type}: ${u.count}`).join(', ')})` : 'no other documents'}`,
  )

  // Everything below maps each item again from the store (deterministic), so memory stays flat.
  const assets = new Map(Object.entries(state.assets))
  let mappable = 0
  let conflicts = 0
  const pairs: Array<Redirect> = []
  const samples: Array<string> = []
  for await (const it of store.each()) {
    const t = targetOf(typeOf(it))
    if (!t) continue
    mappable++
    const m = mapItem(it, t, { importedAt, taken, assets })
    if (String(m.doc.sourceMeta).includes('"slugWasTaken"')) conflicts++
    pairs.push({ from: m.from, to: m.to })
    if (samples.length < 5)
      samples.push(
        `  ${m.doc._type.padEnd(10)} ${m.from} → ${m.to}  "${it.title.slice(0, 60)}"  ${m.images.length} image(s)`,
      )
  }
  const redirectsPreview = redirectMap(pairs)
  say(
    `${countLabel(mappable, 'document')} to write${conflicts ? `, ${conflicts} with a slug already taken (suffixed -imported)` : ''}; ${countLabel(redirectsPreview.length, 'redirect')}`,
  )
  if (samples.length) say(['examples:', ...samples].join('\n'))

  const summary = (extra: Rec) => ({
    import: {
      dryRun: o.dryRun,
      source: {
        kind: source.kind,
        label: source.label,
        ...(source.url && { url: source.url }),
        ...(source.file && { file: source.file }),
      },
      counts: state.counts,
      mapping: mapping.map((m) => ({
        ...m,
        fields: m.target && m.how !== 'folded' ? fieldsFor(m, targets) : [],
      })),
      unrelated: unrelatedTotal,
      unrelatedByType: unrelated,
      conflicts,
      mappable,
      redirects: redirectsPreview.length,
      ...extra,
    },
  })
  if (o.dryRun) {
    say('dry run: nothing written')
    if (o.json) say(JSON.stringify(summary({ documents: 0, complete: false })))
    return summary({})
  }

  // ▶ write
  step('write')
  if (!client) throw new Error('VITE_SANITY_PROJECT_ID is not set (.env)')
  if (!process.env.SANITY_WRITE_TOKEN)
    throw new Error('SANITY_WRITE_TOKEN is not set (.env); a build writes it')
  if (unrelatedTotal && !o.confirm && !state.done.length)
    throw new ConfirmError(
      `the dataset already has ${countLabel(unrelatedTotal, 'document')} the importer did not write; pass --confirm to import alongside them (nothing is deleted or replaced)`,
    )
  const done = new Set(state.done)
  let batch: Array<Rec & { _id: string; _type: string }> = []
  const flush = async () => {
    if (!batch.length) return
    const tx = client.transaction()
    for (const d of batch) tx.createOrReplace(d)
    await tx.commit({ visibility: 'async' })
    for (const d of batch) done.add(d._id)
    state.done = [...done]
    batch = []
    await save()
    say(`importing ${formatCount(done.size)} / ${formatCount(mappable)}`)
  }
  for await (const it of store.each()) {
    const t = targetOf(typeOf(it))
    if (!t) continue
    const m = mapItem(it, t, { importedAt, taken, assets })
    if (done.has(m.doc._id) || batch.some((d) => d._id === m.doc._id)) continue
    batch.push(m.doc)
    if (batch.length >= BATCH) await flush()
  }
  await flush()

  // ▶ assets
  step('assets')
  const patched = new Set(state.patched)
  let slotsTotal = 0
  for await (const it of store.each()) {
    const t = targetOf(typeOf(it))
    if (t) slotsTotal += mapItem(it, t, { importedAt, taken }).images.length
  }
  say(`${countLabel(slotsTotal, 'image')} referenced`)
  let seen = 0
  let lastReport = 0
  let patches: Array<{ id: string; set: Rec }> = []
  const flushPatches = async () => {
    if (!patches.length) return
    const tx = client.transaction()
    for (const p of patches) tx.patch(p.id, (x) => x.set(p.set))
    await tx.commit({ visibility: 'async' })
    for (const p of patches) patched.add(p.id)
    state.patched = [...patched]
    patches = []
    await save()
  }
  for await (const it of store.each()) {
    const t = targetOf(typeOf(it))
    if (!t) continue
    const m = mapItem(it, t, { importedAt, taken })
    if (patched.has(m.doc._id)) {
      seen += m.images.length
      continue
    }
    const set: Rec = {}
    for (const slot of m.images) {
      seen++
      const ref = await ensureAsset(client, get, slot.url, state)
      if (ref) set[slot.path] = { _type: 'reference', _ref: ref }
      if (seen - lastReport >= PER_PAGE) {
        say(`images ${formatCount(seen)} / ${formatCount(slotsTotal)}`)
        lastReport = seen
        await save()
      }
    }
    if (Object.keys(set).length) patches.push({ id: m.doc._id, set })
    else patched.add(m.doc._id)
    if (patches.length >= BATCH) await flushPatches()
  }
  await flushPatches()
  const failed = Object.keys(state.failedImages).length
  say(
    `images ${formatCount(seen)} / ${formatCount(slotsTotal)}: ${countLabel(Object.keys(state.assets).length, 'asset')}${failed ? `, ${failed} could not be fetched` : ''}`,
  )
  for (const [url, why] of Object.entries(state.failedImages).slice(0, 10))
    say(`  ${url} (${why})`)

  // ▶ redirects
  step('redirects')
  const redirectsFile = 'design/redirects.json'
  const existing: Array<Redirect> = existsSync(redirectsFile)
    ? list(JSON.parse(readFileSync(redirectsFile, 'utf8'))).flatMap((r) => {
        const from = str(rec(r).from)
        const to = str(rec(r).to)
        return from && to ? [{ from, to }] : []
      })
    : []
  const redirects = redirectMap(pairs, existing)
  await mkdir('design', { recursive: true })
  await writeFile(redirectsFile, JSON.stringify(redirects, null, 2) + '\n')
  say(`${redirectsFile}: ${countLabel(redirects.length, 'redirect')}`)
  state.redirects = redirects.length
  state.complete = true
  await save()

  const documents = done.size
  say(
    `✔ imported ${countLabel(documents, 'document')} from ${source.url ? new URL(source.url).host : (source.file ?? '')} into ${projectId}/${dataset}`,
  )
  const out = summary({
    documents,
    images: Object.keys(state.assets).length,
    imageFailures: failed,
    redirects: redirects.length,
    complete: true,
  })
  if (o.json) say(JSON.stringify(out))
  return out
}

export class ConfirmError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfirmError'
  }
}

/* `max` items spread over types: small types take all they have, the rest share what is left. */
export function shareOut(
  totals: Array<number>,
  max: number | undefined,
): Array<number> {
  if (!max) return [...totals]
  const out = totals.map(() => 0)
  let left = max
  let open = totals.map((_, i) => i).filter((i) => (totals[i] ?? 0) > 0)
  while (left > 0 && open.length) {
    const each = Math.max(1, Math.floor(left / open.length))
    for (const i of open) {
      const room = (totals[i] ?? 0) - (out[i] ?? 0)
      const take = Math.min(each, room, left)
      out[i] = (out[i] ?? 0) + take
      left -= take
    }
    open = open.filter((i) => (out[i] ?? 0) < (totals[i] ?? 0))
  }
  return out
}

function fieldsFor(
  m: TypeMapping,
  targets: Array<TargetType>,
): Array<[string, string]> {
  const t = targets.find((x) => x.name === m.target)
  return t ? fieldLines(fieldPlan(t)) : []
}

function inventoryLine(source: Source, counts: Record<string, number>): string {
  const parts: Array<string> = []
  for (const [k, v] of Object.entries(counts)) {
    if (k === 'images') continue
    if (FOLDED.has(k)) continue
    parts.push(
      countLabel(
        v,
        k === 'pages' || k === 'page'
          ? 'page'
          : k === 'post'
            ? 'post'
            : `${k} item`,
      ),
    )
  }
  if (counts.images !== undefined)
    parts.push(countLabel(counts.images, 'image'))
  for (const k of ['category', 'tag', 'author'])
    if (counts[k] !== undefined)
      parts.push(
        countLabel(
          counts[k] ?? 0,
          k === 'category' ? 'category' : k,
          k === 'category' ? 'categories' : `${k}s`,
        ),
      )
  return `${source.label}, ${parts.join(', ') || 'nothing'}`
}

/* An image as a Sanity asset: once per URL (state), once per content (sha1 = Sanity's own
   `sha1hash`, so a second copy of the same file is found, not uploaded again). */
async function ensureAsset(
  client: SanityClient,
  get: Get,
  url: string,
  state: State,
): Promise<string | undefined> {
  const known = state.assets[url]
  if (known) return known
  if (state.failedImages[url]) return undefined
  let bytes: Uint8Array | undefined
  let why = 'not found'
  let type = ''
  for (const candidate of originalImageUrls(url)) {
    try {
      const r = await fetchVia(
        get,
        candidate,
        'image',
        'image/*',
        async (res) => {
          type = res.headers.get('content-type') ?? ''
          return readCapped(res, MAX_IMAGE_BYTES)
        },
      )
      if (r.status >= 400) {
        why = `HTTP ${r.status}`
        continue
      }
      if (!/^image\//i.test(type)) {
        why = `not an image (${type || 'no type'})`
        continue
      }
      if (!r.value) {
        why = 'larger than 25 MB'
        continue
      }
      bytes = r.value
      break
    } catch (e) {
      why =
        e instanceof Error ? (e.message.split('\n')[0] ?? e.name) : String(e)
    }
  }
  if (!bytes) {
    state.failedImages[url] = why
    return undefined
  }
  const hash = sha1(bytes)
  const existing: unknown = await client.fetch(
    `*[_type == "sanity.imageAsset" && sha1hash == $hash][0]._id`,
    { hash },
  )
  const id =
    str(existing) ??
    (
      await client.assets.upload('image', Buffer.from(bytes), {
        filename: decodeURIComponent(
          new URL(url).pathname.split('/').pop() ?? 'image',
        ),
        label: hash,
        source: { name: 'kiln-import', id: hash, url },
      })
    )._id
  state.assets[url] = id
  return id
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    await runImport(parseArgs(process.argv.slice(2)))
  } catch (e) {
    console.log(`✖ ${e instanceof Error ? e.message : String(e)}`)
    process.exit(e instanceof ConfirmError ? 2 : 1)
  }
}
