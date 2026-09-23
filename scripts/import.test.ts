import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalUrl,
  fieldPlan,
  groupType,
  htmlToPortableText,
  ID_PREFIX,
  importId,
  mapItem,
  originalImageUrls,
  pageContent,
  pageItem,
  parseCsvExport,
  parseHtml,
  parseJsonExport,
  parseWxr,
  pathBelow,
  ptText,
  redirectMap,
  resolveTypes,
  routeFor,
  serialize,
  sha1,
  targetTypes,
  textOf,
  wpContentTypes,
  wpItem,
  wpUrl,
} from './import-lib.ts'
import type { Block, Item, PtNode, TargetType } from './import-lib.ts'

const blockOf = (nodes: Array<PtNode>, i: number): Block => {
  const b = nodes[i]
  assert.ok(b && b._type === 'block', `node ${i} is a block`)
  return b
}

// ---- HTML parsing ----

void test('parseHtml closes <p> and <li> implicitly, drops scripts, decodes entities', () => {
  const t = parseHtml(
    '<p>one<p>two &amp; &rsquo;three&#8217; &#x2014;<ul><li>a<li>b</ul><script>x<1</script>',
  )
  assert.equal(textOf(t), 'onetwo & ’three’ —ab')
  const kids = t.children.filter((c) => typeof c !== 'string')
  assert.deepEqual(
    kids.map((k) => (typeof k === 'string' ? k : k.tag)),
    ['p', 'p', 'ul'],
  )
})

// ---- Portable Text ----

void test('htmlToPortableText: headings, paragraphs, marks, links, lists, quotes', () => {
  const { blocks } = htmlToPortableText(
    `<h2>Title</h2>
     <p>Some <strong>bold</strong> and <em>italic <a href="/about">link</a></em> text.</p>
     <ul><li>one</li><li>two<ul><li>nested</li></ul></li></ul>
     <ol><li>first</li></ol>
     <blockquote><p>Quoted.</p></blockquote>
     <p>   </p>`,
    { base: 'https://old.example.com/news/post/' },
  )
  assert.equal(
    ptText(blocks),
    'Title\nSome bold and italic link text.\none\ntwo\nnested\nfirst\nQuoted.',
  )
  assert.equal(blockOf(blocks, 0).style, 'h2')
  const p = blockOf(blocks, 1)
  assert.deepEqual(
    p.children.map((s) => [s.text, s.marks.length]),
    [
      ['Some ', 0],
      ['bold', 1],
      [' and ', 0],
      ['italic ', 1],
      ['link', 2],
      [' text.', 0],
    ],
  )
  assert.equal(p.markDefs.length, 1)
  assert.equal(p.markDefs[0]?.href, '/about') // same-site link becomes a path
  assert.deepEqual(
    [2, 3, 4, 5].map((i) => [
      blockOf(blocks, i).listItem,
      blockOf(blocks, i).level,
    ]),
    [
      ['bullet', 1],
      ['bullet', 1],
      ['bullet', 2],
      ['number', 1],
    ],
  )
  assert.equal(blockOf(blocks, 6).style, 'blockquote')
  // Keys are deterministic: the same HTML gives the same document.
  const again = htmlToPortableText('<h2>Title</h2>', {
    base: 'https://old.example.com/',
  })
  assert.equal(again.blocks[0]?._key, blocks[0]?._key)
})

void test('htmlToPortableText: figures keep captions, inline images split a paragraph, embeds', () => {
  const { blocks, images, embeds } = htmlToPortableText(
    `<figure class="wp-block-image"><a href="/big.jpg"><img src="/a-300x200.jpg" srcset="/a-300x200.jpg 300w, /a-1024x683.jpg 1024w" alt="A"></a><figcaption>The <em>caption</em></figcaption></figure>
     <p>Before <img src="https://cdn.example.com/b.png" alt=""> after <a href="https://elsewhere.org/x">out</a></p>
     <figure class="wp-block-embed is-type-video"><div class="wp-block-embed__wrapper">
       https://www.youtube.com/watch?v=abc
     </div></figure>
     <iframe src="https://player.vimeo.com/video/1"></iframe>`,
    { base: 'https://old.example.com/p/' },
  )
  assert.deepEqual(
    blocks.map((b) => b._type),
    ['imageWithAlt', 'block', 'imageWithAlt', 'block', 'embed', 'embed'],
  )
  const fig = blocks[0]
  assert.ok(fig && fig._type === 'imageWithAlt')
  assert.equal(fig.alt, 'A')
  assert.equal(fig.caption?.[0]?.children[0]?.text, 'The caption')
  assert.equal(images[0]?.url, 'https://old.example.com/a-1024x683.jpg') // widest srcset candidate
  assert.equal(images[1]?.url, 'https://cdn.example.com/b.png')
  assert.equal(blockOf(blocks, 1).children[0]?.text, 'Before')
  const after = blockOf(blocks, 3)
  assert.equal(ptText([after]), 'after out')
  assert.equal(after.markDefs[0]?.href, 'https://elsewhere.org/x')
  assert.deepEqual(embeds, [
    'https://www.youtube.com/watch?v=abc',
    'https://player.vimeo.com/video/1',
  ])
})

void test('htmlToPortableText never keeps javascript: links', () => {
  const { blocks } = htmlToPortableText(
    '<p><a href="javascript:alert(1)">x</a></p>',
    {
      base: 'https://a.test/',
    },
  )
  assert.equal(blockOf(blocks, 0).markDefs.length, 0)
})

// ---- ids ----

void test('importId: imported-<sha1 of the canonical source URL>', () => {
  const a = importId('https://Old.example.com/news/hello/#top')
  assert.equal(a, `${ID_PREFIX}${sha1('https://old.example.com/news/hello')}`)
  assert.equal(importId('https://old.example.com/news/hello'), a)
  assert.equal(canonicalUrl('https://x.org/a/index.html'), 'https://x.org/a')
  assert.ok(
    !a.includes('.'),
    'no dot: dotted ids are hidden from the public site',
  )
})

// ---- WordPress ----

void test('wordpress REST: content types, items, paths below a subdirectory install', () => {
  const types = wpContentTypes({
    post: { slug: 'post', rest_base: 'posts', name: 'Posts' },
    page: { slug: 'page', rest_base: 'pages', name: 'Pages' },
    attachment: { slug: 'attachment', rest_base: 'media' },
    wp_block: { slug: 'wp_block', rest_base: 'blocks' },
    podcast: { slug: 'podcast', rest_base: 'podcasts', name: 'Podcasts' },
  })
  assert.deepEqual(
    types.map((t) => t.name),
    ['page', 'post', 'podcast'],
  )
  assert.equal(
    pathBelow(
      'https://wordpress.org/news/about/team/',
      'https://wordpress.org/news',
    ),
    'about/team',
  )
  assert.equal(
    pathBelow('https://wordpress.org/news/', 'https://wordpress.org/news'),
    'home',
  )
  assert.equal(
    wpUrl('https://x.org/wp-json/', 'wp/v2/posts', { page: '2' }),
    'https://x.org/wp-json/wp/v2/posts?page=2',
  )
  assert.equal(
    wpUrl('https://x.org/?rest_route=/', 'wp/v2/posts', { page: '2' }),
    'https://x.org/?rest_route=%2Fwp%2Fv2%2Fposts&page=2',
  )
  const item = wpItem(
    {
      id: 7,
      link: 'https://wordpress.org/news/2024/05/hello-world/',
      slug: 'hello-world',
      status: 'publish',
      date_gmt: '2024-05-01T10:00:00',
      title: { rendered: 'Hello &#8220;World&#8221;' },
      excerpt: { rendered: '<p>Short [&hellip;]</p>' },
      content: { rendered: '<p>Body</p>', protected: false },
      categories: [3],
      _embedded: {
        author: [{ name: 'Matt' }],
        'wp:featuredmedia': [
          {
            source_url: 'https://wordpress.org/news/files/a.jpg',
            alt_text: 'A',
          },
        ],
        'wp:term': [[{ name: 'Releases' }], [{ name: 'six &amp; seven' }]],
      },
    },
    'post',
    'https://wordpress.org/news',
  )
  assert.ok(item)
  assert.equal(item.title, 'Hello “World”')
  assert.equal(item.date, '2024-05-01T10:00:00Z')
  assert.equal(item.excerpt, 'Short…')
  assert.deepEqual(item.terms, ['Releases', 'six & seven'])
  assert.equal(item.author, 'Matt')
  assert.equal(item.featured?.url, 'https://wordpress.org/news/files/a.jpg')
  assert.deepEqual(item.meta.categories, [3])
  // Nothing behind a password.
  assert.equal(
    wpItem(
      {
        id: 1,
        link: 'https://x.org/p',
        content: { protected: true, rendered: '' },
      },
      'post',
      'https://x.org',
    ),
    undefined,
  )
  assert.deepEqual(
    originalImageUrls(
      'https://x.org/wp-content/uploads/2024/05/photo-1024x768.jpg',
    ),
    [
      'https://x.org/wp-content/uploads/2024/05/photo.jpg',
      'https://x.org/wp-content/uploads/2024/05/photo-1024x768.jpg',
    ],
  )
})

const WXR = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel>
  <title>Lake Superior</title>
  <link>https://lakesuperior.example</link>
  <wp:base_blog_url>https://lakesuperior.example</wp:base_blog_url>
  <item>
    <title><![CDATA[Ice & Snow]]></title>
    <link>https://lakesuperior.example/2023/01/ice-and-snow/</link>
    <dc:creator><![CDATA[kenner]]></dc:creator>
    <content:encoded><![CDATA[<p>Cold <strong>water</strong>.</p>]]></content:encoded>
    <excerpt:encoded><![CDATA[Cold.]]></excerpt:encoded>
    <wp:post_id>12</wp:post_id>
    <wp:post_date_gmt><![CDATA[2023-01-05 08:30:00]]></wp:post_date_gmt>
    <wp:post_name><![CDATA[ice-and-snow]]></wp:post_name>
    <wp:status><![CDATA[publish]]></wp:status>
    <wp:post_type><![CDATA[post]]></wp:post_type>
    <wp:post_password><![CDATA[]]></wp:post_password>
    <category domain="category" nicename="winter"><![CDATA[Winter]]></category>
    <category domain="post_tag" nicename="ice"><![CDATA[Ice]]></category>
    <wp:postmeta><wp:meta_key><![CDATA[_thumbnail_id]]></wp:meta_key><wp:meta_value><![CDATA[40]]></wp:meta_value></wp:postmeta>
    <wp:postmeta><wp:meta_key><![CDATA[subtitle]]></wp:meta_key><wp:meta_value><![CDATA[Brr]]></wp:meta_value></wp:postmeta>
  </item>
  <item>
    <title>About us</title>
    <link>https://lakesuperior.example/about/history/</link>
    <content:encoded><![CDATA[<p>Since 1900.</p>]]></content:encoded>
    <wp:post_id>2</wp:post_id>
    <wp:post_name>history</wp:post_name>
    <wp:status>publish</wp:status>
    <wp:post_type>page</wp:post_type>
  </item>
  <item>
    <title>Draft</title>
    <wp:post_id>3</wp:post_id>
    <wp:status>draft</wp:status>
    <wp:post_type>post</wp:post_type>
  </item>
  <item>
    <title>photo</title>
    <wp:post_id>40</wp:post_id>
    <wp:post_type>attachment</wp:post_type>
    <wp:attachment_url>https://lakesuperior.example/wp-content/uploads/photo.jpg</wp:attachment_url>
    <wp:postmeta><wp:meta_key>_wp_attachment_image_alt</wp:meta_key><wp:meta_value>Ice on the lake</wp:meta_value></wp:postmeta>
  </item>
</channel>
</rss>`

void test('parseWxr: published posts and pages, featured image from the attachment, drafts skipped', () => {
  const r = parseWxr(WXR)
  assert.equal(r.site, 'https://lakesuperior.example')
  assert.equal(r.items.length, 2)
  assert.deepEqual(r.skipped, { draft: 1 })
  assert.equal(r.attachments, 1)
  const [post, page] = r.items
  assert.ok(post && page)
  assert.equal(post.title, 'Ice & Snow')
  assert.equal(post.slug, 'ice-and-snow')
  assert.equal(post.date, '2023-01-05T08:30:00Z')
  assert.equal(post.excerpt, 'Cold.')
  assert.deepEqual(post.terms, ['Winter', 'Ice'])
  assert.equal(post.author, 'kenner')
  assert.deepEqual(post.featured, {
    url: 'https://lakesuperior.example/wp-content/uploads/photo.jpg',
    alt: 'Ice on the lake',
  })
  assert.deepEqual(post.meta, { subtitle: 'Brr' })
  assert.equal(post.html, '<p>Cold <strong>water</strong>.</p>')
  assert.equal(page.sourceType, 'page')
  assert.equal(page.slug, 'about/history')
})

// ---- exports ----

void test('JSON and CSV exports: {url, title, date, body, images}', () => {
  const [a] = parseJsonExport(
    JSON.stringify([
      {
        url: 'https://x.org/blog/first',
        title: 'First',
        date: '2022-03-04',
        body: 'Para one.\n\nPara two.',
        images: [
          'https://x.org/1.jpg',
          { url: 'https://x.org/2.jpg', alt: 'Two' },
        ],
        color: 'red',
      },
      { title: 'no url' },
    ]),
  )
  assert.ok(a)
  assert.equal(a.slug, 'first')
  assert.equal(a.date, '2022-03-04T00:00:00.000Z')
  assert.equal(a.featured?.url, 'https://x.org/1.jpg')
  assert.match(a.html, /<p>Para one\.<\/p>\n<p>Para two\.<\/p>/)
  assert.match(a.html, /<img src="https:\/\/x\.org\/2\.jpg" alt="Two">/)
  assert.deepEqual(a.meta, { color: 'red' })
  const rows = parseCsvExport(
    'url,title,date,body,images\r\nhttps://x.org/news/b,"B, with comma","2021-01-01","He said ""hi""\nthen left",https://x.org/b.jpg https://x.org/c.jpg\n',
  )
  assert.equal(rows.length, 1)
  const [row] = rows
  assert.ok(row)
  assert.equal(row.title, 'B, with comma')
  assert.match(row.html, /He said "hi"<br>then left/)
  assert.equal(row.featured?.url, 'https://x.org/b.jpg')
})

// ---- HTML crawl content ----

void test('pageContent: main content only, title, date and og:image', () => {
  const html = `<html><head><title>Hello | Site</title>
    <meta property="og:image" content="/og.jpg"><meta name="description" content="Desc">
    <meta property="article:published_time" content="2020-02-02T10:00:00+00:00"></head>
    <body><header><nav><a href="/">Home</a><a href="/about">About</a></nav></header>
    <main><article><h1>Hello</h1><p>Real <a href="/x">text</a>.</p>
      <div class="sharedaddy">Share this</div><form><input></form></article></main>
    <footer>© Site</footer></body></html>`
  const c = pageContent(html, 'https://site.test/news/hello')
  assert.equal(c.title, 'Hello')
  assert.equal(c.date, '2020-02-02T10:00:00.000Z')
  assert.equal(c.excerpt, 'Desc')
  assert.equal(c.featured?.url, 'https://site.test/og.jpg')
  assert.equal(textOf(c.body).replace(/\s+/g, ' ').trim(), 'Real text.')
  const item = pageItem(html, 'https://site.test/news/hello', '')
  assert.equal(item.slug, 'news/hello')
  assert.equal(
    serialize(parseHtml('<p a="&quot;">x &lt; y</p>')),
    '<p a="&quot;">x &lt; y</p>',
  )
  // No <main>: the body minus header/nav/footer.
  const bare = pageContent(
    '<body><header>Site</header><div><p>Only this</p></div><footer>f</footer></body>',
    'https://s.test/a',
  )
  assert.equal(textOf(bare.body).trim(), 'Only this')
})

void test('groupType: manifest collections first, then shared first segments', () => {
  const segmentCounts = new Map([
    ['blog', 5],
    ['about', 1],
  ])
  const collections = [{ name: 'work', listRoute: '/projects' }]
  assert.equal(
    groupType('/projects/bridge', { collections, segmentCounts }),
    'work',
  )
  assert.equal(
    groupType('/blog/a-post', { collections, segmentCounts }),
    'blog',
  )
  assert.equal(groupType('/about/team', { collections, segmentCounts }), 'page')
  assert.equal(groupType('/contact', { collections, segmentCounts }), 'page')
})

// ---- schema + mapping ----

/* The shape `sanity schema extract` writes, cut down to what the mapper reads. */
const SCHEMA = [
  {
    name: 'richText',
    type: 'type',
    value: {
      type: 'array',
      of: {
        type: 'union',
        of: [
          {
            type: 'object',
            attributes: {
              _type: {
                type: 'objectAttribute',
                value: { type: 'string', value: 'block' },
              },
            },
          },
          {
            type: 'object',
            attributes: {},
            rest: { type: 'inline', name: 'imageWithAlt' },
          },
        ],
      },
    },
  },
  {
    name: 'imageWithAlt',
    type: 'type',
    value: {
      type: 'object',
      attributes: {
        asset: {
          type: 'objectAttribute',
          value: { type: 'inline', name: 'sanity.imageAsset.reference' },
        },
      },
    },
  },
  {
    name: 'richTextBlock',
    type: 'type',
    value: {
      type: 'object',
      attributes: {
        content: {
          type: 'objectAttribute',
          value: { type: 'inline', name: 'richText' },
        },
      },
    },
  },
  {
    name: 'post',
    type: 'document',
    attributes: {
      _id: { type: 'objectAttribute', value: { type: 'string' } },
      title: { type: 'objectAttribute', value: { type: 'string' } },
      slug: {
        type: 'objectAttribute',
        value: { type: 'inline', name: 'slug' },
      },
      date: { type: 'objectAttribute', value: { type: 'string' } },
      excerpt: { type: 'objectAttribute', value: { type: 'string' } },
      image: {
        type: 'objectAttribute',
        value: { type: 'inline', name: 'imageWithAlt' },
      },
      body: {
        type: 'objectAttribute',
        value: { type: 'inline', name: 'richText' },
      },
      tags: {
        type: 'objectAttribute',
        value: { type: 'array', of: { type: 'string' } },
      },
    },
  },
  {
    name: 'page',
    type: 'document',
    attributes: {
      title: { type: 'objectAttribute', value: { type: 'string' } },
      slug: {
        type: 'objectAttribute',
        value: { type: 'inline', name: 'slug' },
      },
      blocks: {
        type: 'objectAttribute',
        value: {
          type: 'array',
          of: {
            type: 'union',
            of: [
              { type: 'object', rest: { type: 'inline', name: 'hero' } },
              {
                type: 'object',
                rest: { type: 'inline', name: 'richTextBlock' },
              },
            ],
          },
        },
      },
    },
  },
  {
    name: 'artwork',
    type: 'document',
    attributes: {
      title: { type: 'objectAttribute', value: { type: 'string' } },
      slug: {
        type: 'objectAttribute',
        value: { type: 'inline', name: 'slug' },
      },
      images: {
        type: 'objectAttribute',
        value: {
          type: 'array',
          of: {
            type: 'object',
            attributes: {},
            rest: { type: 'inline', name: 'imageWithAlt' },
          },
        },
      },
      description: {
        type: 'objectAttribute',
        value: { type: 'inline', name: 'richText' },
      },
    },
  },
  { name: 'siteSettings', type: 'document', attributes: {} },
  { name: 'sanity.imageAsset', type: 'document', attributes: {} },
]

const targets: Array<TargetType> = targetTypes(SCHEMA)
const target = (n: string) => {
  const t = targets.find((x) => x.name === n)
  assert.ok(t, `target ${n}`)
  return t
}

void test('targetTypes reads document types and field kinds from the extracted schema', () => {
  assert.deepEqual(
    targets.map((t) => t.name),
    ['post', 'page', 'artwork'],
  )
  assert.deepEqual(
    target('post').fields.map((f) => `${f.name}:${f.kind}`),
    [
      'title:string',
      'slug:slug',
      'date:string',
      'excerpt:string',
      'image:image',
      'body:richText',
      'tags:stringArray',
    ],
  )
  assert.deepEqual(target('page').fields[2], {
    name: 'blocks',
    kind: 'blocks',
    blockTypes: ['hero', 'richTextBlock'],
  })
  assert.equal(
    target('artwork').fields.find((f) => f.name === 'images')?.kind,
    'imageArray',
  )
})

void test('resolveTypes: by name, then synonyms, then collections; taxonomies fold; the rest become pages', () => {
  const m = resolveTypes(
    [
      { name: 'post', count: 10 },
      { name: 'article', count: 2 },
      { name: 'page', count: 3 },
      { name: 'portfolio', count: 4 },
      { name: 'category', count: 5 },
      { name: 'author', count: 1 },
      { name: 'podcast', count: 6 },
    ],
    targets,
    [{ name: 'portfolio' }],
  )
  assert.deepEqual(
    m.map((x) => `${x.source}→${x.target ?? '-'}:${x.how}`),
    [
      'post→post:name',
      'article→post:synonym',
      'page→page:name',
      'portfolio→artwork:synonym',
      'category→-:folded',
      'author→-:folded',
      'podcast→page:fallback',
    ],
  )
  assert.deepEqual(fieldPlan(target('post')), {
    title: 'title',
    slug: 'slug',
    date: 'date',
    excerpt: 'excerpt',
    body: 'body',
    image: 'image',
    terms: 'tags',
  })
  assert.deepEqual(fieldPlan(target('page')), {
    title: 'title',
    slug: 'slug',
    blocks: 'blocks',
  })
  assert.deepEqual(fieldPlan(target('artwork')), {
    title: 'title',
    slug: 'slug',
    body: 'description',
    images: 'images',
  })
})

const ITEM: Item = {
  sourceUrl: 'https://old.example.com/2024/05/hello-world/',
  sourceId: '7',
  sourceType: 'post',
  title: 'Hello world',
  slug: 'hello-world',
  date: '2024-05-01T10:00:00Z',
  excerpt: 'Short',
  html: '<p>Hi</p><figure><img src="/wp-content/uploads/a.jpg" alt="A"></figure>',
  featured: { url: 'https://old.example.com/f.jpg', alt: 'F' },
  terms: ['News'],
  author: 'Matt',
  meta: { format: 'standard' },
}

void test('mapItem: fields by plan, images as patch slots, everything else in sourceMeta', () => {
  const m = mapItem(ITEM, target('post'), {
    importedAt: '2026-09-23T00:00:00Z',
  })
  assert.equal(m.doc._id, importId(ITEM.sourceUrl))
  assert.equal(m.doc._type, 'post')
  assert.equal(m.doc.title, 'Hello world')
  assert.deepEqual(m.doc.slug, { _type: 'slug', current: 'hello-world' })
  assert.equal(m.doc.date, '2024-05-01')
  assert.deepEqual(m.doc.tags, ['News'])
  assert.equal(m.doc.sourceUrl, ITEM.sourceUrl)
  assert.equal(m.doc.sourceId, '7')
  assert.equal(m.doc.importedAt, '2026-09-23T00:00:00Z')
  assert.deepEqual(JSON.parse(String(m.doc.sourceMeta)), {
    sourceType: 'post',
    format: 'standard',
    author: 'Matt',
  })
  assert.deepEqual(m.images, [
    {
      path: 'body[_key=="b1"].asset',
      url: 'https://old.example.com/wp-content/uploads/a.jpg',
      alt: 'A',
    },
    { path: 'image.asset', url: 'https://old.example.com/f.jpg', alt: 'F' },
  ])
  assert.equal(m.from, '/2024/05/hello-world')
  assert.equal(m.to, '/news/hello-world')
  // An asset already uploaded is referenced straight away.
  const known = mapItem(ITEM, target('post'), {
    importedAt: 'x',
    assets: new Map([['https://old.example.com/f.jpg', 'image-abc']]),
  })
  assert.deepEqual(known.doc.image, {
    _type: 'imageWithAlt',
    alt: 'F',
    asset: { _type: 'reference', _ref: 'image-abc' },
  })
})

void test('mapItem: a page body becomes one richTextBlock; a taken slug is suffixed and not redirected', () => {
  const page: Item = {
    ...ITEM,
    sourceType: 'page',
    sourceUrl: 'https://old.example.com/about/',
    slug: 'about',
    featured: undefined,
  }
  const m = mapItem(page, target('page'), {
    importedAt: 'x',
    taken: new Map([['page', new Set(['about'])]]),
  })
  const blocks = m.doc.blocks
  assert.ok(Array.isArray(blocks))
  assert.equal(blocks.length, 1)
  assert.deepEqual(m.doc.slug, { _type: 'slug', current: 'about-imported' })
  assert.equal(
    m.images[0]?.path,
    'blocks[_key=="imported-body"].content[_key=="b1"].asset',
  )
  assert.equal(m.from, m.to)
  const meta: unknown = JSON.parse(String(m.doc.sourceMeta))
  assert.ok(typeof meta === 'object' && meta !== null && 'slugWasTaken' in meta)
  assert.equal(routeFor('page', 'home'), '/')
  assert.equal(routeFor('artwork', 'bridge'), '/work/bridge')
})

// ---- redirects ----

void test('redirectMap: normalised, deduped, no self-redirects, chains collapsed, live paths kept', () => {
  const r = redirectMap(
    [
      { from: '/2024/05/hello/', to: '/news/hello' },
      { from: '/2024/05/hello', to: '/news/other' }, // duplicate old path: first wins
      { from: '/about/', to: '/about' }, // same path
      { from: '/news/hello', to: '/news/hello' },
      { from: '/old-a', to: '/news/b' },
      { from: '/news/other', to: '/elsewhere' }, // /news/other is served by the new site: kept
      { from: '/bad', to: '//evil.example' },
    ],
    [
      { from: '/ancient', to: '/old-a' }, // an earlier import's redirect now chains on
      { from: '/legacy', to: '/news/hello' },
    ],
  )
  assert.deepEqual(r, [
    { from: '/2024/05/hello', to: '/news/hello' },
    { from: '/ancient', to: '/news/b' },
    { from: '/legacy', to: '/news/hello' },
    { from: '/old-a', to: '/news/b' },
  ])
})

void test('src/lib/redirects: only same-site paths, trailing slash and encoding tolerant', async () => {
  const { redirectFor, redirectTable } = await import('../src/lib/redirects.ts')
  const t = redirectTable([
    { from: '/2024/05/hello/', to: '/news/hello' },
    { from: '/caf%C3%A9', to: '/news/cafe' },
    { from: '/evil', to: '//evil.example' },
    { from: '/abs', to: 'https://evil.example/' },
    { from: '/same/', to: '/same' },
    'junk',
  ])
  assert.equal(t.size, 2)
  assert.equal(redirectFor(t, '/2024/05/hello'), '/news/hello')
  assert.equal(redirectFor(t, '/2024/05/hello/'), '/news/hello')
  assert.equal(redirectFor(t, '/café'), undefined) // the table holds the encoded spelling
  assert.equal(redirectFor(t, '/caf%C3%A9'), '/news/cafe')
  assert.equal(redirectFor(t, '/evil'), undefined)
  assert.equal(redirectFor(redirectTable(undefined), '/x'), undefined)
})

void test('shareOut: --max spread over types, small types take all they have', async () => {
  const { shareOut } = await import('./import.ts')
  assert.deepEqual(shareOut([2, 1109, 86], 40), [2, 19, 19])
  assert.deepEqual(shareOut([2, 1109, 86], undefined), [2, 1109, 86])
  assert.deepEqual(shareOut([0, 5], 40), [0, 5])
})
