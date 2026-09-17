import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { SiteFooter } from '#/lib/SiteFooter'
import { SiteHeader } from '#/lib/SiteHeader'
import { getSiteSettings } from '#/lib/page'
import { seoMeta } from '#/lib/seo'
import appCss from '#/styles/app.css?url'
import { Container, Heading, Section, Stack, Text } from '#/ui'

export const Route = createRootRoute({
  loader: () => getSiteSettings(),
  head: ({ loaderData: settings }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ...seoMeta({}, settings),
    ],
    scripts: analyticsScripts(settings?.analyticsId),
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  shellComponent: RootDocument,
  component: RootLayout,
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <Section>
      <Container>
        <Stack gap="sm">
          <Heading level={1}>Page not found</Heading>
          <Text muted>
            The page you were looking for doesn't exist.{' '}
            <a href="/">Go to the front page</a>.
          </Text>
        </Stack>
      </Container>
    </Section>
  )
}

/* Cloudflare Web Analytics token (32 hex chars) or a GA4 measurement id (G-XXXX). */
function analyticsScripts(id?: string) {
  if (!id) return []
  if (/^G-/.test(id))
    return [
      { src: `https://www.googletagmanager.com/gtag/js?id=${id}`, async: true },
      {
        children: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${id}')`,
      },
    ]
  return [
    {
      src: 'https://static.cloudflareinsights.com/beacon.min.js',
      defer: true,
      'data-cf-beacon': JSON.stringify({ token: id }),
    },
  ]
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="app">{children}</div>
        <Scripts />
      </body>
    </html>
  )
}

/* Site chrome from the `siteSettings` document around every page. */
function RootLayout() {
  const settings = Route.useLoaderData()
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader settings={settings} />
      <div className="flex-1">
        <Outlet />
      </div>
      <SiteFooter settings={settings} />
    </div>
  )
}
