/* Content types most clients need (docs/10-template-v2.md). Index pages are blocks
   (artworkGrid, exhibitionList, eventCalendar, postList); detail routes live in src/routes. */
import { defineField, defineType } from '@sanity/types'
import type { PreviewValue } from '@sanity/types'
import { importedFields, importedFieldset } from './objects'

/* A selected image field handed straight back as the preview's media: Sanity's own type for that slot. */
type Media = PreviewValue['media']

const slugField = (source = 'title') =>
  defineField({
    name: 'slug',
    type: 'slug',
    options: { source },
    validation: (r) => r.required(),
  })
const seoField = defineField({ name: 'seo', type: 'seo' })

export const artist = defineType({
  name: 'artist',
  title: 'Artist',
  type: 'document',
  fieldsets: [importedFieldset],
  fields: [
    defineField({
      name: 'name',
      type: 'string',
      validation: (r) => r.required(),
    }),
    slugField('name'),
    defineField({ name: 'portrait', type: 'imageWithAlt' }),
    defineField({ name: 'bio', type: 'richText' }),
    defineField({ name: 'links', type: 'array', of: [{ type: 'link' }] }),
    seoField,
    ...importedFields,
  ],
  preview: { select: { title: 'name', media: 'portrait' } },
})

export const artwork = defineType({
  name: 'artwork',
  title: 'Artwork',
  type: 'document',
  fieldsets: [importedFieldset],
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      validation: (r) => r.required(),
    }),
    slugField(),
    defineField({
      name: 'artist',
      type: 'reference',
      to: [{ type: 'artist' }],
    }),
    defineField({
      name: 'collection',
      type: 'string',
      description:
        'Group works the way the artist does: Paintings, Works on Paper, Sculpture… Index blocks and routes can filter by it.',
      options: {
        list: [
          'Paintings',
          'Works on Paper',
          'Sculpture',
          'Photography',
          'Video',
          'Other',
        ],
      },
      initialValue: 'Paintings',
    }),
    defineField({ name: 'year', type: 'number' }),
    defineField({
      name: 'date',
      type: 'date',
      description: 'Optional exact date (sorts before year).',
    }),
    defineField({ name: 'medium', type: 'string' }),
    defineField({
      name: 'dimensions',
      type: 'string',
      description: 'Free text, e.g. 120 × 90 cm',
    }),
    defineField({
      name: 'images',
      type: 'array',
      of: [{ type: 'imageWithAlt' }],
      validation: (r) => r.min(1),
    }),
    defineField({
      name: 'caption',
      type: 'array',
      of: [{ type: 'block', styles: [], lists: [] }],
      description:
        'Freeform caption shown with the work ("Oil on linen, 2024. Courtesy …") when the structured fields are not enough.',
    }),
    defineField({ name: 'description', type: 'richText' }),
    defineField({
      name: 'exhibitions',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'exhibition' }] }],
    }),
    defineField({
      name: 'tags',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
    }),
    defineField({ name: 'featured', type: 'boolean', initialValue: false }),
    seoField,
    ...importedFields,
  ],
  orderings: [
    {
      title: 'Year, newest',
      name: 'yearDesc',
      by: [{ field: 'year', direction: 'desc' }],
    },
  ],
  preview: {
    select: {
      title: 'title',
      artistName: 'artist.name',
      year: 'year',
      media: 'images.0',
    },
    prepare: ({
      title,
      artistName,
      year,
      media,
    }: {
      title?: string
      artistName?: string
      year?: number
      media?: Media
    }) => ({
      title,
      subtitle: [artistName, year].filter(Boolean).join(' · '),
      media,
    }),
  },
})

export const exhibition = defineType({
  name: 'exhibition',
  title: 'Exhibition',
  type: 'document',
  fieldsets: [importedFieldset],
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      validation: (r) => r.required(),
    }),
    slugField(),
    defineField({
      name: 'start',
      type: 'date',
      validation: (r) => r.required(),
    }),
    defineField({ name: 'end', type: 'date' }),
    defineField({ name: 'venue', type: 'string' }),
    defineField({
      name: 'artists',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'artist' }] }],
    }),
    defineField({
      name: 'artworks',
      type: 'array',
      of: [{ type: 'reference', to: [{ type: 'artwork' }] }],
    }),
    defineField({ name: 'image', type: 'imageWithAlt' }),
    defineField({ name: 'body', type: 'richText' }),
    defineField({
      name: 'images',
      type: 'array',
      of: [{ type: 'imageWithAlt' }],
    }),
    defineField({ name: 'pressLinks', type: 'array', of: [{ type: 'link' }] }),
    defineField({ name: 'pressRelease', type: 'file', description: 'PDF' }),
    defineField({
      name: 'pressReleaseLabel',
      type: 'string',
      description: 'Link text; defaults to "Press release".',
    }),
    seoField,
    ...importedFields,
  ],
  orderings: [
    {
      title: 'Start, newest',
      name: 'startDesc',
      by: [{ field: 'start', direction: 'desc' }],
    },
  ],
  preview: {
    select: { title: 'title', start: 'start', end: 'end', media: 'image' },
    prepare: ({
      title,
      start,
      end,
      media,
    }: {
      title?: string
      start?: string
      end?: string
      media?: Media
    }) => ({
      title,
      subtitle: [start, end].filter(Boolean).join(' → '),
      media,
    }),
  },
})

export const venue = defineType({
  name: 'venue',
  title: 'Venue',
  type: 'document',
  description:
    'A place events happen at. Events reference it; one-off locations can stay free text.',
  fieldsets: [importedFieldset],
  fields: [
    defineField({
      name: 'name',
      type: 'string',
      validation: (r) => r.required(),
    }),
    slugField('name'),
    defineField({ name: 'address', type: 'text', rows: 3 }),
    defineField({ name: 'mapLink', type: 'url' }),
    ...importedFields,
  ],
  preview: { select: { title: 'name', subtitle: 'address' } },
})

export const eventSeries = defineType({
  name: 'eventSeries',
  title: 'Event series',
  type: 'document',
  description:
    'A category for events (talks, workshops, openings). Used as a calendar filter.',
  fieldsets: [importedFieldset],
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      validation: (r) => r.required(),
    }),
    slugField(),
    defineField({ name: 'description', type: 'text', rows: 2 }),
    ...importedFields,
  ],
})

export const event = defineType({
  name: 'event',
  title: 'Event',
  type: 'document',
  fieldsets: [importedFieldset],
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      validation: (r) => r.required(),
    }),
    slugField(),
    defineField({
      name: 'start',
      type: 'datetime',
      validation: (r) => r.required(),
    }),
    defineField({ name: 'end', type: 'datetime' }),
    defineField({ name: 'allDay', type: 'boolean', initialValue: false }),
    defineField({ name: 'venue', type: 'reference', to: [{ type: 'venue' }] }),
    defineField({
      name: 'location',
      type: 'string',
      description:
        'Free text when there is no venue document (or a room within one).',
    }),
    defineField({
      name: 'price',
      type: 'string',
      description: 'Free text, e.g. "Free" or "€12"',
    }),
    defineField({ name: 'ticketUrl', type: 'url' }),
    defineField({
      name: 'series',
      type: 'reference',
      to: [{ type: 'eventSeries' }],
    }),
    defineField({ name: 'image', type: 'imageWithAlt' }),
    defineField({ name: 'body', type: 'richText' }),
    seoField,
    ...importedFields,
  ],
  orderings: [
    {
      title: 'Start, soonest',
      name: 'startAsc',
      by: [{ field: 'start', direction: 'asc' }],
    },
  ],
  preview: {
    select: {
      title: 'title',
      start: 'start',
      series: 'series.title',
      media: 'image',
    },
    prepare: ({
      title,
      start,
      series,
      media,
    }: {
      title?: string
      start?: string
      series?: string
      media?: Media
    }) => ({
      title,
      subtitle: [start?.slice(0, 10), series].filter(Boolean).join(' · '),
      media,
    }),
  },
})

export const post = defineType({
  name: 'post',
  title: 'News post',
  type: 'document',
  fieldsets: [importedFieldset],
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      validation: (r) => r.required(),
    }),
    slugField(),
    defineField({
      name: 'date',
      type: 'date',
      validation: (r) => r.required(),
      initialValue: () => new Date().toISOString().slice(0, 10),
    }),
    defineField({ name: 'excerpt', type: 'text', rows: 2 }),
    defineField({ name: 'image', type: 'imageWithAlt' }),
    defineField({ name: 'body', type: 'richText' }),
    defineField({
      name: 'tags',
      type: 'array',
      of: [{ type: 'string' }],
      options: { layout: 'tags' },
    }),
    seoField,
    ...importedFields,
  ],
  orderings: [
    {
      title: 'Date, newest',
      name: 'dateDesc',
      by: [{ field: 'date', direction: 'desc' }],
    },
  ],
  preview: { select: { title: 'title', subtitle: 'date', media: 'image' } },
})

/* Contact form submissions, written by /api/contact with a dotted `submissions.<uuid>` _id:
   the dataset is public (aclMode: 'public'), and Sanity hides namespaced/dotted ids from
   unauthenticated reads while Studio users with a token can still see them. Read-only in the admin. */
export const submission = defineType({
  name: 'submission',
  title: 'Contact submission',
  type: 'document',
  readOnly: true,
  fields: [
    defineField({ name: 'name', type: 'string' }),
    defineField({ name: 'email', type: 'string' }),
    defineField({ name: 'subject', type: 'string' }),
    defineField({ name: 'message', type: 'text' }),
    defineField({
      name: 'page',
      type: 'string',
      description: 'Path the form was sent from',
    }),
    defineField({ name: 'receivedAt', type: 'datetime' }),
  ],
  preview: {
    select: { title: 'name', subtitle: 'subject', date: 'receivedAt' },
    prepare: ({
      title,
      subtitle,
      date,
    }: {
      title?: string
      subtitle?: string
      date?: string
    }) => ({
      title: title ?? 'Anonymous',
      subtitle: [date?.slice(0, 16).replace('T', ' '), subtitle]
        .filter(Boolean)
        .join(' · '),
    }),
  },
})
