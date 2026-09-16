/* Block schemas + GROQ projections only. No React here: the studio imports this file.
   The build agent appends here AND in registry.ts. Keep entries alphabetical by schema name. */
import type { SchemaTypeDefinition } from '@sanity/types'
import { cardGridProjection, cardGridSchema } from './CardGrid/CardGrid.schema'
import { heroProjection, heroSchema } from './Hero/Hero.schema'
import {
  richTextBlockProjection,
  richTextBlockSchema,
} from './RichText/RichText.schema'

export const blockSchemaEntries: Array<{
  schema: SchemaTypeDefinition
  projection: string
}> = [
  { schema: cardGridSchema, projection: cardGridProjection },
  { schema: heroSchema, projection: heroProjection },
  { schema: richTextBlockSchema, projection: richTextBlockProjection },
]

export const blockSchemas = blockSchemaEntries.map((b) => b.schema)
export const blockSchemaNames = blockSchemaEntries.map((b) => b.schema.name)
export const blockProjections = blockSchemaEntries
  .map((b) => b.projection)
  .join(',\n  ')
