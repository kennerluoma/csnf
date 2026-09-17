import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import type { StructureResolver } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { schemaTypes } from '../src/sanity/schema'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID!
const dataset = process.env.SANITY_STUDIO_DATASET || 'production'

/* Desk grouped the way clients think: Content, Collection, Programme, Site. Types a site
   doesn't use still appear (empty); hide a group by removing it here. */
const structure: StructureResolver = (S) =>
  S.list()
    .title('Content')
    .items([
      S.listItem()
        .title('Pages')
        .child(S.documentTypeList('page').title('Pages')),
      S.listItem()
        .title('News')
        .child(S.documentTypeList('post').title('News')),
      S.divider(),
      S.listItem()
        .title('Artworks')
        .child(S.documentTypeList('artwork').title('Artworks')),
      S.listItem()
        .title('Artists')
        .child(S.documentTypeList('artist').title('Artists')),
      S.divider(),
      S.listItem()
        .title('Exhibitions')
        .child(S.documentTypeList('exhibition').title('Exhibitions')),
      S.listItem()
        .title('Events')
        .child(S.documentTypeList('event').title('Events')),
      S.listItem()
        .title('Event series')
        .child(S.documentTypeList('eventSeries').title('Event series')),
      S.divider(),
      S.listItem()
        .title('Site settings')
        .child(
          S.document().schemaType('siteSettings').documentId('siteSettings'),
        ),
      S.listItem()
        .title('Contact submissions')
        .child(
          S.documentTypeList('submission')
            .title('Contact submissions')
            .defaultOrdering([{ field: 'receivedAt', direction: 'desc' }]),
        ),
    ])

export default defineConfig({
  name: 'default',
  title: 'Site',
  projectId,
  dataset,
  plugins: [
    structureTool({ structure }),
    visionTool({ defaultApiVersion: '2026-09-01' }),
  ],
  schema: { types: schemaTypes },
  document: {
    // singletons and read-only types don't belong in the "create new" menu
    newDocumentOptions: (prev) =>
      prev.filter(
        (t) => !['siteSettings', 'submission'].includes(t.templateId),
      ),
  },
})
