import { createFileRoute } from '@tanstack/react-router'
import { PageView } from '#/lib/PageView'
import { getPage } from '#/lib/page'

export const Route = createFileRoute('/')({
  loader: () => getPage({ data: 'home' }),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.title ?? 'Home' }],
  }),
  component: () => <PageView page={Route.useLoaderData()} />,
})
