export const projectId = import.meta.env.VITE_SANITY_PROJECT_ID ?? ''
export const dataset = import.meta.env.VITE_SANITY_DATASET || 'production'
export const apiVersion = '2026-09-01'

if (!projectId) {
  throw new Error(
    'VITE_SANITY_PROJECT_ID is not set. Copy .env.example to .env.',
  )
}
