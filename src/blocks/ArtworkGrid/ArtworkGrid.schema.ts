import { defineField, defineType } from '@sanity/types'

export const artworkGridSchema = defineType({
  name: 'artworkGrid',
  title: 'Artwork grid',
  type: 'object',
  description:
    'Index of artwork documents with optional filters (artist, year, medium, tag). Use for any "Work", "Collection" or "Selected works" section; items come from the CMS, not from the block.',
  fields: [
    defineField({ name: 'eyebrow', type: 'string' }),
    defineField({ name: 'heading', type: 'string' }),
    defineField({ name: 'intro', type: 'text', rows: 2 }),
    defineField({
      name: 'columns',
      type: 'number',
      options: { list: [2, 3, 4] },
      initialValue: 3,
    }),
    defineField({
      name: 'collection',
      type: 'string',
      description:
        'Only works in this collection (e.g. "Works on Paper"). Empty = all.',
    }),
    defineField({
      name: 'limit',
      type: 'number',
      description: 'Maximum items. Leave empty for all.',
    }),
    defineField({
      name: 'featuredOnly',
      type: 'boolean',
      description: 'Only artworks marked "featured" (for a home-page teaser).',
      initialValue: false,
    }),
    defineField({
      name: 'showFilters',
      type: 'boolean',
      description: 'Artist / year / medium / tag filters above the grid.',
      initialValue: true,
    }),
    defineField({
      name: 'cta',
      type: 'link',
      description: 'e.g. "View all work" → /work',
    }),
  ],
  preview: {
    select: { title: 'heading' },
    prepare: ({ title }) => ({
      title: title ?? 'Artwork grid',
      subtitle: 'Artwork grid',
    }),
  },
})

export const artworkGridProjection = /* groq */ `_type == "artworkGrid" => { eyebrow, heading, intro, columns, collection, limit, featuredOnly, showFilters, cta }`
