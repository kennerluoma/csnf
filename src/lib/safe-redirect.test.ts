import { test } from 'node:test'
import assert from 'node:assert/strict'
import { redirectTo, safePath } from './safe-redirect.ts'

void test('safePath keeps an ordinary internal path', () => {
  assert.equal(safePath('/contact'), '/contact')
  assert.equal(safePath('/work/harbour-iv?x=1'), '/work/harbour-iv?x=1')
})

void test('safePath rejects a protocol-relative bounce', () => {
  assert.equal(safePath('//evil.example/x'), '/')
})

void test('safePath rejects a backslash bounce', () => {
  assert.equal(safePath('/\\evil.example'), '/')
})

void test('safePath rejects a fully-qualified URL', () => {
  assert.equal(safePath('http://evil.example/x'), '/')
})

void test('safePath falls back to / for anything not starting with /', () => {
  assert.equal(safePath('evil.example'), '/')
  assert.equal(safePath(''), '/')
})

void test('safePath drops an original hash (a caller always supplies its own)', () => {
  assert.equal(safePath('/contact#other'), '/contact')
})

void test('safePath does not throw on an embedded newline', () => {
  assert.equal(safePath('/con\ntact'), '/contact')
})

void test('redirectTo sets the query param without disturbing an existing one', () => {
  const res = redirectTo('/contact?ref=footer', 'sent', '1', '#contact')
  const location = res.headers.get('location')
  assert.equal(location, '/contact?ref=footer&sent=1#contact')
})

void test('redirectTo always lands the param as a real query param, never inside the hash', () => {
  const res = redirectTo('/contact', 'error', 'invalid', '#contact')
  assert.equal(res.headers.get('location'), '/contact?error=invalid#contact')
})
