import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { visionTool } from '@sanity/vision'
import { schemaTypes } from '../src/sanity/schema'

const projectId = process.env.SANITY_STUDIO_PROJECT_ID!
const dataset = process.env.SANITY_STUDIO_DATASET || 'production'

export default defineConfig({
  name: 'default',
  title: 'Site',
  projectId,
  dataset,
  plugins: [structureTool(), visionTool({ defaultApiVersion: '2026-09-01' })],
  schema: { types: schemaTypes },
})
