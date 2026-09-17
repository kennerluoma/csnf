/* Block registry: schema name → React component. Schemas live in ./schemas.ts.
   The build agent appends here AND in schemas.ts. Keep entries alphabetical. */
import type { ComponentType } from 'react'
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

export const blockComponents: Record<string, ComponentType<any>> = {
  artistList: ArtistList,
  artworkGrid: ArtworkGrid,
  cardGrid: CardGrid,
  contactForm: ContactForm,
  eventCalendar: EventCalendar,
  exhibitionList: ExhibitionList,
  hero: Hero,
  newsletterSignup: NewsletterSignup,
  postList: PostList,
  richTextBlock: RichTextBlock,
}
