import { createFileRoute } from '@tanstack/react-router'
import { toIcs } from '#/lib/dates'
import { client } from '#/sanity/client'
import { eventBySlugQuery, siteSettingsQuery } from '#/sanity/queries'
import type { EventDoc, SiteSettings } from '#/sanity/types'

/* One event as an .ics download ("Add to calendar"). */
export const Route = createFileRoute('/ics/event/$slug')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const [e, settings] = await Promise.all([
          client.fetch<EventDoc | null>(eventBySlugQuery, {
            slug: params.slug,
          }),
          client.fetch<SiteSettings | null>(siteSettingsQuery),
        ])
        if (!e) return new Response('not found', { status: 404 })
        const ics = toIcs(
          [
            {
              ...e,
              description: [e.series?.title, e.price, e.ticketUrl]
                .filter(Boolean)
                .join(' · '),
            },
          ],
          {
            name: settings?.siteName ?? 'Events',
            origin: new URL(request.url).origin,
          },
        )
        return new Response(ics, {
          headers: {
            'content-type': 'text/calendar; charset=utf-8',
            'content-disposition': `attachment; filename="${e.slug}.ics"`,
          },
        })
      },
    },
  },
})
