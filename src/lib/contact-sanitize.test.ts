import { test } from 'node:test'
import assert from 'node:assert/strict'
import { oneLine } from './contact-sanitize.ts'

void test('oneLine passes ordinary text through unchanged', () => {
  assert.equal(oneLine('Hello there', 200), 'Hello there')
})

void test('oneLine strips embedded newlines and carriage returns', () => {
  assert.equal(
    oneLine('Line one\nLine two\r\nLine three', 200),
    'Line one Line two Line three',
  )
})

void test('oneLine strips a header-injection attempt', () => {
  assert.equal(
    oneLine('Normal subject\nBcc: attacker@evil.example', 200),
    'Normal subject Bcc: attacker@evil.example',
  )
})

void test('oneLine caps length', () => {
  assert.equal(oneLine('a'.repeat(300), 200).length, 200)
})
