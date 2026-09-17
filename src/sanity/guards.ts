/* Narrowing at the data edge. Generated query types make every field nullable; a document without
   a slug has no URL (and an event or exhibition without a start has no place in a list), so
   resolvers, loaders and feeds drop those here once and components receive clean types. */
import type { Listed, Scheduled } from './types'

export const hasSlug = <T extends { slug: string | null }>(
  doc: T,
): doc is Listed<T> => typeof doc.slug === 'string'

export const isScheduled = <
  T extends { slug: string | null; start: string | null },
>(
  doc: T,
): doc is Scheduled<T> =>
  typeof doc.slug === 'string' && typeof doc.start === 'string'

/* A nav / social / press link without a target is not rendered. */
export const hasHref = <T extends { href: string | null }>(
  link: T,
): link is T & { href: string } => typeof link.href === 'string'
