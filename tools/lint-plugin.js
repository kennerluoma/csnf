/* Local oxlint JS plugin: house rules the built-in plugins don't cover. */
const message =
  'Build class names with cn() from #/lib/cn, never with a template literal or +.'

const classNames = {
  meta: { type: 'problem', schema: [] },
  create(context) {
    const check = (node) => {
      if (!node) return
      if (node.type === 'TemplateLiteral' && node.expressions.length)
        context.report({ node, message })
      else if (node.type === 'BinaryExpression' && node.operator === '+')
        context.report({ node, message })
      else if (node.type === 'ConditionalExpression') {
        check(node.consequent)
        check(node.alternate)
      } else if (node.type === 'LogicalExpression') check(node.right)
    }
    return {
      JSXAttribute(node) {
        if (node.name.name !== 'className') return
        if (node.value?.type === 'JSXExpressionContainer')
          check(node.value.expression)
      },
    }
  },
}

export default {
  meta: { name: 'agency' },
  rules: { 'class-names': classNames },
}
