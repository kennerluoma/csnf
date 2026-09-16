import { blockSchemas } from '../../blocks/schemas'
import { imageWithAlt, link, richText } from './objects'
import { page } from './page'
import { siteSettings } from './siteSettings'

export const schemaTypes = [
  link,
  imageWithAlt,
  richText,
  page,
  siteSettings,
  ...blockSchemas,
]
