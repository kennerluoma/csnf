import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'
import { SiteFooter } from '#/lib/SiteFooter'
import { SiteHeader } from '#/lib/SiteHeader'
import { getSiteSettings } from '#/lib/page'
import appCss from '#/styles/app.css?url'

export const Route = createRootRoute({
  loader: () => getSiteSettings(),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Site' },
    ],
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
})

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
