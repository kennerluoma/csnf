/* Ambient types for values that arrive from outside TypeScript, declared once so no call site
   needs an assertion. */

/* Vite env (public values; see .env.example / .env.production). */
interface ImportMetaEnv {
  readonly VITE_SANITY_PROJECT_ID?: string
  readonly VITE_SANITY_DATASET?: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}

/* Cloudflare Workers expose the zone cache as `caches.default`; absent in Node (dev, prerender). */
interface CacheStorage {
  readonly default?: Cache
}

/* Loader results gathered by src/lib/staticData.ts under the local preview server. */
declare var __staticData: Map<string, unknown> | undefined

/* Vite `define` in vite.config.ts: the commit sha (GITHUB_SHA in CI) or a build timestamp. Used
   to key the ISR cache per deploy, not per URL alone. */
declare const __BUILD_ID__: string
