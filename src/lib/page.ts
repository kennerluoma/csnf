import { createServerFn } from '@tanstack/react-start'
import { client } from '#/sanity/client'
import { pageBySlugQuery, siteSettingsQuery } from '#/sanity/queries'
import type { PageDoc, SiteSettings } from '#/sanity/types'

export const getPage = createServerFn({ method: 'GET' })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    return client.fetch<PageDoc | null>(pageBySlugQuery, { slug })
  })

export const getSiteSettings = createServerFn({ method: 'GET' }).handler(
  async () => {
    return client.fetch<SiteSettings | null>(siteSettingsQuery)
  },
)
