import { defineField, defineType } from '@sanity/types'

export const heroSchema = defineType({
  name: 'hero',
  title: 'Hero',
  type: 'object',
  fields: [
    defineField({ name: 'eyebrow', type: 'string' }),
    defineField({
      name: 'heading',
      type: 'string',
      validation: (r) => r.required(),
    }),
    defineField({ name: 'body', type: 'text', rows: 3 }),
    defineField({ name: 'cta', type: 'link' }),
    defineField({ name: 'image', type: 'imageWithAlt' }),
  ],
  preview: {
    select: { title: 'heading' },
    prepare: ({ title }) => ({ title, subtitle: 'Hero' }),
  },
})

export const heroProjection = /* groq */ `_type == "hero" => { eyebrow, heading, body, cta, image }`
