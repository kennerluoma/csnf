/* Seed a minimal home page + site settings. Idempotent: deterministic _ids, createOrReplace.
   Run: pnpm seed   (needs VITE_SANITY_PROJECT_ID, VITE_SANITY_DATASET, SANITY_WRITE_TOKEN in .env) */
import { createClient } from '@sanity/client'

const projectId = process.env.VITE_SANITY_PROJECT_ID
const dataset = process.env.VITE_SANITY_DATASET || 'production'
const token = process.env.SANITY_WRITE_TOKEN
if (!projectId || !token) throw new Error('Missing VITE_SANITY_PROJECT_ID or SANITY_WRITE_TOKEN')

const client = createClient({ projectId, dataset, token, apiVersion: '2026-09-01', useCdn: false })

const docs = [
  {
    _id: 'siteSettings',
    _type: 'siteSettings',
    siteName: 'CSNF',
    nav: [{ _key: 'home', _type: 'link', label: 'Home', href: '/' }],
    footerText: '© CSNF',
  },
  {
    _id: 'page.home',
    _type: 'page',
    title: 'Home',
    slug: { _type: 'slug', current: 'home' },
    blocks: [
      {
        _key: 'hero',
        _type: 'hero',
        eyebrow: 'Starter',
        heading: 'A site generated from a design',
        body: 'This page is seed content. The build agent replaces it with blocks and copy from the Figma file.',
        cta: { _type: 'link', label: 'Open the studio', href: 'http://localhost:3333' },
      },
      {
        _key: 'grid',
        _type: 'cardGrid',
        eyebrow: 'How it works',
        heading: 'Three example blocks',
        columns: 3,
        cards: [
          { _key: 'a', _type: 'card', title: 'Hero', body: 'Eyebrow, heading, body, CTA, image.' },
          { _key: 'b', _type: 'card', title: 'Rich text', body: 'Portable Text with an optional heading.' },
          { _key: 'c', _type: 'card', title: 'Card grid', body: 'A repeated component instance becomes an array.' },
        ],
      },
      {
        _key: 'rich',
        _type: 'richTextBlock',
        heading: 'Rich text',
        content: [
          {
            _key: 'p1',
            _type: 'block',
            style: 'normal',
            markDefs: [],
            children: [{ _key: 's1', _type: 'span', marks: [], text: 'Every block is a Sanity object type plus a React component, registered once.' }],
          },
        ],
      },
    ],
  },
]

const tx = docs.reduce((t, d) => t.createOrReplace(d), client.transaction())
const res = await tx.commit()
console.log(`seeded ${res.results.length} documents into ${projectId}/${dataset}`)
