import { defineField, defineType } from '@sanity/types'

export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Site settings',
  type: 'document',
  fields: [
    defineField({ name: 'siteName', type: 'string' }),
    defineField({ name: 'logo', type: 'imageWithAlt' }),
    defineField({
      name: 'nav',
      title: 'Navigation',
      type: 'array',
      of: [{ type: 'link' }],
    }),
    defineField({ name: 'footerText', type: 'string' }),
  ],
})
