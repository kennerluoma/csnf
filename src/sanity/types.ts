/* App-facing names for the generated Sanity types (src/sanity/sanity.types.ts, `pnpm typegen`).
   Nothing here describes a shape by hand: every type is derived from a query result, so a schema
   or projection change shows up as a type error where the field is used. */
import type {
  ArtistBySlugQueryResult,
  ArtworkBySlugQueryResult,
  ArtworksQueryResult,
  EventBySlugQueryResult,
  EventsQueryResult,
  ExhibitionBySlugQueryResult,
  ExhibitionsQueryResult,
  PageBySlugQueryResult,
  PostBySlugQueryResult,
  PostsQueryResult,
  SiteSettingsQueryResult,
} from './sanity.types'

export type PageDoc = NonNullable<PageBySlugQueryResult>
export type AnyBlock = NonNullable<PageDoc['blocks']>[number]
export type BlockOf<T extends AnyBlock['_type']> = Extract<AnyBlock, { _type: T }>
export type SiteSettings = NonNullable<SiteSettingsQueryResult>
export type Seo = NonNullable<PageDoc['seo']>
export type Link = NonNullable<SiteSettings['nav']>[number]

export type ArtworkCard = ArtworksQueryResult[number]
export type ArtworkDoc = NonNullable<ArtworkBySlugQueryResult>
export type ArtistRef = NonNullable<ArtworkCard['artist']>
export type ArtistDoc = NonNullable<ArtistBySlugQueryResult>
export type ExhibitionCard = ExhibitionsQueryResult['current'][number]
export type ExhibitionDoc = NonNullable<ExhibitionBySlugQueryResult>
export type EventCard = EventsQueryResult[number]
export type EventDoc = NonNullable<EventBySlugQueryResult>
export type PostCard = PostsQueryResult[number]
export type PostDoc = NonNullable<PostBySlugQueryResult>

/* Any image projected with `img()` in queries.ts. */
export type SanityImage = NonNullable<ArtworkCard['image']>
export type RichTextValue = NonNullable<ArtworkDoc['description']>
