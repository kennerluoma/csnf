/* Head tags for every route. Falls back: document seo → document title/description/image →
   siteSettings.seo → site name. Returns the `meta` array TanStack Router's `head()` expects. */
import { urlFor } from '#/sanity/image'
import type { SanityImage, Seo, SiteSettings } from '#/sanity/types'

export type SeoInput = {
  title?: string
  description?: string
  image?: SanityImage
  seo?: Seo
  path?: string
  type?: 'website' | 'article'
}

export function seoMeta(
  doc: SeoInput,
  settings: SiteSettings | null | undefined,
) {
  const siteName = settings?.siteName ?? 'Site'
  const base = settings?.seo
  const title = doc.seo?.title ?? doc.title
  const fullTitle =
    title && title !== siteName ? `${title} · ${siteName}` : siteName
  const description =
    doc.seo?.description ?? doc.description ?? base?.description
  const image = doc.seo?.image ?? doc.image ?? base?.image
  const imageUrl = image?.asset
    ? urlFor(image).width(1200).height(630).fit('crop').auto('format').url()
    : undefined
  const meta: Array<Record<string, string>> = [
    { title: fullTitle },
    { property: 'og:title', content: fullTitle },
    { property: 'og:site_name', content: siteName },
    { property: 'og:type', content: doc.type ?? 'website' },
    {
      name: 'twitter:card',
      content: imageUrl ? 'summary_large_image' : 'summary',
    },
  ]
  if (description) {
    meta.push({ name: 'description', content: description })
    meta.push({ property: 'og:description', content: description })
  }
  if (imageUrl) meta.push({ property: 'og:image', content: imageUrl })
  if (doc.seo?.noIndex)
    meta.push({ name: 'robots', content: 'noindex, nofollow' })
  return meta
}
