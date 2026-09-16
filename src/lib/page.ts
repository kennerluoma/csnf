import { createServerFn } from '@tanstack/react-start'
import { client } from '#/sanity/client'
import { pageBySlugQuery } from '#/sanity/queries'
import type { PageDoc } from '#/sanity/types'

export const getPage = createServerFn({ method: 'GET' })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    return client.fetch<PageDoc | null>(pageBySlugQuery, { slug })
  })
