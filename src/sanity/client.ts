import { createClient } from '@sanity/client'
import { apiVersion, dataset, projectId } from './env'

// `caches` (the Workers Cache API) exists only in a deployed Worker handling a real request, not
// during the Node-based prerender/build step — the same signal src/server.ts already uses to
// tell the two apart. A content-publish webhook triggers a rebuild right away, and the Sanity API
// CDN can still serve the pre-edit response for a short window after that; reading through the
// CDN at build time can bake the old content into static pages, with nothing left to trigger
// another rebuild. Runtime ISR renders keep the CDN — that window is already bounded by the ISR
// cache's own freshness policy.
const useCdn = typeof caches !== 'undefined'

export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn,
  perspective: 'published',
})
