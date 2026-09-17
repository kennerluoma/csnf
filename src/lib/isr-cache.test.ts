import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extendForStaleWindow, isrStatus, parsePolicy } from './isr-cache.ts'

void test('parsePolicy reads s-maxage and stale-while-revalidate from a public policy', () => {
  assert.deepEqual(
    parsePolicy('public, max-age=0, s-maxage=60, stale-while-revalidate=86400'),
    { sMax: 60, swr: 86400 },
  )
})

void test('parsePolicy returns null for a non-public Cache-Control', () => {
  assert.equal(parsePolicy('private, no-store'), null)
  assert.equal(parsePolicy(null), null)
})

void test('parsePolicy returns null when s-maxage is missing or zero', () => {
  assert.equal(parsePolicy('public, stale-while-revalidate=86400'), null)
  assert.equal(parsePolicy('public, s-maxage=0'), null)
})

void test('parsePolicy treats a missing stale-while-revalidate as 0', () => {
  assert.deepEqual(parsePolicy('public, s-maxage=60'), { sMax: 60, swr: 0 })
})

void test('extendForStaleWindow rewrites only the s-maxage number', () => {
  const cc = 'public, max-age=0, s-maxage=60, stale-while-revalidate=86400'
  assert.equal(
    extendForStaleWindow(cc, { sMax: 60, swr: 86400 }),
    'public, max-age=0, s-maxage=86460, stale-while-revalidate=86400',
  )
})

void test('isrStatus: within s-maxage is fresh', () => {
  assert.equal(isrStatus({ sMax: 60, swr: 86400 }, 30), 'fresh')
  assert.equal(isrStatus({ sMax: 60, swr: 86400 }, 60), 'fresh')
})

void test('isrStatus: past s-maxage but within the stale window is stale', () => {
  assert.equal(isrStatus({ sMax: 60, swr: 86400 }, 61), 'stale')
  assert.equal(isrStatus({ sMax: 60, swr: 86400 }, 86460), 'stale')
})

void test('isrStatus: past the whole stale window is expired', () => {
  assert.equal(isrStatus({ sMax: 60, swr: 86400 }, 86461), 'expired')
})

void test('isrStatus: no policy is always expired', () => {
  assert.equal(isrStatus(null, 0), 'expired')
})
