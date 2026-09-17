import { createFileRoute, notFound } from '@tanstack/react-router'
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

/* Any other path: a `page` document by slug, or a default content index (src/lib/defaults.ts). */
export const Route = createFileRoute('/$')({
  validateSearch: (s: Search): Search => s,
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ params, deps }) => {
    const r = await getPage({
      data: { slug: params._splat ?? '', search: toStrings(deps.search) },
    })
    if (!r.page) throw notFound()
    return r
  },
  head: ({ loaderData }) => ({
    meta: seoMeta(
      { title: loaderData?.page.title, seo: loaderData?.page.seo },
      loaderData?.settings,
    ),
  }),
  component: () => <PageView page={Route.useLoaderData().page} />,
})
