import { createFileRoute } from '@tanstack/react-router'
import { PageView } from '#/lib/PageView'
import { getPage } from '#/lib/page'
import { seoMeta } from '#/lib/seo'

/* Search params pass through untouched (validating/coercing here makes the router rewrite the
   URL); resolvers coerce what they use. */
type Search = Record<string, unknown>
const toStrings = (s: Search) =>
  Object.fromEntries(
    Object.entries(s).map(([k, v]) => [k, v == null ? undefined : String(v)]),
  )

export const Route = createFileRoute('/')({
  validateSearch: (s: Search): Search => s,
  loaderDeps: ({ search }) => ({ search }),
  loader: ({ deps }) =>
    getPage({ data: { slug: 'home', search: toStrings(deps.search) } }),
  head: ({ loaderData }) => ({
    meta: seoMeta(
      { title: loaderData?.page?.title, seo: loaderData?.page?.seo },
      loaderData?.settings,
    ),
  }),
  component: HomePage,
})

function HomePage() {
  return <PageView page={Route.useLoaderData().page} />
}
