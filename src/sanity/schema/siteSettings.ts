import { defineField, defineType } from '@sanity/types'

export const siteSettings = defineType({
  name: 'siteSettings',
  title: 'Site settings',
  type: 'document',
  groups: [
    { name: 'site', title: 'Site', default: true },
    { name: 'seo', title: 'SEO' },
    { name: 'forms', title: 'Forms & newsletter' },
  ],
  fields: [
    defineField({ name: 'siteName', type: 'string', group: 'site' }),
    defineField({ name: 'logo', type: 'imageWithAlt', group: 'site' }),
    defineField({
      name: 'nav',
      title: 'Navigation',
      type: 'array',
      of: [{ type: 'link' }],
      group: 'site',
    }),
    defineField({ name: 'footerText', type: 'string', group: 'site' }),
    defineField({
      name: 'social',
      title: 'Social links',
      type: 'array',
      of: [{ type: 'link' }],
      group: 'site',
    }),
    defineField({
      name: 'analyticsId',
      type: 'string',
      description:
        'Optional. A Cloudflare Web Analytics token or GA4 measurement id.',
      group: 'site',
    }),
    defineField({
      name: 'seo',
      title: 'Default SEO',
      type: 'seo',
      description: 'Used when a page has no SEO fields of its own.',
      group: 'seo',
    }),
    defineField({
      name: 'contactEmail',
      type: 'string',
      description: 'Where contact form submissions are sent.',
      group: 'forms',
    }),
    defineField({
      name: 'newsletter',
      type: 'object',
      group: 'forms',
      description:
        "The client's existing provider. We only post the email to their form URL.",
      fields: [
        defineField({
          name: 'provider',
          type: 'string',
          options: {
            list: [
              { title: 'Mailchimp', value: 'mailchimp' },
              { title: 'Buttondown', value: 'buttondown' },
              { title: 'ConvertKit (Kit)', value: 'convertkit' },
              { title: 'Klaviyo', value: 'klaviyo' },
              { title: 'Other (email field named "email")', value: 'generic' },
            ],
          },
        }),
        defineField({
          name: 'actionUrl',
          type: 'url',
          description:
            'The form action URL from the provider (Mailchimp: "…/subscribe/post?u=…&id=…").',
        }),
      ],
    }),
  ],
})
