/* App-facing names for the generated Sanity types (src/sanity/sanity.types.ts, `pnpm typegen`).
   Nothing here describes a shape by hand: every type is derived from a query result, so a schema
   or projection change shows up as a type error where the field is used.

   Generated types say `T | null` for every field, including `slug` and `start`. The data edge
   (resolvers, loaders, feeds) drops documents without them using the guards in ./guards.ts, so
   components get `Listed<…>` / `Scheduled<…>` and never re-check. */
import type {
  ArtistBySlugQueryResult,
  ArtistsQueryResult,
  ArtworkBySlugQueryResult,
  ArtworkFiltersQueryResult,
  ArtworksQueryResult,
  EventBySlugQueryResult,
  EventSeriesQueryResult,
  EventsQueryResult,
  ExhibitionBySlugQueryResult,
  ExhibitionsQueryResult,
  PageBySlugQueryResult,
  PostBySlugQueryResult,
  PostsQueryResult,
  SiteSettingsQueryResult,
} from './sanity.types'

/* A document that has a URL. */
export type Listed<T> = T & { slug: string }
/* A document that has a URL and a start date. */
export type Scheduled<T> = T & { slug: string; start: string }

export type PageDoc = NonNullable<PageBySlugQueryResult>
export type AnyBlock = NonNullable<PageDoc['blocks']>[number]
export type BlockType = AnyBlock['_type']
export type BlockOf<T extends BlockType> = Extract<AnyBlock, { _type: T }>
export type SiteSettings = NonNullable<SiteSettingsQueryResult>
export type Newsletter = NonNullable<SiteSettings['newsletter']>
export type Seo = NonNullable<PageDoc['seo']>
export type Link = NonNullable<SiteSettings['nav']>[number]

export type ArtworkCard = Listed<ArtworksQueryResult[number]>
export type ArtworkDoc = Listed<NonNullable<ArtworkBySlugQueryResult>>
export type ArtworkFilters = ArtworkFiltersQueryResult
export type ArtistCard = Listed<ArtistsQueryResult[number]>
export type ArtistDoc = Listed<NonNullable<ArtistBySlugQueryResult>>
export type ExhibitionCard = Scheduled<
  ExhibitionsQueryResult['current'][number]
>
export type ExhibitionDoc = Scheduled<NonNullable<ExhibitionBySlugQueryResult>>
export type EventCard = Scheduled<EventsQueryResult[number]>
export type EventDoc = Scheduled<NonNullable<EventBySlugQueryResult>>
export type EventSeries = Listed<EventSeriesQueryResult[number]>
export type PostCard = Listed<PostsQueryResult[number]>
export type PostDoc = Listed<NonNullable<PostBySlugQueryResult>>

/* Any image projected with `img()`. */
export type SanityImage = NonNullable<ArtworksQueryResult[number]['image']>
export type RichTextValue = NonNullable<
  NonNullable<ArtworkBySlugQueryResult>['description']
>
