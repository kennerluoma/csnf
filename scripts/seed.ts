/* Seed content for every type so a fresh site isn't empty. Idempotent: deterministic _ids,
   createOrReplace. Ids must be top-level (no dots): Sanity's public read role hides namespaced
   ids like `page.home`. Pages: home. Content: 2 artists, 3 artworks, 2 exhibitions, 3 events,
   2 posts, 2 event series, site settings.
   Run: pnpm seed   (needs VITE_SANITY_PROJECT_ID, VITE_SANITY_DATASET, SANITY_WRITE_TOKEN in .env) */
import { createClient } from '@sanity/client'
import type { IdentifiedSanityDocumentStub } from '@sanity/client'

const projectId = process.env.VITE_SANITY_PROJECT_ID
const dataset = process.env.VITE_SANITY_DATASET || 'production'
const token = process.env.SANITY_WRITE_TOKEN
if (!projectId || !token)
  throw new Error('Missing VITE_SANITY_PROJECT_ID or SANITY_WRITE_TOKEN')

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: '2026-09-01',
  useCdn: false,
})

const slug = (s: string) => ({ _type: 'slug', current: s })
const ref = (id: string) => ({ _type: 'reference', _ref: id })
const link = (label: string, href: string) => ({
  _key: href.replace(/\W+/g, '-'),
  _type: 'link',
  label,
  href,
})
const rich = (text: string, key = 'p1') => [
  {
    _key: key,
    _type: 'block',
    style: 'normal',
    markDefs: [],
    children: [{ _key: `${key}s`, _type: 'span', marks: [], text }],
  },
]
const day = (offset: number, hour = 0) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offset)
  d.setUTCHours(hour, 0, 0, 0)
  return hour ? d.toISOString() : d.toISOString().slice(0, 10)
}

const docs: Array<IdentifiedSanityDocumentStub> = [
  {
    _id: 'siteSettings',
    _type: 'siteSettings',
    siteName: 'CSNF',
    nav: [
      link('Work', '/work'),
      link('Exhibitions', '/exhibitions'),
      link('Events', '/events'),
      link('News', '/news'),
      link('Contact', '/#contact'),
    ],
    footerText: '© CSNF',
    seo: { description: 'A site generated from a design.' },
  },
  {
    _id: 'artist-mara-lindqvist',
    _type: 'artist',
    name: 'Mara Lindqvist',
    slug: slug('mara-lindqvist'),
    bio: rich(
      'Mara Lindqvist works with light, paper and slow processes. Seed content.',
    ),
  },
  {
    _id: 'artist-tomas-reyes',
    _type: 'artist',
    name: 'Tomás Reyes',
    slug: slug('tomas-reyes'),
    bio: rich(
      'Tomás Reyes makes large paintings from small observations. Seed content.',
    ),
  },
  {
    _id: 'artwork-north-window',
    _type: 'artwork',
    title: 'North Window',
    slug: slug('north-window'),
    artist: ref('artist-mara-lindqvist'),
    year: 2025,
    medium: 'Cyanotype on paper',
    dimensions: '70 × 50 cm',
    tags: ['paper', 'light'],
    featured: true,
    description: rich('Seed artwork. Replace the images in the studio.'),
  },
  {
    _id: 'artwork-tide-tables',
    _type: 'artwork',
    title: 'Tide Tables',
    slug: slug('tide-tables'),
    artist: ref('artist-mara-lindqvist'),
    year: 2024,
    medium: 'Ink on paper',
    dimensions: '42 × 30 cm',
    tags: ['paper'],
    exhibitions: [ref('exhibition-slow-light')],
  },
  {
    _id: 'artwork-harbour-iv',
    _type: 'artwork',
    title: 'Harbour IV',
    slug: slug('harbour-iv'),
    artist: ref('artist-tomas-reyes'),
    year: 2026,
    medium: 'Oil on linen',
    dimensions: '180 × 140 cm',
    featured: true,
    exhibitions: [ref('exhibition-slow-light')],
  },
  {
    _id: 'exhibition-slow-light',
    _type: 'exhibition',
    title: 'Slow Light',
    slug: slug('slow-light'),
    start: day(-10),
    end: day(30),
    venue: 'Main gallery',
    artists: [ref('artist-mara-lindqvist'), ref('artist-tomas-reyes')],
    artworks: [ref('artwork-tide-tables'), ref('artwork-harbour-iv')],
    body: rich(
      'A two-person exhibition. Seed content: edit or delete in the studio.',
    ),
  },
  {
    _id: 'exhibition-winter-programme',
    _type: 'exhibition',
    title: 'Winter Programme',
    slug: slug('winter-programme'),
    start: day(60),
    end: day(120),
    venue: 'Project space',
    artists: [ref('artist-tomas-reyes')],
  },
  {
    _id: 'series-talks',
    _type: 'eventSeries',
    title: 'Talks',
    slug: slug('talks'),
  },
  {
    _id: 'series-workshops',
    _type: 'eventSeries',
    title: 'Workshops',
    slug: slug('workshops'),
  },
  {
    _id: 'event-opening-slow-light',
    _type: 'event',
    title: 'Opening: Slow Light',
    slug: slug('opening-slow-light'),
    start: day(3, 18),
    end: day(3, 21),
    location: 'Main gallery',
    price: 'Free',
    body: rich('Opening reception. Seed content.'),
  },
  {
    _id: 'event-artist-talk',
    _type: 'event',
    title: 'Artist talk with Mara Lindqvist',
    slug: slug('artist-talk-mara-lindqvist'),
    start: day(12, 19),
    end: day(12, 20),
    location: 'Main gallery',
    price: '€5',
    series: ref('series-talks'),
  },
  {
    _id: 'event-cyanotype-workshop',
    _type: 'event',
    title: 'Cyanotype workshop',
    slug: slug('cyanotype-workshop'),
    start: day(20, 10),
    end: day(20, 14),
    location: 'Studio 2',
    price: '€40',
    ticketUrl: 'https://example.com/tickets',
    series: ref('series-workshops'),
  },
  {
    _id: 'post-welcome',
    _type: 'post',
    title: 'A new site',
    slug: slug('a-new-site'),
    date: day(-1),
    excerpt:
      'This site was generated from a Figma design. Here is what changed.',
    body: rich('Seed post. Edit or delete in the studio.'),
    tags: ['news'],
  },
  {
    _id: 'post-season',
    _type: 'post',
    title: 'The season ahead',
    slug: slug('the-season-ahead'),
    date: day(-14),
    excerpt: 'Exhibitions, talks and workshops for the coming months.',
    tags: ['programme'],
  },
  {
    _id: 'page-home',
    _type: 'page',
    title: 'Home',
    slug: slug('home'),
    blocks: [
      {
        _key: 'hero',
        _type: 'hero',
        eyebrow: 'Starter',
        heading: 'A site generated from a design',
        body: 'This page is seed content. The build agent replaces it with blocks and copy from the Figma file.',
        cta: { _type: 'link', label: 'See the work', href: '/work' },
      },
      {
        _key: 'now',
        _type: 'exhibitionList',
        heading: 'On now',
        mode: 'currentUpcoming',
        cta: { _type: 'link', label: 'All exhibitions', href: '/exhibitions' },
      },
      {
        _key: 'work',
        _type: 'artworkGrid',
        heading: 'Selected work',
        featuredOnly: true,
        showFilters: false,
        limit: 6,
        cta: { _type: 'link', label: 'View all work', href: '/work' },
      },
      {
        _key: 'events',
        _type: 'eventCalendar',
        heading: 'Events',
        view: 'list',
        limit: 3,
        showFilters: false,
        cta: { _type: 'link', label: 'Full calendar', href: '/events' },
      },
      {
        _key: 'news',
        _type: 'postList',
        heading: 'News',
        limit: 3,
        cta: { _type: 'link', label: 'All news', href: '/news' },
      },
      {
        _key: 'newsletter',
        _type: 'newsletterSignup',
        heading: 'Stay in touch',
        body: 'Exhibitions and events, once a month.',
      },
      {
        _key: 'contact',
        _type: 'contactForm',
        heading: 'Contact',
        intro: 'Questions about a work or a visit? Send us a note.',
        aside: rich('Open Wed – Sun, 11:00 – 18:00.'),
      },
    ],
  },
]

const tx = docs.reduce((t, d) => t.createOrReplace(d), client.transaction())
const res = await tx.commit()
console.log(
  `seeded ${res.results.length} documents into ${projectId}/${dataset}`,
)
