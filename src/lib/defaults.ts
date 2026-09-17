/* Index pages that exist even when the designer didn't draw them, so detail pages always have a
   parent and nav links to /work, /exhibitions, /events, /news, /artists never 404. A `page`
   document with the same slug replaces the default entirely. */
import type { PageDoc } from '#/sanity/types'

const defaults: Record<
  string,
  { title: string; block: string; props?: Record<string, unknown> }
> = {
  work: { title: 'Work', block: 'artworkGrid', props: { heading: 'Work' } },
  artists: {
    title: 'Artists',
    block: 'artistList',
    props: { heading: 'Artists' },
  },
  exhibitions: {
    title: 'Exhibitions',
    block: 'exhibitionList',
    props: { heading: 'Exhibitions', mode: 'all' },
  },
  events: {
    title: 'Events',
    block: 'eventCalendar',
    props: { heading: 'Events', view: 'both' },
  },
  news: {
    title: 'News',
    block: 'postList',
    props: { heading: 'News', limit: 50 },
  },
}

export function defaultPage(slug: string): PageDoc | null {
  const d = defaults[slug] as (typeof defaults)[string] | undefined
  if (!d) return null
  return {
    _id: `default-${slug}`,
    title: d.title,
    slug,
    blocks: [
      { _key: 'index', _type: d.block, ...(d.props as Record<string, never>) },
    ],
  }
}
export const defaultIndexSlugs = Object.keys(defaults)
