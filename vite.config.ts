import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import type { Plugin } from 'vite'

/* React Compiler is on for everything under src/. "On" is checked, not assumed: this counts the
   modules the compiler actually rewrote (they import react/compiler-runtime) and fails the build
   when there are none. `pnpm check:compiler` prints the list. */
function compilerCheck(): Plugin {
  const compiled = new Set<string>()
  return {
    name: 'agency:compiler-check',
    enforce: 'post',
    apply: 'build',
    applyToEnvironment: (env) => env.name === 'client',
    transform(code, id) {
      if (id.includes('/src/') && code.includes('react/compiler-runtime'))
        compiled.add(id)
    },
    buildEnd() {
      const files = [...compiled]
        .map((f) => f.slice(f.indexOf('/src/') + 1))
        .sort()
      if (!files.length)
        this.error(
          'React Compiler compiled 0 modules: it is not active. Check vite.config.ts.',
        )
      if (process.env.COMPILER_REPORT)
        console.log(
          `\nReact Compiler: ${files.length} modules\n  ${files.join('\n  ')}\n`,
        )
      else console.log(`React Compiler: ${files.length} modules compiled`)
    },
  }
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // Once stale-while-revalidate actually serves a cached response (src/server.ts), an entry can
  // outlive its own deploy by up to the swr window — the cache key must change on every deploy,
  // or day-old HTML would reference hashed /assets/* files a newer deploy already removed.
  define: {
    __BUILD_ID__: JSON.stringify(process.env.GITHUB_SHA ?? String(Date.now())),
  },
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
    babel({ presets: [reactCompilerPreset()] }),
    compilerCheck(),
  ],
})

export default config
