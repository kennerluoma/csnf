import { Fragment } from 'react'
import { renderBlock } from './registry'
import type { ResolvedBlock } from './resolvers'

export function RenderBlocks({ blocks }: { blocks: Array<ResolvedBlock> }) {
  return (
    <>
      {blocks.map((block) => (
        <Fragment key={block._key}>{renderBlock(block)}</Fragment>
      ))}
    </>
  )
}
