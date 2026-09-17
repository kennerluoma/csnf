/* Block schemas + GROQ projections only. No React here: the admin imports this file.
   The build agent appends here AND in registry.ts. Keep entries alphabetical by schema name.
   `pnpm inventory` regenerates the block table in AGENTS.md from this list. */
import type { SchemaTypeDefinition } from '@sanity/types'
import {
  artistListProjection,
  artistListSchema,
} from './ArtistList/ArtistList.schema'
import {
  artworkGridProjection,
  artworkGridSchema,
} from './ArtworkGrid/ArtworkGrid.schema'
import { cardGridProjection, cardGridSchema } from './CardGrid/CardGrid.schema'
import {
  contactFormProjection,
  contactFormSchema,
} from './ContactForm/ContactForm.schema'
import {
  eventCalendarProjection,
  eventCalendarSchema,
} from './EventCalendar/EventCalendar.schema'
import {
  exhibitionListProjection,
  exhibitionListSchema,
} from './ExhibitionList/ExhibitionList.schema'
import { heroProjection, heroSchema } from './Hero/Hero.schema'
import {
  newsletterSignupProjection,
  newsletterSignupSchema,
} from './NewsletterSignup/NewsletterSignup.schema'
import { postListProjection, postListSchema } from './PostList/PostList.schema'
import {
  richTextBlockProjection,
  richTextBlockSchema,
} from './RichText/RichText.schema'

export const blockSchemaEntries: Array<{
  schema: SchemaTypeDefinition
  projection: string
}> = [
  { schema: artistListSchema, projection: artistListProjection },
  { schema: artworkGridSchema, projection: artworkGridProjection },
  { schema: cardGridSchema, projection: cardGridProjection },
  { schema: contactFormSchema, projection: contactFormProjection },
  { schema: eventCalendarSchema, projection: eventCalendarProjection },
  { schema: exhibitionListSchema, projection: exhibitionListProjection },
  { schema: heroSchema, projection: heroProjection },
  { schema: newsletterSignupSchema, projection: newsletterSignupProjection },
  { schema: postListSchema, projection: postListProjection },
  { schema: richTextBlockSchema, projection: richTextBlockProjection },
]

export const blockSchemas = blockSchemaEntries.map((b) => b.schema)
export const blockSchemaNames = blockSchemaEntries.map((b) => b.schema.name)
export const blockProjections = blockSchemaEntries
  .map((b) => b.projection)
  .join(',\n  ')
