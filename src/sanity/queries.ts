import { blockProjections } from '#/blocks/schemas'

const blocks = `blocks[]{ _key, _type, ${blockProjections} }`

export const pageBySlugQuery = /* groq */ `*[_type == "page" && slug.current == $slug][0]{
  _id, title, "slug": slug.current, ${blocks}
}`

export const siteSettingsQuery = /* groq */ `*[_type == "siteSettings"][0]{
  siteName, logo, nav[]{label, href}, footerText
}`
