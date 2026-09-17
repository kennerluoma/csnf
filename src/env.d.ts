/* Ambient types for values that arrive from outside TypeScript, declared once so no call site
   needs an assertion. */

/* Vite env (public values; see .env.example / .env.production). */
interface ImportMetaEnv {
  readonly VITE_SANITY_PROJECT_ID?: string
  readonly VITE_SANITY_DATASET?: string
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
