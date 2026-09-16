/* Block registry: schema name → React component. Schemas live in ./schemas.ts.
   The build agent appends here AND in schemas.ts. Keep entries alphabetical. */
import type { ComponentType } from 'react'
import { CardGrid } from './CardGrid/CardGrid'
import { Hero } from './Hero/Hero'
import { RichTextBlock } from './RichText/RichText'

export const blockComponents: Record<string, ComponentType<any>> = {
  cardGrid: CardGrid,
  hero: Hero,
  richTextBlock: RichTextBlock,
}
