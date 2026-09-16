import { createFileRoute, notFound } from '@tanstack/react-router'
import { PageView } from '#/lib/PageView'
import { getPage } from '#/lib/page'

export const Route = createFileRoute('/$')({
  loader: async ({ params }) => {
    const page = await getPage({ data: params._splat ?? '' })
    if (!page) throw notFound()
    return page
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.title ?? 'Page' }],
  }),
  component: () => <PageView page={Route.useLoaderData()} />,
})
