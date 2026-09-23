import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import type { Browser } from 'playwright'
import {
  classifyUrl,
  detectCollections,
  groupPages,
  htmlLinks,
  parseRobots,
  parseSitemap,
  retryAfterMs,
  robotsAllows,
  Scheduler,
  segment,
  SITE_DOWN,
  SiteDownError,
  snapshotDom,
} from './website-lib.ts'
import type { CrawledPage, Politeness, WebSection } from './website-lib.ts'
import { inspectSite, parseArgs, USER_AGENT } from './website.ts'
import type { Get } from './website.ts'

const origin = 'https://example.com'
const why = (href: string) => {
  const v = classifyUrl(href, `${origin}/start`, origin)
  return v.ok ? v.url : v.why
}

// ---- URL filtering ----

void test('classifyUrl canonicalises same-origin pages', () => {
  assert.equal(why('/about/'), 'https://example.com/about')
  assert.equal(why('about#team'), 'https://example.com/about')
  assert.equal(why('/work//film/index.html'), 'https://example.com/work/film')
  assert.equal(why('https://example.com'), 'https://example.com/')
})

void test('classifyUrl never follows another origin', () => {
  assert.equal(why('https://instagram.com/studio'), 'off-origin')
  assert.equal(why('http://example.com/about'), 'off-origin') // scheme is part of the origin
  assert.equal(why('https://shop.example.com/'), 'off-origin')
})

void test('classifyUrl skips mailto, tel, non-HTML, query variants, pagination and logins', () => {
  assert.equal(why('mailto:hi@example.com'), 'mailto')
  assert.equal(why('tel:+15551234'), 'tel')
  assert.equal(why('javascript:void(0)'), 'not http')
  assert.equal(why('/cv.pdf'), 'not HTML')
  assert.equal(why('/images/a.JPG'), 'not HTML')
  assert.equal(why('/work?tag=paint'), 'query variant')
  assert.equal(why('/news/page/2'), 'pagination')
  assert.equal(why('/news?page=3'), 'pagination')
  assert.equal(why('/news/page/1'), 'https://example.com/news/page/1')
  assert.equal(why('/login'), 'login page')
  assert.equal(why('/account/orders'), 'login page')
  assert.equal(why('/cdn-cgi/l/email-protection'), 'not a page')
})

void test('robots.txt: longest rule wins, Allow wins ties, our own group beats *', () => {
  const r = parseRobots(
    'User-agent: *\nDisallow: /private\nAllow: /private/press\nDisallow: /*.php$\n\nSitemap: https://example.com/sm.xml\n',
  )
  assert.equal(robotsAllows(r, '/'), true)
  assert.equal(robotsAllows(r, '/private/x'), false)
  assert.equal(robotsAllows(r, '/private/press/2024'), true)
  assert.equal(robotsAllows(r, '/index.php'), false)
  assert.equal(robotsAllows(r, '/index.php/about'), true)
  assert.deepEqual(r.sitemaps, ['https://example.com/sm.xml'])
  const all = parseRobots('User-agent: *\nDisallow: /\n')
  assert.equal(robotsAllows(all, '/about'), false)
  const own = parseRobots(
    'User-agent: Kiln\nAllow: /\n\nUser-agent: *\nDisallow: /\n',
  )
  assert.equal(robotsAllows(own, '/about'), true)
  assert.equal(
    robotsAllows(parseRobots('User-agent: *\nDisallow:\n'), '/x'),
    true,
  )
})

void test('sitemap: urlset gives pages, sitemapindex gives sitemaps', () => {
  assert.deepEqual(
    parseSitemap(
      '<urlset><url><loc> https://example.com/a?x=1&amp;y=2 </loc></url></urlset>',
    ).urls,
    ['https://example.com/a?x=1&y=2'],
  )
  assert.deepEqual(
    parseSitemap(
      '<sitemapindex><sitemap><loc>https://example.com/s1.xml</loc></sitemap></sitemapindex>',
    ),
    { urls: [], sitemaps: ['https://example.com/s1.xml'] },
  )
})

void test('htmlLinks marks header/nav/footer links as nav and ignores script text', () => {
  const links = htmlLinks(
    '<header><a href="/work">Work</a></header><script>x={href:"/nope"}</script><main><a class="c" href=\'/work/a\'>A</a></main><footer><a href=/contact>C</a></footer>',
  )
  assert.deepEqual(links, [
    { href: '/work', zone: 'nav' },
    { href: '/work/a', zone: 'main' },
    { href: '/contact', zone: 'nav' },
  ])
})

// ---- segmentation on fixture HTML (a real browser lays the page out) ----

let browser: Browser
before(async () => {
  browser = await chromium.launch()
})
after(async () => {
  await browser.close()
})

const IMG =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22/%3E'
const card = (s: string) =>
  `<a class="card" href="/work/${s}" style="display:block;height:200px"><img src="${IMG}" alt="${s}" style="width:100px;height:100px"><h3>${s}</h3></a>`

async function sectionsOf(html: string) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  // Served from a real origin (no network) so links resolve to absolute URLs as on a live site.
  await page.route('**/*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<!doctype html><html><head><title>T</title></head><body style="margin:0">${html}</body></html>`,
    }),
  )
  await page.goto(`${origin}/`)
  const snap = await page.evaluate(snapshotDom)
  await page.close()
  return segment(snap, 'home')
}
const types = (s: Array<WebSection>) => s.map((x) => x.type)

void test('segment: header, hero, heading + card grid, named block, footer', async () => {
  const { kind, sections } = await sectionsOf(`
    <header style="height:80px"><a href="/">Studio</a><nav><a href="/work">Work</a>, <a href="/about">About</a></nav></header>
    <main>
      <section style="height:600px"><h1>Paintings about surfaces</h1><p>An introduction long enough to count as a paragraph of real body text for the page.</p><img src="${IMG}" alt="Hero" style="width:400px;height:300px"></section>
      <div style="height:40px"><h2>Selected work</h2></div>
      <div class="grid gap-4" style="display:grid;grid-template-columns:repeat(4,1fr)">${['a', 'b', 'c', 'd'].map(card).join('')}</div>
      <div id="about" style="height:300px"><p>About the studio.</p></div>
    </main>
    <footer style="height:120px"><p>© 2026 Studio</p></footer>`)
  assert.equal(kind, 'page')
  assert.deepEqual(types(sections), [
    'Header',
    'Hero',
    'CardGrid',
    'About',
    'Footer',
  ])
  const [header, hero, grid] = sections
  assert.ok(header && hero && grid)
  assert.equal(header.text.wordmark, 'Studio')
  assert.deepEqual(
    header.content.links.map((l) => l.text),
    ['Studio', 'Work', 'About'],
  )
  assert.equal(header.text.label, undefined) // the ", " between links is not text
  assert.deepEqual(hero.content.headings, [
    { level: 1, text: 'Paintings about surfaces' },
  ])
  assert.equal(hero.images[0]?.alt, 'Hero')
  assert.equal(grid.name, 'Selected work')
  assert.equal(grid.repeat?.count, 4)
  assert.deepEqual(grid.repeat.items[0], {
    title: 'a',
    href: 'https://example.com/work/a',
    image: IMG,
  })
  assert.deepEqual(grid.text, { heading: 'Selected work' }) // items live in repeat, not text
})

void test('segment: no <main>, side-by-side columns stay one Screen, a viewer nav is not chrome', async () => {
  const { kind, sections } = await sectionsOf(`
    <div id="app">
      <header style="height:60px"><a href="/">Studio</a></header>
      <div style="display:grid;grid-template-columns:1fr 1fr;height:900px">
        <div><ul>${['a', 'b', 'c'].map((s) => `<li class="t">${card(s)}</li>`).join('')}</ul></div>
        <div style="position:relative"><img src="${IMG}" alt="Film" style="width:600px;height:700px"><p>Film, 2019. Oil on canvas. 61 x 45.7 cm</p>
          <nav aria-label="Images" style="width:120px"><span>1/1</span><a href="/work/b">→</a></nav></div>
      </div>
    </div>`)
  assert.equal(kind, 'screen')
  assert.deepEqual(types(sections), ['Header', 'Screen'])
  const screen = sections[1]
  assert.ok(screen)
  assert.equal(screen.repeat?.count, 3)
  assert.ok(
    screen.content.paragraphs.includes(
      'Film, 2019. Oil on canvas. 61 x 45.7 cm',
    ),
  )
  assert.ok((screen.regions?.length ?? 0) >= 1)
})

void test('segment: a tall generic wrapper of stacked blocks is split into sections', async () => {
  const { sections } = await sectionsOf(`
    <main><div class="wrapper">
      <div style="height:700px"><h2>One</h2></div>
      <div style="height:700px"><h2>Two</h2></div>
      <div style="height:700px"><h2>Three</h2></div>
    </div></main>`)
  assert.deepEqual(
    sections.map((s) => s.name),
    ['One', 'Two', 'Three'],
  )
})

// ---- collection detection ----

const section = (type: string, over: Partial<WebSection> = {}): WebSection => ({
  id: type,
  name: type,
  type,
  size: [1440, 900],
  box: [0, 0, 1440, 900],
  text: {},
  content: { headings: [], paragraphs: [], links: [], buttons: [] },
  images: [],
  embeds: [],
  ...over,
})
const detail = (slug: string, caption?: string): CrawledPage => ({
  path: `/work/${slug}`,
  title: `${slug} · Studio`,
  sections: [
    section('Header'),
    section('Screen', {
      content: {
        headings: [],
        paragraphs: caption ? [caption] : [],
        links: [],
        buttons: [],
      },
      images: [
        {
          src: `https://cdn/${slug}.jpg`,
          alt: slug,
          box: [0, 0, 600, 800],
          file: `design/assets/${slug}.jpg`,
        },
      ],
    }),
  ],
  contentLinks: [],
})
const list = (path: string, links: Array<string>): CrawledPage => ({
  path,
  title: 'Work · Studio',
  sections: [
    section('Header'),
    section('CardGrid', { repeat: { count: links.length, items: [] } }),
  ],
  contentLinks: links,
})

void test('detectCollections: ≥ 3 same-template siblings linked from one list page are one collection', () => {
  const pages = [
    list('/', []),
    list('/work', ['/work/film', '/work/sea-script', '/work/untitled-01']),
    detail('film', 'Film, 2019. Oil, grease pencil. 61 x 45.7 cm'),
    detail('sea-script'),
    detail('untitled-01'),
    { ...list('/about', []), sections: [section('Header'), section('About')] },
  ]
  const { collections, members } = detectCollections(pages, origin, 'Studio')
  assert.equal(collections.length, 1)
  const c = collections[0]
  assert.ok(c)
  assert.equal(c.name, 'work')
  assert.equal(c.listRoute, '/work')
  assert.equal(c.detailRouteShape, '/work/:slug')
  assert.deepEqual([...members].sort(), [
    '/work/film',
    '/work/sea-script',
    '/work/untitled-01',
  ])
  assert.deepEqual(c.instances[0], {
    url: 'https://example.com/work/film',
    path: '/work/film',
    slug: 'film',
    title: 'film',
    fields: {
      title: 'film',
      images: ['design/assets/film.jpg'],
      caption: 'Film, 2019. Oil, grease pencil. 61 x 45.7 cm',
      year: 2019,
      dimensions: '61 x 45.7 cm',
    },
  })
  assert.deepEqual(
    c.fields.map((f) => `${f.name}:${f.type}:${f.coverage}`),
    [
      'title:string:3/3',
      'images:image[]:3/3',
      'caption:string:1/3',
      'year:number:1/3',
      'dimensions:string:1/3',
    ],
  )
})

void test('detectCollections: two siblings, or siblings no list page links to, stay routes', () => {
  const two = [list('/work', ['/work/a', '/work/b']), detail('a'), detail('b')]
  assert.equal(detectCollections(two, origin).collections.length, 0)
  const unlinked = [
    list('/work', ['/work/a']),
    detail('a'),
    detail('b'),
    detail('c'),
  ]
  assert.equal(detectCollections(unlinked, origin).collections.length, 0)
})

void test('detectCollections: pages with a different template do not join the collection', () => {
  const odd: CrawledPage = {
    ...detail('essay'),
    sections: [section('Header'), section('Hero'), section('Content')],
  }
  const pages = [
    list('/work', ['/work/a', '/work/b', '/work/c', '/work/essay']),
    detail('a'),
    detail('b'),
    detail('c'),
    odd,
  ]
  const { collections, members } = detectCollections(pages, origin)
  assert.equal(collections[0]?.instances.length, 3)
  assert.equal(members.has('/work/essay'), false)
})

void test('detectCollections: unfetched siblings from the inventory count as list links and are listed', () => {
  const pages = [
    list('/work', ['/work/a', '/work/b', '/work/x', '/work/y']),
    detail('a'),
    detail('b'),
    detail('c'),
  ]
  const inventory = [
    '/work',
    '/work/a',
    '/work/b',
    '/work/c',
    '/work/x',
    '/work/y',
    '/about',
  ]
  const { collections } = detectCollections(pages, origin, undefined, inventory)
  const c = collections[0]
  assert.ok(c)
  assert.equal(c.instances.length, 3)
  assert.equal(c.found, 5)
  assert.deepEqual(c.notFetched, ['/work/x', '/work/y'])
})

// ---- politeness: scheduler and staged inspect against a fake server ----

/* Timings scaled down so the suite stays fast; the shape of the behaviour is what is tested. */
const FAST: Politeness = {
  concurrency: 2,
  minGapMs: 25,
  timeoutMs: 120,
  retryDelayMs: 10,
  slowAfter: 2,
  cooldownMs: 60,
  abortAfter: 8,
  maxRetryAfterMs: 5000,
}
const html = (body: string, title = 'Page') =>
  new Response(
    `<!doctype html><html><head><title>${title} | Heyday</title></head><body>${body}</body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
const wait = (ms: number) =>
  new Promise<void>((r) => {
    setTimeout(r, ms)
  })
const hang = (signal: AbortSignal) =>
  new Promise<Response>((_, reject) => {
    signal.addEventListener('abort', () => {
      reject(
        new DOMException(
          'The operation was aborted due to timeout',
          'TimeoutError',
        ),
      )
    })
  })

/* A fake server: `handle` answers by path; every request is logged with its start time and the
   number of requests in flight when it started. */
function fakeSite(
  handle: (path: string, signal: AbortSignal) => Promise<Response> | Response,
) {
  const calls: Array<{ path: string; at: number; inFlight: number }> = []
  let inFlight = 0
  const get: Get = async (url, { signal }) => {
    inFlight++
    calls.push({ path: new URL(url).pathname, at: Date.now(), inFlight })
    try {
      return await handle(new URL(url).pathname, signal)
    } finally {
      inFlight--
    }
  }
  return { get, calls }
}
const pageCalls = (calls: Array<{ path: string }>) =>
  calls.filter((c) => !/\.(txt|xml|css)$/.test(c.path))
const gaps = (calls: Array<{ at: number }>) =>
  calls.slice(1).map((c, i) => c.at - (calls[i]?.at ?? 0))
const opts = (...extra: Array<string>) =>
  parseArgs(['--from-url', `${origin}/`, '--json', ...extra])

/* A small business site: 5 nav pages, 380 service pages, 12 projects, 40 service areas. */
const range = <T>(n: number, f: (i: number) => T): Array<T> =>
  Array.from({ length: n }, (_, i) => f(i))
const NAV = ['/services', '/projects', '/service-area', '/about', '/contact']
const SITEMAP = [
  ...NAV,
  ...range(380, (i) => `/services/s${i}`),
  ...range(12, (i) => `/projects/p${i}`),
  ...range(40, (i) => `/service-area/a${i}`),
]
const smallBusiness = (
  page: (path: string, signal: AbortSignal) => Promise<Response> | Response,
) =>
  fakeSite((path, signal) => {
    if (path === '/robots.txt') return new Response('User-agent: *\nAllow: /\n')
    if (path === '/sitemap.xml')
      return new Response(
        `<urlset>${SITEMAP.map((p) => `<url><loc>${origin}${p}</loc></url>`).join('')}</urlset>`,
      )
    return page(path, signal)
  })
const homeHtml = () =>
  html(
    `<header><nav>${NAV.map((p) => `<a href="${p}">${p}</a>`).join('')}</nav></header>` +
      `<main><a href="/services/s1">One</a><a href="/services/s2">Two</a><a href="mailto:hi@x.com">Mail</a><a href="/services?x=1">Q</a><a href="/wp-content/uploads/a.webp">Photo</a></main>` +
      `<footer><a href="/contact">Contact</a></footer>`,
    'Home',
  )

void test('parseArgs: concurrency defaults to 2 and is capped at 4; the crawler says who it is', () => {
  assert.equal(opts().concurrency, 2)
  assert.equal(opts('--concurrency', '9').concurrency, 4)
  assert.equal(opts('--concurrency', '1').concurrency, 1)
  assert.match(
    USER_AGENT,
    /^Kiln\/0\.1 \(\+https:\/\/github\.com\/kennerluoma\/agency-platform; site recreation for the site owner\)$/,
  )
})

void test('retryAfterMs reads seconds and HTTP dates', () => {
  assert.equal(retryAfterMs('3', 0), 3000)
  assert.equal(retryAfterMs(new Date(10_000).toUTCString(), 4000), 6000)
  assert.equal(retryAfterMs(null, 0), undefined)
  assert.equal(retryAfterMs('soon', 0), undefined)
})

void test('groupPages: first path segment when shared, top-level pages together', () => {
  assert.deepEqual(
    groupPages(
      ['/', '/about', '/services', '/services/a', '/services/b', '/blog/x'],
      ['/', '/services/a'],
    ),
    [
      { prefix: '/', count: 3, sampled: 1 },
      { prefix: '/services', count: 3, sampled: 1 },
    ],
  )
})

void test('staged inspect: inventories every page, samples at most --max-pages, 2 at a time, spaced', async () => {
  const site = smallBusiness(async (path) => {
    await wait(15)
    return path === '/'
      ? homeHtml()
      : html(`<main><h1>${path}</h1></main>`, path)
  })
  const r = await inspectSite(opts('--max-pages', '10'), {
    get: site.get,
    polite: FAST,
  })
  assert.equal(r.aborted, undefined)
  assert.equal(r.pages.length, 10)
  assert.equal(r.found, 1 + SITEMAP.length)
  assert.equal(r.notFetched, r.found - 10)
  assert.deepEqual(r.skipped, []) // nothing "over budget", no mailto / query-variant / image-link noise
  const pagesHit = pageCalls(site.calls)
  assert.equal(pagesHit.length, 10) // not one request more than the pages it reads
  // Stage A: robots.txt and the sitemap, then the start page alone; the rest only after it.
  assert.deepEqual(
    site.calls.slice(0, 3).map((c) => c.path),
    ['/robots.txt', '/sitemap.xml', '/'],
  )
  assert.equal(site.calls[3]?.inFlight, 1)
  // Nav links first, then one representative per group.
  const order = pagesHit.map((c) => c.path)
  assert.deepEqual(new Set(order.slice(1, 6)), new Set(NAV))
  assert.ok(order.some((p) => p.startsWith('/projects/')))
  assert.ok(order.some((p) => p.startsWith('/service-area/')))
  assert.ok(Math.max(...site.calls.map((c) => c.inFlight)) <= 2)
  assert.ok(Math.min(...gaps(site.calls)) >= FAST.minGapMs - 2)
  assert.deepEqual(
    r.groups.map((g) => [g.prefix, g.count]),
    [
      ['/services', 381],
      ['/service-area', 41],
      ['/projects', 13],
      ['/', 3],
    ],
  )
  assert.equal(
    r.groups.reduce((n, g) => n + g.sampled, 0),
    10,
  )
})

void test('overloaded site: slows to one request, then gives up after 8 failures in a row', async () => {
  // The hireheyday case: the start page answers, then the server stops answering.
  const site = smallBusiness((path, signal) =>
    path === '/' ? homeHtml() : hang(signal),
  )
  const r = await inspectSite(opts('--max-pages', '30'), {
    get: site.get,
    polite: FAST,
  })
  assert.ok(r.aborted?.startsWith(SITE_DOWN))
  const hits = pageCalls(site.calls)
  // 1 good page + 8 failed attempts (4 pages, each tried twice); one more may already be in flight.
  assert.ok(hits.length <= 10, `${hits.length} page requests`)
  assert.ok(r.skipped.every((x) => /timed out/.test(x.why)))
})

void test('budget: pages that fail without overloading the server stop at max × 2 attempts', async () => {
  const site = smallBusiness((path) =>
    path === '/' ? homeHtml() : new Response('gone', { status: 404 }),
  )
  const r = await inspectSite(opts('--max-pages', '3'), {
    get: site.get,
    polite: FAST,
  })
  assert.equal(r.aborted, undefined)
  assert.equal(r.pages.length, 1)
  assert.equal(pageCalls(site.calls).length, 6)
  assert.ok(r.skipped.every((x) => x.why === 'HTTP 404'))
  assert.equal(r.notFetched, r.found - 6)
})

void test('scheduler: one retry for 503, honouring Retry-After; a 404 is an answer, not a failure', async () => {
  const s = new Scheduler(FAST)
  const starts: Array<number> = []
  let n = 0
  const r = await s.run('page', async () => {
    starts.push(Date.now())
    return n++ === 0
      ? { status: 503, retryAfter: '1', value: 'busy' }
      : { status: 200, retryAfter: null, value: 'ok' }
  })
  assert.equal(r.value, 'ok')
  assert.equal(starts.length, 2)
  assert.ok((starts[1] ?? 0) - (starts[0] ?? 0) >= 990)
  let calls = 0
  const nf = await s.run('page', async () => {
    calls++
    return { status: 404, retryAfter: null, value: 'nf' }
  })
  assert.equal(nf.status, 404)
  assert.equal(calls, 1)
  assert.equal(s.concurrency, 2)
})

void test('scheduler: resets drop concurrency to 1 after 2 failures; 8 in a row abort everything', async () => {
  const s = new Scheduler(FAST, { page: 100 })
  const seen: Array<{ inFlight: number; failuresBefore: number }> = []
  let inFlight = 0
  let failures = 0
  const reset = () =>
    new TypeError('fetch failed', {
      cause: Object.assign(new Error('read ECONNRESET'), {
        code: 'ECONNRESET',
      }),
    })
  const results = await Promise.allSettled(
    range(12, () =>
      s.run('page', async () => {
        inFlight++
        seen.push({ inFlight, failuresBefore: failures })
        await wait(5)
        inFlight--
        failures++
        throw reset()
      }),
    ),
  )
  assert.equal(s.attempts, 8)
  assert.ok(s.down?.startsWith(SITE_DOWN))
  assert.ok(
    seen.filter((x) => x.failuresBefore >= 2).every((x) => x.inFlight === 1),
  )
  assert.ok(
    results.some(
      (x) => x.status === 'rejected' && x.reason instanceof SiteDownError,
    ),
  )
  await assert.rejects(
    s.run('page', async () => ({ status: 200, retryAfter: null, value: 1 })),
    SiteDownError,
  )
})
