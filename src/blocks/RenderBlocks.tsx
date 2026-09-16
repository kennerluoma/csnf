import { blockComponents } from './registry'
import type { PageDoc } from '#/sanity/types'

export function RenderBlocks({
  blocks,
}: {
  blocks: PageDoc['blocks'] | undefined
}) {
  if (!blocks?.length) return null
  return (
    <>
      {blocks.map(({ _key, _type, ...props }) => {
        const Block =
          _type in blockComponents ? blockComponents[_type] : undefined
        if (!Block) {
          if (import.meta.env.DEV)
            console.warn(`No block component registered for "${_type}"`)
          return null
        }
        return <Block key={_key} {...props} />
      })}
    </>
  )
}
