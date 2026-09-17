import imageUrlBuilder from '@sanity/image-url'
import { dataset, projectId } from './env'
import type { SanityImage } from './types'

/* Config-only builder: keeps @sanity/client (and its request stack) out of the browser bundle.
   Server code that needs the client imports it from './client' directly. */
const builder = imageUrlBuilder({ projectId, dataset })
export const urlFor = (source: SanityImage) => builder.image(source)
