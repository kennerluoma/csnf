import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart({
      // Every page reachable from `/` is rendered to static HTML at build time and served as an asset
      // (no Worker, no Sanity call). Content edits redeploy via the Sanity webhook (deploy.yml).
      // Routes with search params, /api and feeds stay server-rendered.
      // Query-string links (filters, months) are ISR territory: crawling them would render every
      // combination over the same index.html and exhaust memory.
      prerender: {
        enabled: true,
        crawlLinks: true,
        filter: (p) => !p.path.includes('?') && !/^\/(api|ics)\//.test(p.path),
      },
    }),
    viteReact(),
  ],
})

export default config
