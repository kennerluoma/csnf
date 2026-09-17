import { defineField, defineType } from '@sanity/types'

export const artistListSchema = defineType({
  name: 'artistList',
  title: 'Artist list',
  type: 'object',
  description:
    'Index of artist documents (portrait + name), alphabetical. Use for "Artists", "Represented artists" or "Roster" sections. Single-artist sites do not need it.',
  fields: [
    defineField({ name: 'eyebrow', type: 'string' }),
    defineField({ name: 'heading', type: 'string' }),
    defineField({
      name: 'columns',
      type: 'number',
      options: { list: [2, 3, 4] },
      initialValue: 4,
    }),
  ],
  preview: {
    select: { title: 'heading' },
    prepare: ({ title }: { title?: string }) => ({
      title: title ?? 'Artists',
      subtitle: 'Artist list',
    }),
  },
})

export const artistListProjection = /* groq */ `_type == "artistList" => { eyebrow, heading, columns }`
