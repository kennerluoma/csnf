import { defineCliConfig } from 'sanity/cli'

export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID,
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  },
  autoUpdates: false,
  typegen: {
    path: '../src/sanity/queries.gen.ts',
    schema: '../node_modules/.cache/typegen/schema.json',
    generates: '../src/sanity/sanity.types.ts',
    overloadClientMethods: true,
  },
})
