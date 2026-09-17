/* Server-side data for blocks that list CMS documents. Blocks stay presentational: getPage runs
   the resolver for each block type listed here and merges the result into the block's props.
   Resolvers receive the URL search params (filters are shareable links) and site settings. */
import { client } from '#/sanity/client'
import { monthGrid, parseMonth, todayIso } from '#/lib/dates'
import {
  artistsQuery,
  artworkFiltersQuery,
  artworksQuery,
  eventSeriesQuery,
  eventsQuery,
  exhibitionsQuery,
  postsQuery,
  upcomingEventsQuery,
} from '#/sanity/queries'
import type {
  AnyBlock,
  ArtistRef,
  ArtworkCard,
  EventCard,
  ExhibitionCard,
  PostCard,
  SanityImage,
  SiteSettings,
} from '#/sanity/types'

export type ResolveContext = {
  path: string
  search: Record<string, string | undefined>
  settings: SiteSettings | null
}
type Resolver = (
  block: AnyBlock,
  ctx: ResolveContext,
) => Promise<Record<string, unknown>>

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown, d: number) => (typeof v === 'number' && v > 0 ? v : d)

export const blockResolvers: Record<string, Resolver> = {
  async artistList() {
    return {
      items:
        await client.fetch<Array<ArtistRef & { portrait?: SanityImage }>>(
          artistsQuery,
        ),
    }
  },

  async artworkGrid(block, { path, search }) {
    const values = {
      artist: search.artist,
      year: search.year,
      medium: search.medium,
      tag: search.tag,
    }
    const [items, filters] = await Promise.all([
      client.fetch<Array<ArtworkCard>>(artworksQuery as string, {
        artist: str(values.artist),
        year: Number(values.year) || 0,
        medium: str(values.medium),
        tagFilter: str(values.tag),
        featured: block.featuredOnly === true,
        limit: num(block.limit, 500),
      }),
      block.showFilters === false
        ? null
        : client.fetch<{
            artists: Array<ArtistRef>
            years: Array<number>
            media: Array<string>
            tags: Array<string>
          }>(artworkFiltersQuery),
    ])
    return { items, filters, values, path }
  },

  async exhibitionList(block) {
    const groups = await client.fetch<{
      current: Array<ExhibitionCard>
      upcoming: Array<ExhibitionCard>
      past: Array<ExhibitionCard>
    }>(exhibitionsQuery as string, {
      today: todayIso(),
      limit: num(block.pastLimit, 12),
    })
    return { groups }
  },

  async eventCalendar(block, { path, search }) {
    const m = parseMonth(search.month)
    const series = str(search.series)
    const [inMonth, upcoming, allSeries] = await Promise.all([
      block.view === 'list'
        ? []
        : client.fetch<Array<EventCard>>(eventsQuery as string, {
            from: m.from,
            to: m.to,
            series,
          }),
      block.view === 'month'
        ? []
        : client.fetch<Array<EventCard>>(upcomingEventsQuery as string, {
            now: new Date().toISOString(),
            series,
            limit: num(block.limit, 12),
          }),
      block.showFilters === false
        ? []
        : client.fetch<Array<{ slug: string; title: string }>>(
            eventSeriesQuery,
          ),
    ])
    return {
      month: {
        year: m.year,
        month: m.month,
        key: m.key,
        prev: m.prev,
        next: m.next,
        weeks: monthGrid(m.year, m.month),
      },
      inMonth,
      upcoming,
      series: allSeries,
      values: { series: search.series },
      path,
    }
  },

  async postList(block, { search }) {
    const items = await client.fetch<Array<PostCard>>(postsQuery as string, {
      tagFilter: str(search.tag),
      limit: num(block.limit, 6),
    })
    return { items }
  },

  async contactForm(_block, { path, search }) {
    return {
      sent: search.sent === '1',
      error:
        search.error === 'invalid'
          ? 'Please fill in every required field.'
          : search.error === 'failed'
            ? 'Sorry, sending failed. Please try again or email us directly.'
            : undefined,
      path,
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || undefined,
    }
  },

  async newsletterSignup(_block, { settings }) {
    return { newsletter: settings?.newsletter }
  },
}

export async function resolveBlocks(
  blocks: Array<AnyBlock> | null,
  ctx: ResolveContext,
) {
  if (!blocks?.length) return blocks
  return Promise.all(
    blocks.map(async (b) => {
      const r = blockResolvers[b._type] as Resolver | undefined
      return r ? ({ ...b, ...(await r(b, ctx)) } as AnyBlock) : b
    }),
  )
}
