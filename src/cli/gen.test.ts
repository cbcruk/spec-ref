import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { generate } from './gen.ts'
import { checkGenContent } from './gen-check.ts'

const ok = (md: string) => {
  const r = generate(md)
  assert.deepEqual(r.errors, [])
  return r
}

test('라벨 항목 → 이름 키로 생성', () => {
  const { code } = ok(['# S', '', '- 타이틀: `값`'].join('\n'))
  assert.match(code, /타이틀: '값',/)
})

test('한 라벨에 백틱 여럿 → 배열', () => {
  const { code } = ok(['# S', '', '- 목록: `가` 또는 `나`'].join('\n'))
  assert.match(code, /목록: \['가', '나'\],/)
})

test('이름 없는 카피 → copies 배열 + 경고', () => {
  const { code, warnings } = ok(['# S', '', '- `무명`'].join('\n'))
  assert.match(code, /copies: \['무명'\],/)
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /이름 없는 카피/)
})

test('식별자 불가능한 라벨·절 이름은 따옴표 키로', () => {
  const { code } = ok(['# 절 / 이름', '', '- A B: `값`'].join('\n'))
  assert.match(code, /'절 \/ 이름': \{/)
  assert.match(code, /'A B': '값',/)
})

test('값 속 작은따옴표·백슬래시 이스케이프', () => {
  const { code } = ok(['# S', "- 인용: `그는 '좋다'고 \\ 했다`"].join('\n'))
  assert.ok(code.includes("인용: '그는 \\'좋다\\'고 \\\\ 했다',"))
})

test('카피 없는 절은 빈 객체', () => {
  const { code } = ok(['# 빈 절', '', '산문뿐.'].join('\n'))
  assert.match(code, /'빈 절': \{\},/)
})

test('중복 라벨 → errors', () => {
  const r = generate(['# S', '', '- 타이틀: `가`', '- 타이틀: `나`'].join('\n'))
  assert.equal(r.errors.length, 1)
  assert.match(r.errors[0], /중복 라벨/)
})

test('중복 절 이름 → errors', () => {
  const r = generate(['# S', '', '- 이름: `가`', '', '# S', '', '- 이름: `나`'].join('\n'))
  assert.ok(r.errors.some((e) => /중복 절 이름/.test(e)))
})

test('옛 규약 라벨(백틱 없음) → errors', () => {
  const r = generate(['# S', '', '- 타이틀: 백틱 없는 값'].join('\n'))
  assert.equal(r.errors.length, 1)
  assert.match(r.errors[0], /옛 규약/)
})

test("라벨 'copies' 와 이름 없는 카피 공존 → errors (충돌)", () => {
  const r = generate(['# S', '', '- copies: `가`', '- `무명`'].join('\n'))
  assert.ok(r.errors.some((e) => /충돌/.test(e)))
})

test('생성물은 충실성 그물(check:gen)을 구성상 통과한다', () => {
  const md = ['# A', '', '- 이름: `값1`', '- `무명`', '', '# B', '', '- 키: `값1`'].join('\n')
  const { code, errors } = generate(md)
  assert.deepEqual(errors, [])
  const r = checkGenContent(md, code, { spec: 's', gen: 'g' })
  assert.equal(r.ok, true) // 공유 카피 슬롯 2개까지 정확히
})

test('fixtures 신선도: 커밋된 spec.gen.ts == 재생성 결과 (dogfood)', () => {
  const md = readFileSync(new URL('../../fixtures/SPEC.md', import.meta.url), 'utf8')
  const committed = readFileSync(new URL('../../fixtures/spec.gen.ts', import.meta.url), 'utf8')
  const { code, errors } = generate(md, 'spec-ref-gen fixtures/SPEC.md --out fixtures/spec.gen.ts')
  assert.deepEqual(errors, [])
  assert.equal(code, committed)
})
