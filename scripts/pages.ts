/* Write page documents + site settings from design/manifest.json to Sanity.
   Idempotent: deterministic top-level _ids (`page-<slug>`, `siteSettings`), createOrReplace / patch.
   Images referenced by sections are uploaded from design/assets (Sanity dedupes by content hash).
   Run: pnpm pages   (needs VITE_SANITY_PROJECT_ID, SANITY_WRITE_TOKEN in .env; dataset from agency.json) */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { createClient } from '@sanity/client'
import type { IdentifiedSanityDocumentStub } from '@sanity/client'

type Section = {
  id: string
  name: string
  type: string
  text?: Record<string, string>
  images?: Array<{ name: string; file?: string }>
}
type Manifest = {
  routes: Array<{ name: string; path: string; sections: Array<Section> }>
}

const agency = JSON.parse(await readFile('agency.json', 'utf8')) as {
  sanityDataset: string
}
const manifest = JSON.parse(
  await readFile('design/manifest.json', 'utf8'),
) as Manifest

const projectId = process.env.VITE_SANITY_PROJECT_ID
const token = process.env.SANITY_WRITE_TOKEN
if (!projectId || !token)
  throw new Error('Missing VITE_SANITY_PROJECT_ID or SANITY_WRITE_TOKEN')

const client = createClient({
  projectId,
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
  const asset = await client.assets.upload('image', await readFile(file), {
    filename: basename(file),
  })
  return {
    _type: 'imageWithAlt',
    asset: { _type: 'reference', _ref: asset._id },
    alt: image.name,
  }
}

async function toBlock(section: Section) {
  const texts = Object.values(section.text ?? {})
  switch (section.type) {
    case 'Hero': {
      const image = section.images?.[0]
        ? await uploadImage(section.images[0])
        : undefined
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
    default:
      console.warn(`  section ${section.name} (${section.type}): no mapping`)
      return undefined
  }
}

const docs: Array<IdentifiedSanityDocumentStub> = []
for (const route of manifest.routes) {
  const slug = slugFor(route.path)
  const blocks = []
  for (const s of route.sections) {
    if (CHROME.has(s.type)) continue
    const block = await toBlock(s)
    if (block) blocks.push(block)
  }
  docs.push({
    _id: `page-${slug}`,
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
const nav = Object.entries(header?.text ?? {})
  .filter(([field]) => field !== 'wordmark')
  .map(([, label]) => ({
    _key: label.toLowerCase().replace(/\W+/g, '-'),
    _type: 'link',
    label,
    href: label.toLowerCase() === 'home' ? '/' : `/${slugFor(label)}`,
  }))

const tx = docs.reduce((t, d) => t.createOrReplace(d), client.transaction())
tx.createIfNotExists({ _id: 'siteSettings', _type: 'siteSettings' })
tx.patch('siteSettings', (p) =>
  p
    .set({ ...(siteName && { siteName }), nav })
    // The design has no footer text slot.
    .unset(['footerText']),
)
const res = await tx.commit()
console.log(
  `wrote ${res.results.length} mutations to ${projectId}/${agency.sanityDataset}: ${docs.map((d) => d._id).join(', ')}, siteSettings`,
)
