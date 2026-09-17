import { defineField, defineType } from '@sanity/types'
import { img } from '../../sanity/img'

export const cardGridSchema = defineType({
  name: 'cardGrid',
  title: 'Card grid',
  type: 'object',
  description:
    'Repeated cards (title, body, image, link) in 2–4 columns with an optional heading. Use for features, services, team, logos-with-captions: any hand-entered repeated item that is not a CMS document.',
  fields: [
    defineField({ name: 'eyebrow', type: 'string' }),
    defineField({ name: 'heading', type: 'string' }),
    defineField({
      name: 'columns',
      type: 'number',
      options: { list: [2, 3, 4] },
      initialValue: 3,
    }),
    defineField({
      name: 'cards',
      type: 'array',
      of: [
        {
          type: 'object',
          name: 'card',
          fields: [
            defineField({
              name: 'title',
              type: 'string',
              validation: (r) => r.required(),
            }),
            defineField({ name: 'body', type: 'text', rows: 3 }),
            defineField({ name: 'image', type: 'imageWithAlt' }),
            defineField({ name: 'link', type: 'link' }),
          ],
          preview: { select: { title: 'title', media: 'image' } },
        },
      ],
    }),
  ],
  preview: {
    select: { title: 'heading' },
    prepare: ({ title }: { title?: string }) => ({
      title: title ?? 'Card grid',
      subtitle: 'Card grid',
    }),
  },
})

export const cardGridProjection = /* groq */ `_type == "cardGrid" => { eyebrow, heading, columns, cards[]{ _key, title, body, ${img('image')}, link } }`
