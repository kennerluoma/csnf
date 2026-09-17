import { blockSchemas } from '../../blocks/schemas'
import {
  artist,
  artwork,
  event,
  eventSeries,
  exhibition,
  post,
  submission,
  venue,
} from './documents'
import { imageWithAlt, link, richText, seo } from './objects'
import { page } from './page'
import { siteSettings } from './siteSettings'

export const schemaTypes = [
  link,
  imageWithAlt,
  richText,
  seo,
  page,
  artist,
  artwork,
  exhibition,
  eventSeries,
  event,
  venue,
  post,
  submission,
  siteSettings,
  ...blockSchemas,
]
