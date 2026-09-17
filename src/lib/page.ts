import { createServerFn } from '@tanstack/react-start'
import { resolveBlocks } from '#/blocks/resolvers'
import type { ResolvedBlock } from '#/blocks/resolvers'
import { defaultPage } from '#/lib/defaults'
import { staticData } from '#/lib/staticData'
import { client } from '#/sanity/client'
import { hasSlug } from '#/sanity/guards'
import {
  artistBySlugQuery,
  artworkBySlugQuery,
  eventBySlugQuery,
  exhibitionBySlugQuery,
  pageBySlugQuery,
  postBySlugQuery,
  siteSettingsQuery,
} from '#/sanity/queries.gen'
import type { PageDoc } from '#/sanity/types'
export type ResolvedPage = Omit<PageDoc, 'blocks'> & {
  blocks: Array<ResolvedBlock>
}

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
      client.fetch(pageBySlugQuery, { slug }),
      client.fetch(siteSettingsQuery),
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
    return client.fetch(siteSettingsQuery)
  })

/* Detail documents. `doc` is null when nothing matches (the route answers 404). The slug comes
   from the input, which the query matched, so it is a string here rather than `string | null`;
   events and exhibitions also need their start date to be shown at all. */
const slugInput = (slug: string) => slug
const settings = () => client.fetch(siteSettingsQuery)

export const getArtwork = createServerFn({ method: 'GET' })
  .middleware([staticData])
  .inputValidator(slugInput)
  .handler(async ({ data: slug }) => {
    const [doc, s] = await Promise.all([
      client.fetch(artworkBySlugQuery, { slug }),
      settings(),
    ])
    return { doc: doc && { ...doc, slug }, settings: s }
  })
export const getArtist = createServerFn({ method: 'GET' })
  .middleware([staticData])
  .inputValidator(slugInput)
  .handler(async ({ data: slug }) => {
    const [doc, s] = await Promise.all([
      client.fetch(artistBySlugQuery, { slug }),
      settings(),
    ])
    return {
      doc: doc && {
        ...doc,
        slug,
        artworks: doc.artworks.filter(hasSlug),
      },
      settings: s,
    }
  })
export const getExhibition = createServerFn({ method: 'GET' })
  .middleware([staticData])
  .inputValidator(slugInput)
  .handler(async ({ data: slug }) => {
    const [doc, s] = await Promise.all([
      client.fetch(exhibitionBySlugQuery, { slug }),
      settings(),
    ])
    return {
      doc:
        doc && doc.start !== null
          ? {
              ...doc,
              slug,
              start: doc.start,
              artworks: (doc.artworks ?? []).filter(hasSlug),
            }
          : null,
      settings: s,
    }
  })
export const getEvent = createServerFn({ method: 'GET' })
  .middleware([staticData])
  .inputValidator(slugInput)
  .handler(async ({ data: slug }) => {
    const [doc, s] = await Promise.all([
      client.fetch(eventBySlugQuery, { slug }),
      settings(),
    ])
    return {
      doc:
        doc && doc.start !== null ? { ...doc, slug, start: doc.start } : null,
      settings: s,
    }
  })
export const getPost = createServerFn({ method: 'GET' })
  .middleware([staticData])
  .inputValidator(slugInput)
  .handler(async ({ data: slug }) => {
    const [doc, s] = await Promise.all([
      client.fetch(postBySlugQuery, { slug }),
      settings(),
    ])
    return { doc: doc && { ...doc, slug }, settings: s }
  })
