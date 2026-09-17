import { defineField, defineType } from '@sanity/types'

export const eventCalendarSchema = defineType({
  name: 'eventCalendar',
  title: 'Event calendar',
  type: 'object',
  description:
    'Index of event documents as a month grid and/or upcoming list, filterable by series (?series=) and month (?month=YYYY-MM). Use for any "Events", "What\'s on" or "Calendar" section.',
  fields: [
    defineField({ name: 'eyebrow', type: 'string' }),
    defineField({ name: 'heading', type: 'string' }),
    defineField({
      name: 'view',
      type: 'string',
      options: {
        list: [
          { title: 'List of upcoming events', value: 'list' },
          { title: 'Month grid', value: 'month' },
          { title: 'Both (grid, then list)', value: 'both' },
        ],
        layout: 'radio',
      },
      initialValue: 'both',
    }),
    defineField({
      name: 'limit',
      type: 'number',
      description: 'Upcoming list length',
      initialValue: 12,
    }),
    defineField({ name: 'showFilters', type: 'boolean', initialValue: true }),
    defineField({ name: 'cta', type: 'link' }),
  ],
  preview: {
    select: { title: 'heading', view: 'view' },
    prepare: ({ title, view }) => ({
      title: title ?? 'Events',
      subtitle: `Event calendar · ${view ?? 'both'}`,
    }),
  },
})

export const eventCalendarProjection = /* groq */ `_type == "eventCalendar" => { eyebrow, heading, view, limit, showFilters, cta }`
