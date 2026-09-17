/* Post (or update) the one visual-check comment on a pull request. Run by CI after `pnpm visual`.
   Needs GITHUB_TOKEN with pull-requests: write, GITHUB_REPOSITORY and PR_NUMBER.
   Says nothing and exits 0 when there is no report, no token or no PR: this is a nicety, and it
   must never fail a check. */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const MARKER = '<!-- visual-check -->'

type Report = {
  summary: {
    match: number
    close: number
    different: number
    noReference: number
  }
  routes: Array<{
    path: string
    viewport: string
    verdict: string
    score: number | null
    heightDelta: number | null
    blocks: {
      expected: Array<string>
      missing: Array<string>
      extra: Array<string>
      found: Array<string>
    } | null
    note: string | null
  }>
}

const token = process.env.GITHUB_TOKEN
const repo = process.env.GITHUB_REPOSITORY
const pr = process.env.PR_NUMBER
if (!token || !repo || !pr || !existsSync('design/visual.json')) {
  console.log('visual-comment: nothing to post')
  process.exit(0)
}
const report = JSON.parse(readFileSync('design/visual.json', 'utf8')) as Report
const server = process.env.GITHUB_SERVER_URL ?? 'https://github.com'
const sha = process.env.PR_HEAD_SHA
const runId = process.env.GITHUB_RUN_ID

const tracked = (file: string) => {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', file], {
      stdio: 'ignore',
    })
    return true
  } catch {
    return false
  }
}

const pct = (n: number | null) =>
  n === null ? '—' : `${(n * 100).toFixed(0)}%`
const signed = (n: number | null) =>
  n === null ? '—' : `${n >= 0 ? '+' : ''}${(n * 100).toFixed(0)}%`

function blockWord(b: Report['routes'][number]['blocks']) {
  if (!b) return '—'
  if (!b.expected.length)
    return b.found.length ? `${b.found.length} rendered` : '—'
  if (!b.found.length) return 'no `data-block` markers (needs `agency refresh`)'
  if (!b.missing.length && !b.extra.length)
    return `${b.found.length} as planned`
  return [
    b.missing.length ? `missing \`${b.missing.join('`, `')}\`` : '',
    b.extra.length ? `extra \`${b.extra.join('`, `')}\`` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

const s = report.summary
const lines = [
  MARKER,
  `**Visual check** · ${s.match} match · ${s.close} close · ${s.different} different · ${s.noReference} no reference`,
  '',
  '| Route | Verdict | Score | Height vs design | Blocks |',
  '| --- | --- | --- | --- | --- |',
]
for (const r of report.routes) {
  const blocks = blockWord(r.blocks)
  lines.push(
    `| \`${r.path}\`${r.viewport === 'mobile' ? ' (mobile)' : ''} | ${r.verdict} | ${pct(r.score)} | ${signed(r.heightDelta)} | ${blocks} |`,
  )
}
const notes = report.routes.filter((r) => r.note)
if (notes.length) {
  lines.push('')
  for (const r of notes) lines.push(`- \`${r.path}\` — ${r.note}`)
}
lines.push('')
// GitHub does not render images from a private repo in a comment, so the pictures live in the
// report file on the branch (relative image links work there) and in the run's artifact.
if (sha && tracked('design/visual-report.md'))
  lines.push(
    `Side by side with the design: [design/visual-report.md](${server}/${repo}/blob/${sha}/design/visual-report.md)`,
  )
if (runId)
  lines.push(
    `Every screenshot: the \`visual\` artifact on [this run](${server}/${repo}/actions/runs/${runId}).`,
  )
lines.push('', '_Nothing here fails a check. Small differences are expected._')
const body = lines.join('\n')

const api = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
    },
  })
  if (!res.ok)
    throw new Error(`${init?.method ?? 'GET'} ${url} → ${res.status}`)
  return res.json() as Promise<unknown>
}

try {
  const existing = (await api(
    `https://api.github.com/repos/${repo}/issues/${pr}/comments?per_page=100`,
  )) as Array<{ id: number; body?: string }>
  const mine = existing.find((c) => c.body?.includes(MARKER))
  if (mine) {
    await api(
      `https://api.github.com/repos/${repo}/issues/comments/${mine.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      },
    )
    console.log(`visual-comment: updated comment ${mine.id}`)
  } else {
    await api(`https://api.github.com/repos/${repo}/issues/${pr}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    })
    console.log('visual-comment: posted')
  }
} catch (e) {
  console.log(
    `visual-comment: skipped (${e instanceof Error ? e.message : String(e)})`,
  )
}
