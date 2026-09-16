import type { PortableTextBlock } from '@portabletext/react'

export type SanityImage = {
  _type: 'image'
  asset?: { _ref: string; _type: 'reference' }
  alt?: string
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

export type PageDoc = {
  _id: string
  title: string
  slug: string
  blocks: Array<AnyBlock> | null
}

export type SiteSettings = {
  siteName?: string
  logo?: SanityImage
  nav?: Array<Link>
  footerText?: string
}

export type RichTextValue = Array<PortableTextBlock>
