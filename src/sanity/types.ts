export type SanityImage = {
  _type: 'image'
  asset?: { _ref: string; _type: 'reference' }
  alt?: string
  caption?: Array<AnyBlock>
  /* present when the projection dereferences the asset (Image primitive blur-up + aspect) */
  meta?: { lqip?: string; width?: number; height?: number }
  hotspot?: JsonValue
  crop?: JsonValue
}

export type Link = { label: string; href: string }

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | Array<JsonValue>
  | { [key: string]: JsonValue }

export type BlockBase = { _key: string; _type: string }
export type AnyBlock = BlockBase & { [key: string]: JsonValue }

export type Seo = {
  title?: string
  description?: string
  image?: SanityImage
  noIndex?: boolean
}

export type PageDoc = {
  _id: string
  title: string
  slug: string
  blocks: Array<AnyBlock> | null
  seo?: Seo
}

export type Newsletter = {
  provider?: 'mailchimp' | 'buttondown' | 'convertkit' | 'klaviyo' | 'generic'
  actionUrl?: string
}

export type SiteSettings = {
  siteName?: string
  logo?: SanityImage
  nav?: Array<Link>
  footerText?: string
  social?: Array<Link>
  analyticsId?: string
  seo?: Seo
  contactEmail?: string
  newsletter?: Newsletter
}

/* Portable Text as plain JSON (server functions require serialisable shapes). */
export type RichTextValue = Array<AnyBlock>

/* Content types (docs/10-template-v2.md). Card* shapes are what index blocks receive;
   the detail shapes are what routes receive. */
export type ArtistRef = { _id: string; name: string; slug: string }

export type ArtworkCard = {
  _id: string
  title: string
  slug: string
  year?: number
  date?: string
  collection?: string
  medium?: string
  image?: SanityImage
  artist?: ArtistRef
  tags?: Array<string>
}
export type ArtworkDoc = ArtworkCard & {
  caption?: Array<AnyBlock>
  dimensions?: string
  images?: Array<SanityImage>
  description?: RichTextValue
  exhibitions?: Array<{ _id: string; title: string; slug: string }>
  seo?: Seo
}

export type ArtistDoc = ArtistRef & {
  portrait?: SanityImage
  bio?: RichTextValue
  links?: Array<Link>
  artworks?: Array<ArtworkCard>
  seo?: Seo
}

export type ExhibitionCard = {
  _id: string
  title: string
  slug: string
  start: string
  end?: string
  venue?: string
  image?: SanityImage
  artists?: Array<ArtistRef>
}
export type ExhibitionDoc = ExhibitionCard & {
  body?: RichTextValue
  images?: Array<SanityImage>
  artworks?: Array<ArtworkCard>
  pressLinks?: Array<Link>
  pressRelease?: { url: string; label?: string }
  seo?: Seo
}

export type EventCard = {
  _id: string
  title: string
  slug: string
  start: string
  end?: string
  allDay?: boolean
  location?: string
  price?: string
  image?: SanityImage
  series?: { _id: string; title: string; slug: string }
}
export type EventDoc = EventCard & {
  ticketUrl?: string
  body?: RichTextValue
  seo?: Seo
}

export type PostCard = {
  _id: string
  title: string
  slug: string
  date: string
  excerpt?: string
  image?: SanityImage
  tags?: Array<string>
}
export type PostDoc = PostCard & { body?: RichTextValue; seo?: Seo }
