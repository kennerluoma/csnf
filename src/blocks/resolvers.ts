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
} from '#/sanity/queries.gen'
import type {
  EventSeriesQueryResult,
  EventsQueryResult,
} from '#/sanity/sanity.types'
import { hasSlug, isScheduled } from '#/sanity/guards'
import type { AnyBlock, BlockOf, BlockType, SiteSettings } from '#/sanity/types'

export type ResolveContext = {
  path: string
  search: Record<string, string | undefined>
  settings: SiteSettings | null
}

const noEvents: EventsQueryResult = []
const noSeries: EventSeriesQueryResult = []
const limitOr = (v: number | null, d: number) => (v !== null && v > 0 ? v : d)

/* One resolver per block type that needs server data; each takes its own block member. The result
   lands on the block as `data` (see Resolved<T>), typed from what the resolver returns. */
export const blockResolvers = {
  async artistList(_block: BlockOf<'artistList'>, _ctx: ResolveContext) {
    const items = await client.fetch(artistsQuery)
    return { items: items.filter(hasSlug) }
  },

  async artworkGrid(
    block: BlockOf<'artworkGrid'>,
    { path, search }: ResolveContext,
  ) {
    const values = {
      artist: search.artist,
      year: search.year,
      medium: search.medium,
      collection: search.collection ?? block.collection ?? undefined,
      tag: search.tag,
    }
    const [items, filters] = await Promise.all([
      client.fetch(artworksQuery, {
        artist: values.artist ?? '',
        year: Number(values.year) || 0,
        medium: values.medium ?? '',
        collection: values.collection ?? '',
        tagFilter: values.tag ?? '',
        featured: block.featuredOnly === true,
        limit: limitOr(block.limit, 500),
      }),
      block.showFilters === false ? null : client.fetch(artworkFiltersQuery),
    ])
    return {
      items: items.filter(hasSlug),
      filters: filters && {
        ...filters,
        artists: filters.artists.filter(hasSlug),
      },
      values,
      path,
    }
  },

  async exhibitionList(block: BlockOf<'exhibitionList'>, _ctx: ResolveContext) {
    const groups = await client.fetch(exhibitionsQuery, {
      today: todayIso(),
      limit: limitOr(block.pastLimit, 12),
    })
    return {
      groups: {
        current: groups.current.filter(isScheduled),
        upcoming: groups.upcoming.filter(isScheduled),
        past: groups.past.filter(isScheduled),
      },
    }
  },

  async eventCalendar(
    block: BlockOf<'eventCalendar'>,
    { path, search }: ResolveContext,
  ) {
    const m = parseMonth(search.month)
    const series = search.series ?? ''
    const [inMonth, upcoming, allSeries] = await Promise.all([
      block.view === 'list'
        ? noEvents
        : client.fetch(eventsQuery, { from: m.from, to: m.to, series }),
      block.view === 'month'
        ? noEvents
        : client.fetch(upcomingEventsQuery, {
            now: new Date().toISOString(),
            series,
            limit: limitOr(block.limit, 12),
          }),
      block.showFilters === false ? noSeries : client.fetch(eventSeriesQuery),
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
      inMonth: inMonth.filter(isScheduled),
      upcoming: upcoming.filter(isScheduled),
      series: allSeries.filter(hasSlug),
      values: { series: search.series },
      path,
    }
  },

  async postList(block: BlockOf<'postList'>, { search }: ResolveContext) {
    const items = await client.fetch(postsQuery, {
      tagFilter: search.tag ?? '',
      limit: limitOr(block.limit, 6),
    })
    return { items: items.filter(hasSlug) }
  },

  contactForm(
    _block: BlockOf<'contactForm'>,
    { path, search }: ResolveContext,
  ) {
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

  newsletterSignup(
    _block: BlockOf<'newsletterSignup'>,
    { settings }: ResolveContext,
  ) {
    return { newsletter: settings?.newsletter ?? null }
  },
}

type Resolvers = typeof blockResolvers
/* A block as components receive it: the page query's member for that `_type`, plus `data` from
   its resolver when it has one. */
export type Resolved<T extends BlockType> = T extends keyof Resolvers
  ? BlockOf<T> & { data: Awaited<ReturnType<Resolvers[T]>> }
  : BlockOf<T>
export type ResolvedBlock = { [T in BlockType]: Resolved<T> }[BlockType]

/* Narrowing on `_type` hands each resolver its own member type. A block type with a resolver
   above gets a case here; the rest pass through. */
async function resolveBlock(
  block: AnyBlock,
  ctx: ResolveContext,
): Promise<ResolvedBlock> {
  switch (block._type) {
    case 'artistList':
      return { ...block, data: await blockResolvers.artistList(block, ctx) }
    case 'artworkGrid':
      return { ...block, data: await blockResolvers.artworkGrid(block, ctx) }
    case 'contactForm':
      return { ...block, data: blockResolvers.contactForm(block, ctx) }
    case 'eventCalendar':
      return { ...block, data: await blockResolvers.eventCalendar(block, ctx) }
    case 'exhibitionList':
      return { ...block, data: await blockResolvers.exhibitionList(block, ctx) }
    case 'newsletterSignup':
      return {
        ...block,
        data: blockResolvers.newsletterSignup(block, ctx),
      }
    case 'postList':
      return { ...block, data: await blockResolvers.postList(block, ctx) }
    default:
      return block
  }
}

export function resolveBlocks(
  blocks: Array<AnyBlock> | null,
  ctx: ResolveContext,
) {
  return Promise.all((blocks ?? []).map((b) => resolveBlock(b, ctx)))
}
