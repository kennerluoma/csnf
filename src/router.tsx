import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    // Links preload when they scroll into view: the route chunk plus its loader data, which is a
    // static JSON file (src/lib/staticData.ts), so a click has nothing left to wait for.
    defaultPreload: 'viewport',
    defaultPreloadStaleTime: 5 * 60_000,
    defaultStaleTime: 5 * 60_000,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
