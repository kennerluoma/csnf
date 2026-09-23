import { blockProjections } from '#/blocks/schemas'
import { img, rich } from './img'

export { img, rich }

const blocks = `blocks[]{ _key, _type, ${blockProjections} }`
const seo = `seo{ title, description, ${img('image')}, noIndex }`

export const pageBySlugQuery = /* groq */ `*[_type == "page" && slug.current == $slug][0]{
  _id, title, "slug": slug.current, ${blocks}, ${seo}
}`

export const siteSettingsQuery = /* groq */ `*[_type == "siteSettings"][0]{
  siteName, ${img('logo')}, nav[]{label, href}, footerText, social[]{label, href}, analyticsId,
  ${seo}, contactEmail, newsletter{provider, actionUrl}
}`

/* ---- content types. Card projections feed index blocks; doc projections feed detail routes. ---- */
const artistRef = `artist->{ _id, name, "slug": slug.current }`
const artworkCard = `_id, title, "slug": slug.current, year, date, collection, medium, ${img('images[0]', 'image')}, ${artistRef}, tags`
const exhibitionCard = `_id, title, "slug": slug.current, start, end, venue, ${img('image')}, artists[]->{ _id, name, "slug": slug.current }`
const eventCard = `_id, title, "slug": slug.current, start, end, allDay, location, venue->{ _id, name, "slug": slug.current, address, mapLink }, price, ${img('image')}, series->{ _id, title, "slug": slug.current }`
const postCard = `_id, title, "slug": slug.current, date, excerpt, ${img('image')}, tags`

/* Index queries take optional filters as params ("" = no filter). */
export const artworksQuery = /* groq */ `*[_type == "artwork"
  && ($artist == "" || artist->slug.current == $artist)
  && ($year == 0 || year == $year)
  && ($medium == "" || medium == $medium)
  && ($collection == "" || collection == $collection)
  && ($tagFilter == "" || $tagFilter in tags)
  && ($featured == false || featured == true)
] | order(featured desc, coalesce(date, string(year) + "-01-01") desc, title asc)[0...$limit]{ ${artworkCard} }`
export const artworkFiltersQuery = /* groq */ `{
  "artists": *[_type == "artist" && count(*[_type == "artwork" && references(^._id)]) > 0] | order(name asc){ _id, name, "slug": slug.current },
  "years": array::unique(*[_type == "artwork" && defined(year)].year) | order(@ desc),
  "media": array::unique(*[_type == "artwork" && defined(medium)].medium) | order(@ asc),
  "collections": array::unique(*[_type == "artwork" && defined(collection)].collection) | order(@ asc),
  "tags": array::unique(*[_type == "artwork" && defined(tags)].tags[]) | order(@ asc)
}`
export const artworkBySlugQuery = /* groq */ `*[_type == "artwork" && slug.current == $slug][0]{
  ${artworkCard}, caption, dimensions, ${img('images[]', 'images')}, ${rich('description')},
  exhibitions[]->{ _id, title, "slug": slug.current }, ${seo}
}`

export const artistsQuery = /* groq */ `*[_type == "artist"] | order(name asc){ _id, name, "slug": slug.current, ${img('portrait')} }`
export const artistBySlugQuery = /* groq */ `*[_type == "artist" && slug.current == $slug][0]{
  _id, name, "slug": slug.current, ${img('portrait')}, ${rich('bio')}, links[]{label, href}, ${seo},
  "artworks": *[_type == "artwork" && artist._ref == ^._id] | order(year desc){ ${artworkCard} }
}`

/* Exhibitions split by date: current (started, not ended), upcoming, past. $today = YYYY-MM-DD. */
export const exhibitionsQuery = /* groq */ `{
  "current": *[_type == "exhibition" && start <= $today && (!defined(end) || end >= $today)] | order(start desc){ ${exhibitionCard} },
  "upcoming": *[_type == "exhibition" && start > $today] | order(start asc){ ${exhibitionCard} },
  "past": *[_type == "exhibition" && defined(end) && end < $today] | order(start desc)[0...$limit]{ ${exhibitionCard} }
}`
export const exhibitionBySlugQuery = /* groq */ `*[_type == "exhibition" && slug.current == $slug][0]{
  ${exhibitionCard}, ${rich('body')}, ${img('images[]', 'images')}, pressLinks[]{label, href},
  "pressRelease": select(defined(pressRelease.asset) => { "url": pressRelease.asset->url, "label": pressReleaseLabel }), ${seo},
  "artworks": artworks[]->{ ${artworkCard} }
}`

/* Events inside [$from, $to) (ISO datetimes), optionally in one series. */
export const eventsQuery = /* groq */ `*[_type == "event" && start >= $from && start < $to
  && ($series == "" || series->slug.current == $series)
] | order(start asc){ ${eventCard} }`
export const upcomingEventsQuery = /* groq */ `*[_type == "event" && (start >= $now || (defined(end) && end >= $now))
  && ($series == "" || series->slug.current == $series)
] | order(start asc)[0...$limit]{ ${eventCard} }`
export const eventSeriesQuery = /* groq */ `*[_type == "eventSeries"] | order(title asc){ _id, title, "slug": slug.current }`
export const eventBySlugQuery = /* groq */ `*[_type == "event" && slug.current == $slug][0]{ ${eventCard}, ticketUrl, ${rich('body')}, ${seo} }`

export const postsQuery = /* groq */ `*[_type == "post" && ($tagFilter == "" || $tagFilter in tags)] | order(date desc)[0...$limit]{ ${postCard} }`
export const postBySlugQuery = /* groq */ `*[_type == "post" && slug.current == $slug][0]{ ${postCard}, ${rich('body')}, ${seo} }`

/* Every public URL, for the sitemap. */
export const sitemapQuery = /* groq */ `{
  "pages": *[_type == "page" && seo.noIndex != true]{ "slug": slug.current, _updatedAt },
  "artworks": *[_type == "artwork"]{ "slug": slug.current, _updatedAt },
  "artists": *[_type == "artist"]{ "slug": slug.current, _updatedAt },
  "exhibitions": *[_type == "exhibition"]{ "slug": slug.current, _updatedAt },
  "events": *[_type == "event"]{ "slug": slug.current, _updatedAt },
  "posts": *[_type == "post"]{ "slug": slug.current, _updatedAt }
}`
