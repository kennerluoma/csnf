import { defineField, defineType } from '@sanity/types'

export const heroSchema = defineType({
  name: 'hero',
  title: 'Hero',
  type: 'object',
  description:
    'Page-top statement: eyebrow, heading, body, one CTA, one image. `split` = text beside image; `panel` = centred in a tinted rounded panel. Use for the first section of any route.',
  fields: [
    defineField({
      name: 'layout',
      type: 'string',
      description:
        'Split: text beside the image. Panel: centred in a tinted rounded panel.',
      options: {
        list: [
          { title: 'Split', value: 'split' },
          { title: 'Panel', value: 'panel' },
        ],
        layout: 'radio',
      },
      initialValue: 'split',
    }),
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

export const heroProjection = /* groq */ `_type == "hero" => { layout, eyebrow, heading, body, cta, image }`
