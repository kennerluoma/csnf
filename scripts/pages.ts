/* Write page documents + site settings from design/manifest.json to Sanity.
   Idempotent: deterministic top-level _ids (`page-<slug>`, `siteSettings`), createOrReplace / patch.
   Images referenced by sections are uploaded from design/assets (Sanity dedupes by content hash).
   Run: pnpm pages   (needs VITE_SANITY_PROJECT_ID, SANITY_WRITE_TOKEN in .env; dataset from agency.json)
   A website import (`extract --from-url`) also seeds its real content: prose sections become
   richTextBlocks, and each `collections[]` entry becomes documents of the matching content type
   (work → artwork, news → post, …), created only if missing so admin edits win on a re-crawl.
   `--dry-run` prints what would be written (no token, no network). */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { createClient } from '@sanity/client'
import type { IdentifiedSanityDocumentStub } from '@sanity/client'

// The extractor (scripts/extract.ts's sectionOf/summarize) never writes a section-level `images`
// array — a node's image is only ever `tree[].image`, a file path, found by walking the
// summarized tree. There was no such array to read; the Hero block's image was silently never
// uploaded.
type TreeNode = { name: string; image?: string; children?: Array<TreeNode> }
type Section = {
  id: string
  name: string
  type: string
  text?: Record<string, string>
  tree?: TreeNode
  // website imports only (scripts/website-lib.ts WebSection)
  images?: Array<{ alt: string; file?: string; background?: boolean }>
  content?: {
    headings: Array<{ level: number; text: string }>
    paragraphs: Array<string>
    links: Array<{ text: string; href: string }>
  }
  repeat?: { count: number }
  form?: { fields: Array<string> }
}
type Collection = {
  name: string
  instances: Array<{
    slug: string
    title: string
    fields: Record<string, string | number | Array<string>>
  }>
}
type Manifest = {
  source?: string | { kind: string; url: string }
  routes: Array<{
    name: string
    path: string
    sections: Array<Section>
    viewport?: string
  }>
  collections?: Array<Collection>
}

const agency = JSON.parse(await readFile('agency.json', 'utf8')) as {
  sanityDataset: string
}
const manifest = JSON.parse(
  await readFile('design/manifest.json', 'utf8'),
) as Manifest

const dryRun = process.argv.includes('--dry-run')
const website =
  typeof manifest.source === 'object' && manifest.source.kind === 'website'
const projectId = process.env.VITE_SANITY_PROJECT_ID ?? '(project)'
const token = process.env.SANITY_WRITE_TOKEN
if (!dryRun && (!process.env.VITE_SANITY_PROJECT_ID || !token))
  throw new Error('Missing VITE_SANITY_PROJECT_ID or SANITY_WRITE_TOKEN')

const client = createClient({
  projectId: dryRun ? 'dryrun' : projectId,
  dataset: agency.sanityDataset,
  token,
  apiVersion: '2026-09-01',
  useCdn: false,
})

const CHROME = new Set(['Header', 'Footer', 'Nav'])
const slugFor = (path: string) =>
  path === '/' ? 'home' : path.replace(/^\/|\/$/g, '')
const keyFor = (id: string) => `s${id.replace(/\W/g, '-')}`

async function uploadImage(image: { name: string; file?: string }) {
  const file = image.file ?? join('design/assets', `${image.name}.png`)
  if (!existsSync(file)) {
    console.warn(`  image ${image.name}: ${file} not found, skipped`)
    return undefined
  }
  const ref = dryRun
    ? `upload:${file}`
    : (
        await client.assets.upload('image', await readFile(file), {
          filename: basename(file),
        })
      )._id
  return {
    _type: 'imageWithAlt',
    asset: { _type: 'reference', _ref: ref },
    alt: image.name,
  }
}

/* Plain paragraphs → Portable Text blocks with deterministic keys. */
const portableText = (paragraphs: Array<string>) =>
  paragraphs.map((text, i) => ({
    _type: 'block',
    _key: `p${i}`,
    style: 'normal',
    markDefs: [],
    children: [{ _type: 'span', _key: `p${i}s`, text, marks: [] }],
  }))

/* Depth-first: the first node in the summarized tree that has an image, if any. */
function firstImage(
  node: TreeNode | undefined,
): { name: string; file: string } | undefined {
  if (!node) return undefined
  if (node.image) return { name: node.name, file: node.image }
  for (const child of node.children ?? []) {
    const found = firstImage(child)
    if (found) return found
  }
  return undefined
}

/* Website sections carry their downloaded images directly; Figma ones only in the tree. */
function sectionImage(section: Section) {
  const img = section.images?.find((i) => i.file && !i.background)
  return img?.file
    ? { name: img.alt || section.name, file: img.file }
    : firstImage(section.tree)
}

async function toBlock(section: Section) {
  const texts = Object.values(section.text ?? {})
  switch (section.type) {
    case 'Hero': {
      const found = sectionImage(section)
      const image = found ? await uploadImage(found) : undefined
      const [heading, body] = texts
      return {
        _key: keyFor(section.id),
        _type: 'hero',
        layout: 'panel',
        heading,
        ...(body && { body }),
        ...(image && { image }),
      }
    }
    default: {
      // A website's prose (no repeated items, no form): the real text as a richTextBlock.
      const c = section.content
      if (website && c?.paragraphs.length && !section.repeat && !section.form)
        return {
          _key: keyFor(section.id),
          _type: 'richTextBlock',
          ...(c.headings[0] && { heading: c.headings[0].text }),
          content: portableText(c.paragraphs),
        }
      console.warn(`  section ${section.name} (${section.type}): no mapping`)
      return undefined
    }
  }
}

const docs: Array<IdentifiedSanityDocumentStub> = []
const seenIds = new Set<string>()
for (const route of manifest.routes) {
  // A mobile route is a viewport variant of its desktop counterpart's page, not a page of its
  // own — extracting it as one used to create a second "page-<slug>" document that overwrote
  // (or was overwritten by) the desktop one, since they share the same path/slug.
  if (route.viewport === 'mobile') continue
  const slug = slugFor(route.path)
  // A nested website path ("exhibitions/x") keeps its slug; the id stays one hyphenated segment.
  const id = `page-${slug.replace(/[^a-zA-Z0-9_-]+/g, '-')}`
  if (seenIds.has(id))
    throw new Error(
      `duplicate page id "${id}" from route "${route.name}" (${route.path}); fix the route paths in design/manifest.json`,
    )
  seenIds.add(id)
  const blocks = []
  for (const s of route.sections) {
    if (CHROME.has(s.type)) continue
    const block = await toBlock(s)
    if (block) blocks.push(block)
  }
  docs.push({
    _id: id,
    _type: 'page',
    title: slug === 'home' ? 'Home' : route.name,
    slug: { _type: 'slug', current: slug },
    blocks,
  })
}

// Site chrome: wordmark from Header/Footer, nav from the Header's non-wordmark text layers.
const sections = manifest.routes.flatMap((r) => r.sections)
const header = sections.find((s) => s.type === 'Header')
const footer = sections.find((s) => s.type === 'Footer')
const siteName = header?.text?.wordmark ?? footer?.text?.wordmark
// A website header knows its real hrefs; a Figma one only has labels.
const siteLinks = header?.content?.links
  .map((l) => ({ label: l.text, url: new URL(l.href) }))
  .filter((l) => l.label && l.label !== siteName && l.url.pathname !== '/')
const nav = siteLinks
  ? siteLinks.map((l) => ({
      _key: l.url.pathname.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home',
      _type: 'link',
      label: l.label,
      href: l.url.pathname,
    }))
  : Object.entries(header?.text ?? {})
      .filter(([field]) => field !== 'wordmark')
      .map(([, label]) => {
        const slug = label.toLowerCase().replace(/\W+/g, '-')
        return {
          _key: slug,
          _type: 'link',
          label,
          href: slug === 'home' ? '/' : `/${slug}`,
        }
      })

// Collections (website imports): real items → documents of the template's content types.
const DOC_TYPES: Array<[RegExp, string]> = [
  [
    /^(work|works|artworks?|paintings?|drawings?|sculptures?|portfolio|projects?|pieces|collection)$/i,
    'artwork',
  ],
  [/^(news|blog|journal|posts?|articles?|writing|stories|press)$/i, 'post'],
  [/^(exhibitions?|shows?)$/i, 'exhibition'],
  [/^(artists?)$/i, 'artist'],
]
const items: Array<IdentifiedSanityDocumentStub> = []
for (const c of manifest.collections ?? []) {
  const type = DOC_TYPES.find(([re]) => re.test(c.name))?.[1]
  if (!type) {
    console.warn(
      `  collection "${c.name}" (${c.instances.length}): no template content type matches; the translate pass models it`,
    )
    continue
  }
  for (const inst of c.instances) {
    const slug = inst.slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    if (!slug) continue
    const f = inst.fields
    const str = (k: string) => (typeof f[k] === 'string' ? f[k] : undefined)
    const files = Array.isArray(f.images) ? f.images : []
    const images = []
    for (const [i, file] of files.entries()) {
      const img = await uploadImage({ name: inst.title, file })
      if (img) images.push({ ...img, _key: `img${i}` })
    }
    const text = [str('caption'), str('body')].filter((t) => t !== undefined)
    const base = {
      _id: `${type}-${slug}`,
      _type: type,
      slug: { _type: 'slug', current: slug },
    }
    const [first, ...rest] = images
    const firstImage = first
      ? { _type: first._type, asset: first.asset, alt: first.alt }
      : undefined
    const year = typeof f.year === 'number' ? f.year : undefined
    items.push(
      type === 'artwork'
        ? {
            ...base,
            title: inst.title,
            ...(year !== undefined && { year }),
            ...(str('dimensions') && { dimensions: str('dimensions') }),
            ...(images.length && { images }),
            ...(str('caption') && {
              caption: portableText([str('caption') ?? '']),
            }),
            ...(str('body') && {
              description: portableText((str('body') ?? '').split('\n\n')),
            }),
          }
        : type === 'post'
          ? {
              ...base,
              title: inst.title,
              ...(str('caption') && { excerpt: str('caption') }),
              ...(firstImage && { image: firstImage }),
              ...(str('body') && {
                body: portableText((str('body') ?? '').split('\n\n')),
              }),
            }
          : type === 'exhibition'
            ? {
                ...base,
                title: inst.title,
                ...(firstImage && { image: firstImage }),
                ...(rest.length && { images: rest }),
                ...(text.length && {
                  body: portableText(text.join('\n\n').split('\n\n')),
                }),
              }
            : {
                ...base,
                name: inst.title,
                ...(firstImage && { portrait: firstImage }),
                ...(text.length && {
                  bio: portableText(text.join('\n\n').split('\n\n')),
                }),
              },
    )
  }
}

if (dryRun) {
  console.log(`dry run: would write to ${projectId}/${agency.sanityDataset}`)
  for (const d of docs)
    console.log(
      `  createOrReplace ${d._id}: ${Array.isArray(d.blocks) ? d.blocks.length : 0} block(s)`,
    )
  console.log(
    `  patch siteSettings: siteName=${JSON.stringify(siteName ?? null)}, nav=[${nav.map((n) => `${n.label} → ${n.href}`).join(', ')}]`,
  )
  for (const d of items)
    console.log(
      `  createIfNotExists ${d._id} (${d._type}): ${Object.keys(d)
        .filter((k) => !k.startsWith('_'))
        .join(', ')}`,
    )
  console.log(
    `dry run: ${docs.length} page(s), ${items.length} collection document(s), siteSettings — nothing written`,
  )
  process.exit(0)
}

const tx = docs.reduce((t, d) => t.createOrReplace(d), client.transaction())
for (const d of items) tx.createIfNotExists(d)
tx.createIfNotExists({ _id: 'siteSettings', _type: 'siteSettings' })
tx.patch('siteSettings', (p) =>
  p
    .set({ ...(siteName && { siteName }), nav })
    // The design has no footer text slot.
    .unset(['footerText']),
)
const res = await tx.commit()
console.log(
  `wrote ${res.results.length} mutations to ${projectId}/${agency.sanityDataset}: ${docs.map((d) => d._id).join(', ')}, siteSettings${items.length ? `, ${items.length} collection document(s) (created if missing)` : ''}`,
)
