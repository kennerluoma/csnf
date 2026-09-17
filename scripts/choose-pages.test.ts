import { test } from 'node:test'
import assert from 'node:assert/strict'
import { choosePages } from './choose-pages.ts'

void test('choosePages throws when an explicit --page does not match any page', () => {
  assert.throws(
    () => choosePages(['Final', 'Cover'], 'Fianl'),
    /page "Fianl" not found; pages: Final, Cover/,
  )
})

void test('choosePages pairs an explicit main page with its mobile counterpart', () => {
  assert.deepEqual(choosePages(['Final', 'Final Mobile', 'Cover'], 'Final'), [
    'Final',
    'Final Mobile',
  ])
})

void test('choosePages auto-detects a main page by name when none is given', () => {
  assert.deepEqual(choosePages(['Cover', 'Site', 'Mobile'], undefined), [
    'Site',
    'Mobile',
  ])
})

void test('choosePages recognizes site|website|desktop|... — not just finals? (the bundle-path bug)', () => {
  assert.deepEqual(choosePages(['Cover', 'Desktop'], undefined), ['Desktop'])
  assert.deepEqual(choosePages(['Cover', 'Website'], undefined), ['Website'])
})

void test('choosePages drops known-junk pages when no main page is found', () => {
  assert.deepEqual(
    choosePages(['Cover', 'Components', 'Home', 'About'], undefined),
    ['Home', 'About'],
  )
})

void test('choosePages returns undefined (use everything) when nothing can be narrowed down', () => {
  assert.equal(choosePages(['Home', 'About'], undefined), undefined)
  assert.equal(choosePages(['Cover', 'Components'], undefined), undefined)
})
