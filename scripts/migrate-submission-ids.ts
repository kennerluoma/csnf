/* One-off migration: existing `submission` docs were created with an auto-generated root-level
   _id, which is world-readable in a public dataset (see docs/handoff/review/starter.md #1).
   Re-creates each one under a dotted `submissions.<uuid>` _id and deletes the old document.
   Not run automatically — review the dry-run output before passing --apply.
   Run: pnpm exec node --env-file=.env --experimental-strip-types scripts/migrate-submission-ids.ts [--apply]
   (needs VITE_SANITY_PROJECT_ID, VITE_SANITY_DATASET, SANITY_WRITE_TOKEN in .env) */
import { createClient } from '@sanity/client'
import type { IdentifiedSanityDocumentStub } from '@sanity/client'

type SubmissionDoc = {
  _id: string
  _rev: string
  _type: 'submission'
} & Record<string, unknown>

const projectId = process.env.VITE_SANITY_PROJECT_ID
const dataset = process.env.VITE_SANITY_DATASET || 'production'
const token = process.env.SANITY_WRITE_TOKEN
if (!projectId || !token)
  throw new Error('Missing VITE_SANITY_PROJECT_ID or SANITY_WRITE_TOKEN')

const client = createClient({
  projectId,
  dataset,
  token,
  apiVersion: '2026-09-01',
  useCdn: false,
})

const apply = process.argv.includes('--apply')

const stale = await client.fetch<Array<SubmissionDoc>>(
  `*[_type == "submission" && !(_id match "submissions.*")]`,
)

if (stale.length === 0) {
  console.log('No submission documents need migrating.')
  process.exit(0)
}

const renames = stale.map((doc) => ({
  oldId: doc._id,
  newId: `submissions.${crypto.randomUUID()}`,
  doc,
}))

console.log(
  `${apply ? 'Migrating' : 'Would migrate'} ${stale.length} submission document(s) in ${projectId}/${dataset}:`,
)
for (const { oldId, newId } of renames) console.log(`  ${oldId} -> ${newId}`)

if (!apply) {
  console.log('\nDry run only. Re-run with --apply to write changes.')
  process.exit(0)
}

const tx = renames.reduce((t, { oldId, newId, doc }) => {
  const { _id: _oldId, _rev: _oldRev, ...rest } = doc
  const replacement: IdentifiedSanityDocumentStub = { ...rest, _id: newId }
  return t.createOrReplace(replacement).delete(oldId)
}, client.transaction())

const res = await tx.commit()
console.log(`Migrated ${stale.length} document(s).`, res)
