import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import type { Browser } from 'playwright'
import {
  classifyUrl,
  detectCollections,
  htmlLinks,
  parseRobots,
  parseSitemap,
  robotsAllows,
  segment,
  snapshotDom,
} from './website-lib.ts'
import type { CrawledPage, WebSection } from './website-lib.ts'

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
