import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dedupeRenders,
  dedupeRoutePaths,
  routeKey,
  stripMobileTokens,
} from './route-key.ts'

// S8: numbered frames no longer collapse into one route.
void test('routeKey keeps a trailing number (numbered frames stay distinct routes)', () => {
  assert.equal(routeKey('Frame 1'), 'frame 1')
  assert.equal(routeKey('Frame 40'), 'frame 40')
  assert.equal(routeKey('Exhibition 2024'), 'exhibition 2024')
  assert.equal(routeKey('Exhibition 2025'), 'exhibition 2025')
})

void test('routeKey still strips an explicit variant marker', () => {
  assert.equal(routeKey('Home – alt'), 'home')
  assert.equal(routeKey('Home – v2'), 'home')
  assert.equal(routeKey('Home - copy'), 'home')
  assert.equal(routeKey('Home (hover)'), 'home')
})

void test('routeKey strips an @-suffix', () => {
  assert.equal(routeKey('Home @mobile'), 'home')
})

// S9: a mobile frame's name pairs with its desktop counterpart's routeKey.
void test('stripMobileTokens removes a trailing/leading "Mobile" and its separator', () => {
  assert.equal(stripMobileTokens('Home – Mobile'), 'Home')
  assert.equal(stripMobileTokens('Mobile / Home'), 'Home')
})

void test('stripMobileTokens removes an iPhone model token without eating the rest of the name', () => {
  assert.equal(stripMobileTokens('iPhone 14 – Home'), 'Home')
  assert.equal(stripMobileTokens('iPhone 14 Pro – Home'), 'Home')
})

void test('mobile and desktop names produce the same routeKey once stripped', () => {
  const desktop = routeKey('Home')
  const mobile = routeKey(stripMobileTokens('Home – Mobile'))
  assert.equal(desktop, mobile)
})

// S7: duplicate paths.
void test('dedupeRoutePaths leaves a single desktop + mobile pair alone', () => {
  const routes = [
    { path: '/home', viewport: 'desktop' as const, id: '1' },
    { path: '/home', viewport: 'mobile' as const, id: '2' },
  ]
  const { renamed, warnings } = dedupeRoutePaths(routes)
  assert.equal(renamed.size, 0)
  assert.equal(warnings.length, 0)
})

void test('dedupeRoutePaths leaves a desktop route paired with two mobile variants alone', () => {
  const routes = [
    { path: '/home', viewport: 'desktop' as const, id: '1' },
    { path: '/home', viewport: 'mobile' as const, id: '2' },
    { path: '/home', viewport: 'mobile' as const, id: '3' },
  ]
  const { renamed } = dedupeRoutePaths(routes)
  assert.equal(renamed.size, 0)
})

void test('dedupeRoutePaths suffixes a genuine collision between two desktop routes', () => {
  const routes = [
    { path: '/about', viewport: 'desktop' as const, id: '1' }, // "About Us"
    { path: '/about', viewport: 'desktop' as const, id: '2' }, // "About-Us"
  ]
  const { renamed, warnings } = dedupeRoutePaths(routes)
  assert.equal(renamed.get(1), '/about-2')
  assert.equal(warnings.length, 1)
})

void test('dedupeRoutePaths suffixes a mobile route with no matching desktop route', () => {
  const routes = [
    { path: '/home', viewport: 'mobile' as const, id: '1' },
    { path: '/home', viewport: 'mobile' as const, id: '2' },
  ]
  const { renamed } = dedupeRoutePaths(routes)
  assert.equal(renamed.get(1), '/home-2')
})

void test('dedupeRenders leaves unique render paths untouched', () => {
  const routes = [
    { render: 'design/renders/home.png', id: '1' },
    { render: 'design/renders/about.png', id: '2' },
  ]
  assert.equal(dedupeRenders(routes).size, 0)
})

void test('dedupeRenders appends the node id when two routes render to the same file', () => {
  const routes = [
    { render: 'design/renders/home.png', id: '1' },
    { render: 'design/renders/home.png', id: '2:3' },
  ]
  const renamed = dedupeRenders(routes)
  assert.equal(renamed.get(1), 'design/renders/home-23.png')
})
