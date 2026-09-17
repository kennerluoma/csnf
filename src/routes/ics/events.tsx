import { createFileRoute } from '@tanstack/react-router'
import { toIcs } from '#/lib/dates'
import { client } from '#/sanity/client'
import { siteSettingsQuery, upcomingEventsQuery } from '#/sanity/queries.gen'
import type { EventCard, SiteSettings } from '#/sanity/types'

/* Subscribable calendar of upcoming events (optionally one series: ?series=<slug>). */
export const Route = createFileRoute('/ics/events')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const [events, settings] = await Promise.all([
          client.fetch<Array<EventCard>>(upcomingEventsQuery, {
            now: new Date(Date.now() - 30 * 86_400_000).toISOString(),
            series: url.searchParams.get('series') ?? '',
            limit: 500,
          }),
          client.fetch<SiteSettings | null>(siteSettingsQuery),
        ])
        const ics = toIcs(
          events.map((e) => ({
            ...e,
            description: [e.series?.title, e.price].filter(Boolean).join(' · '),
          })),
          { name: settings?.siteName ?? 'Events', origin: url.origin },
        )
        return new Response(ics, {
          headers: {
            'content-type': 'text/calendar; charset=utf-8',
            'cache-control': 'public, max-age=900',
          },
        })
      },
    },
  },
})
