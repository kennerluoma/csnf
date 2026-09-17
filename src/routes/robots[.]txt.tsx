import { createFileRoute } from '@tanstack/react-router'

/* Previews (*.workers.dev) are kept out of search; custom domains are indexed. */
export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url)
        const preview = url.hostname.endsWith('.workers.dev')
        const body = preview
          ? 'User-agent: *\nDisallow: /\n'
          : `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${url.origin}/sitemap.xml\n`
        return new Response(body, { headers: { 'content-type': 'text/plain' } })
      },
    },
  },
})
