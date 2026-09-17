import { createFileRoute } from '@tanstack/react-router'
import { defaultIndexSlugs } from '#/lib/defaults'
import { client } from '#/sanity/client'
import { hasSlug } from '#/sanity/guards'
import { sitemapQuery } from '#/sanity/queries.gen'
import type { SitemapQueryResult } from '#/sanity/sanity.types'

/* Default index page → the content it lists; it is in the sitemap only when there is some. */
const indexContent: Record<string, keyof SitemapQueryResult> = {
  work: 'artworks',
  artists: 'artists',
  exhibitions: 'exhibitions',
  events: 'events',
  news: 'posts',
}

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin
        const all = await client.fetch(sitemapQuery)
        const d = {
          pages: all.pages.filter(hasSlug),
          artworks: all.artworks.filter(hasSlug),
          artists: all.artists.filter(hasSlug),
          exhibitions: all.exhibitions.filter(hasSlug),
          events: all.events.filter(hasSlug),
          posts: all.posts.filter(hasSlug),
        }
        const urls: Array<{ loc: string; lastmod?: string }> = []
        const add = (path: string, lastmod?: string) =>
          urls.push({ loc: `${origin}${path}`, lastmod })
        for (const p of d.pages)
          add(p.slug === 'home' ? '/' : `/${p.slug}`, p._updatedAt)
        const pageSlugs = new Set(d.pages.map((p) => p.slug))
        const has = (k: keyof SitemapQueryResult | undefined) =>
          !!k && d[k].length > 0
        for (const s of defaultIndexSlugs)
          if (!pageSlugs.has(s) && has(indexContent[s])) add(`/${s}`)
        for (const a of d.artworks) add(`/work/${a.slug}`, a._updatedAt)
        for (const a of d.artists) add(`/artists/${a.slug}`, a._updatedAt)
        for (const e of d.exhibitions)
          add(`/exhibitions/${e.slug}`, e._updatedAt)
        for (const e of d.events) add(`/events/${e.slug}`, e._updatedAt)
        for (const p of d.posts) add(`/news/${p.slug}`, p._updatedAt)
        const xml =
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          urls
            .map(
              (u) =>
                `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod.slice(0, 10)}</lastmod>` : ''}</url>`,
            )
            .join('\n') +
          `\n</urlset>\n`
        return new Response(xml, {
          headers: {
            'content-type': 'application/xml',
            'cache-control': 'public, max-age=3600',
          },
        })
      },
    },
  },
})
