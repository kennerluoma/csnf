import { createServerFn } from '@tanstack/react-start'
import { resolveBlocks } from '#/blocks/resolvers'
import { defaultPage } from '#/lib/defaults'
import { staticData } from '#/lib/staticData'
import { client } from '#/sanity/client'
import {
  artistBySlugQuery,
  artworkBySlugQuery,
  eventBySlugQuery,
  exhibitionBySlugQuery,
  pageBySlugQuery,
  postBySlugQuery,
  siteSettingsQuery,
} from '#/sanity/queries'
import type {
  ArtistDoc,
  ArtworkDoc,
  EventDoc,
  ExhibitionDoc,
  PageDoc,
  PostDoc,
  SiteSettings,
} from '#/sanity/types'

export type PageInput = {
  slug: string
  search?: Record<string, string | undefined>
}

/* A page = its document + resolved data for list blocks. Falls back to a default index page
   (src/lib/defaults.ts) when the slug is a content index the designer didn't draw. */
export const getPage = createServerFn({ method: 'GET' })
  .middleware([staticData])
  .inputValidator((input: PageInput) => input)
  .handler(async ({ data: { slug, search = {} } }) => {
    const [doc, settings] = await Promise.all([
      client.fetch<PageDoc | null>(pageBySlugQuery, { slug }),
      client.fetch<SiteSettings | null>(siteSettingsQuery),
    ])
    const page = doc ?? defaultPage(slug)
    if (!page) return { page: null, settings }
    const path = slug === 'home' ? '/' : `/${slug}`
    return {
      page: {
        ...page,
        blocks: await resolveBlocks(page.blocks, { path, search, settings }),
      },
      settings,
    }
  })

export const getSiteSettings = createServerFn({ method: 'GET' })
  .middleware([staticData])
  .handler(async () => {
    return client.fetch<SiteSettings | null>(siteSettingsQuery)
  })

async function docBySlug<T>(query: string, slug: string) {
  const [doc, settings] = await Promise.all([
    client.fetch<T | null>(query, { slug }),
    client.fetch<SiteSettings | null>(siteSettingsQuery),
  ])
  return { doc: doc as T, settings, found: !!doc }
}
const slugInput = (slug: string) => slug

export const getArtwork = createServerFn({ method: 'GET' })
  .middleware([staticData])
  .inputValidator(slugInput)
  .handler(({ data }) => docBySlug<ArtworkDoc>(artworkBySlugQuery, data))
export const getArtist = createServerFn({ method: 'GET' })
  .middleware([staticData])
  .inputValidator(slugInput)
  .handler(({ data }) => docBySlug<ArtistDoc>(artistBySlugQuery, data))
export const getExhibition = createServerFn({ method: 'GET' })
  .middleware([staticData])
  .inputValidator(slugInput)
  .handler(({ data }) => docBySlug<ExhibitionDoc>(exhibitionBySlugQuery, data))
export const getEvent = createServerFn({ method: 'GET' })
  .middleware([staticData])
  .inputValidator(slugInput)
  .handler(({ data }) => docBySlug<EventDoc>(eventBySlugQuery, data))
export const getPost = createServerFn({ method: 'GET' })
  .middleware([staticData])
  .inputValidator(slugInput)
  .handler(({ data }) => docBySlug<PostDoc>(postBySlugQuery, data))
