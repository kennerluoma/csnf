/* Index pages that exist even when the designer didn't draw them, so detail pages always have a
   parent and nav links to /work, /exhibitions, /events, /news, /artists never 404. A `page`
   document with the same slug replaces the default entirely. */
import type { AnyBlock, BlockOf, PageDoc } from '#/sanity/types'

/* Same shape the page query returns for a block with only these fields set: the rest are null. */
const artworkGrid = (
  heading: string,
  over: Partial<BlockOf<'artworkGrid'>> = {},
): BlockOf<'artworkGrid'> => ({
  _key: 'index',
  _type: 'artworkGrid',
  eyebrow: null,
  heading,
  intro: null,
  columns: null,
  collection: null,
  limit: null,
  featuredOnly: null,
  showFilters: null,
  cta: null,
  ...over,
})

const defaults: Partial<Record<string, { title: string; block: AnyBlock }>> = {
  work: { title: 'Work', block: artworkGrid('Work') },
  'works-on-paper': {
    title: 'Works on Paper',
    block: artworkGrid('Works on Paper', {
      collection: 'Works on Paper',
      showFilters: false,
    }),
  },
  artists: {
    title: 'Artists',
    block: {
      _key: 'index',
      _type: 'artistList',
      eyebrow: null,
      heading: 'Artists',
      columns: null,
    },
  },
  exhibitions: {
    title: 'Exhibitions',
    block: {
      _key: 'index',
      _type: 'exhibitionList',
      eyebrow: null,
      heading: 'Exhibitions',
      mode: 'all',
      pastLimit: null,
      cta: null,
    },
  },
  events: {
    title: 'Events',
    block: {
      _key: 'index',
      _type: 'eventCalendar',
      eyebrow: null,
      heading: 'Events',
      view: 'both',
      limit: null,
      showFilters: null,
      cta: null,
    },
  },
  news: {
    title: 'News',
    block: {
      _key: 'index',
      _type: 'postList',
      eyebrow: null,
      heading: 'News',
      limit: 50,
      columns: null,
      cta: null,
    },
  },
}

export function defaultPage(slug: string): PageDoc | null {
  const d = defaults[slug]
  if (!d) return null
  return {
    _id: `default-${slug}`,
    title: d.title,
    slug,
    blocks: [d.block],
    seo: null,
  }
}
export const defaultIndexSlugs = Object.keys(defaults)
