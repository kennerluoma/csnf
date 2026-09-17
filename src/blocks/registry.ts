/* Block registry: schema name → React component. Schemas live in ./schemas.ts.
   The build agent appends here AND in schemas.ts: an import and a `case`. Keep both alphabetical.
   Narrowing on `_type` gives each component its own member of the block union (`Resolved<'hero'>`
   and so on), so a block's props are exactly what its projection and resolver produce. */
import { createElement } from 'react'
import type { ReactElement } from 'react'
import { ArtistList } from './ArtistList/ArtistList'
import { ArtworkGrid } from './ArtworkGrid/ArtworkGrid'
import { CardGrid } from './CardGrid/CardGrid'
import { ContactForm } from './ContactForm/ContactForm'
import { EventCalendar } from './EventCalendar/EventCalendar'
import { ExhibitionList } from './ExhibitionList/ExhibitionList'
import { Hero } from './Hero/Hero'
import { NewsletterSignup } from './NewsletterSignup/NewsletterSignup'
import { PostList } from './PostList/PostList'
import { RichTextBlock } from './RichText/RichText'
import type { ResolvedBlock } from './resolvers'

export function renderBlock(block: ResolvedBlock): ReactElement | null {
  switch (block._type) {
    case 'artistList':
      return createElement(ArtistList, block)
    case 'artworkGrid':
      return createElement(ArtworkGrid, block)
    case 'cardGrid':
      return createElement(CardGrid, block)
    case 'contactForm':
      return createElement(ContactForm, block)
    case 'eventCalendar':
      return createElement(EventCalendar, block)
    case 'exhibitionList':
      return createElement(ExhibitionList, block)
    case 'hero':
      return createElement(Hero, block)
    case 'newsletterSignup':
      return createElement(NewsletterSignup, block)
    case 'postList':
      return createElement(PostList, block)
    case 'richTextBlock':
      return createElement(RichTextBlock, block)
    default:
      // A block type in the dataset that this build has no component for (the union is exhausted).
      return unknownBlock(block)
  }
}

function unknownBlock(block: never): null {
  if (import.meta.env.DEV)
    console.warn('No block component registered for', block)
  return null
}
