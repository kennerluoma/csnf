import { defineField, defineType } from '@sanity/types'

export const exhibitionListSchema = defineType({
  name: 'exhibitionList',
  title: 'Exhibition list',
  type: 'object',
  description:
    'Index of exhibition documents split into current / upcoming / past by date. Use for any "Exhibitions", "On now" or "Programme" section. `mode` picks which groups to show.',
  fields: [
    defineField({ name: 'eyebrow', type: 'string' }),
    defineField({ name: 'heading', type: 'string' }),
    defineField({
      name: 'mode',
      type: 'string',
      options: {
        list: [
          { title: 'Current only', value: 'current' },
          { title: 'Current + upcoming', value: 'currentUpcoming' },
          { title: 'All (current, upcoming, past)', value: 'all' },
          { title: 'Past only', value: 'past' },
        ],
        layout: 'radio',
      },
      initialValue: 'all',
    }),
    defineField({ name: 'pastLimit', type: 'number', initialValue: 12 }),
    defineField({ name: 'cta', type: 'link' }),
  ],
  preview: {
    select: { title: 'heading', mode: 'mode' },
    prepare: ({ title, mode }) => ({
      title: title ?? 'Exhibitions',
      subtitle: `Exhibition list · ${mode ?? 'all'}`,
    }),
  },
})

export const exhibitionListProjection = /* groq */ `_type == "exhibitionList" => { eyebrow, heading, mode, pastLimit, cta }`
