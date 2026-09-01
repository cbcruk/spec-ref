import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanContent, extractGenKeys, collectSources } from './scan.ts'

const MD = [
  '## 저장 / 미저장 시 이탈',
  '',
  '- 저장완료: `설정을 저장했어요.`',
  '- 타이틀: `중단하시겠어요?`',
  '- 저장하지 않은 변경이 있으면 확인 모달을 띄운다.', // 서술 - 카피 아님
  '',
  '## 접수 재개',
  '',
  '- 재개완료: `다시 시작했어요.`',
].join('\n')

const GEN = `export const SPEC = {
  '저장 / 미저장 시 이탈': { 저장완료: '설정을 저장했어요.', 타이틀: '중단하시겠어요?' },
  '접수 재개': { 재개완료: '다시 시작했어요.' },
} as const
`

const meta = { spec: 'SPEC.md', gen: 'src/spec.gen.ts' }
const file = (text: string, path = 'src/app.ts') => [{ path, text }]

// ── no-ref: 하드코딩 재복사 ───────────────────────────────────────────

test('SPEC 상수를 소비하면 no-ref 없음', () => {
  const r = scanContent(
    MD,
    GEN,
    file(`import { SPEC } from './spec.gen.ts'
export const T = SPEC['저장 / 미저장 시 이탈'].타이틀
export const S = SPEC['저장 / 미저장 시 이탈'].저장완료
export const R = SPEC['접수 재개'].재개완료`),
    meta,
  )
  assert.deepEqual(r.noRef, [])
  assert.deepEqual(r.orphan, [])
  assert.equal(r.ok, true)
  assert.equal(r.genImporters, 1)
})

test('카피를 문자열로 재복사하면 no-ref 로 파일:줄과 함께 잡힌다', () => {
  const r = scanContent(MD, GEN, file(`const a = 1\nexport const T = '중단하시겠어요?'`), meta)
  assert.equal(r.ok, false)
  assert.deepEqual(r.noRef, [{ copy: '중단하시겠어요?', file: 'src/app.ts', line: 2 }])
})

test('JSX 텍스트로 박아넣은 카피도 잡는다', () => {
  const r = scanContent(
    MD,
    GEN,
    file('export const V = <p>\n  다시 시작했어요.\n</p>', 'src/app.tsx'),
    meta,
  )
  assert.deepEqual(
    r.noRef.map((h) => h.copy),
    ['다시 시작했어요.'],
  )
})

test('생성물 자신은 소비자에서 제외된다 (자기 값이 재복사로 잡히지 않음)', () => {
  const r = scanContent(MD, GEN, [{ path: 'src/spec.gen.ts', text: GEN }], meta)
  assert.deepEqual(r.noRef, [])
  assert.equal(r.files, 0)
})

test('백틱 없는 산문은 카피가 아니므로 재복사로 보지 않는다', () => {
  const r = scanContent(
    MD,
    GEN,
    file(`const s = '저장하지 않은 변경이 있으면 확인 모달을 띄운다.'`),
    meta,
  )
  assert.deepEqual(r.noRef, [])
})

// ── orphan: 아무도 소비하지 않는 키 ───────────────────────────────────

test('소비되지 않은 키는 orphan - 기본은 경고(ok 유지), --strict 에서 게이트', () => {
  const src = `import { SPEC } from './spec.gen.ts'
export const T = SPEC['저장 / 미저장 시 이탈'].타이틀`
  const r = scanContent(MD, GEN, file(src), meta)
  assert.equal(r.ok, true) // orphan 은 기본 게이트 아님
  assert.deepEqual(r.orphan, [
    { section: '저장 / 미저장 시 이탈', label: '저장완료' },
    { section: '접수 재개', label: '재개완료' },
  ])

  const strict = scanContent(MD, GEN, file(src), { ...meta, strict: true })
  assert.equal(strict.ok, false)
})

test('별칭 변수로 절을 받아 쓴 접근도 추적한다', () => {
  const r = scanContent(
    MD,
    GEN,
    file(`import { SPEC } from './spec.gen.ts'
const leave = SPEC['저장 / 미저장 시 이탈']
export const T = leave.타이틀
export const S = leave['저장완료']
export const R = SPEC['접수 재개'].재개완료`),
    meta,
  )
  assert.deepEqual(r.orphan, [])
})

test('절을 통째로 넘기면 그 절 전체가 소비된 것으로 본다 (보수적)', () => {
  const r = scanContent(
    MD,
    GEN,
    file(`import { SPEC } from './spec.gen.ts'
render(SPEC['저장 / 미저장 시 이탈'])`),
    meta,
  )
  assert.deepEqual(r.orphan, [{ section: '접수 재개', label: '재개완료' }])
})

test('동적 인덱스는 판정 불가 - orphan 을 지목하지 않는다', () => {
  const r = scanContent(
    MD,
    GEN,
    file(`import { SPEC } from './spec.gen.ts'
export const pick = (k: string) => SPEC[k as keyof typeof SPEC]`),
    meta,
  )
  assert.deepEqual(r.orphan, [])
})

test('namespace import 로 소비해도 추적된다', () => {
  const r = scanContent(
    MD,
    GEN,
    file(`import * as gen from './spec.gen.ts'
export const T = gen.SPEC['저장 / 미저장 시 이탈'].타이틀`),
    meta,
  )
  assert.ok(!r.orphan.some((o) => o.label === '타이틀'))
})

test('생성물을 아무도 import 하지 않으면 genImporters 0 이고 전 키가 orphan', () => {
  const r = scanContent(MD, GEN, file('export const x = 1'), meta)
  assert.equal(r.genImporters, 0)
  assert.equal(r.orphan.length, 3)
  assert.equal(r.keys, 3)
})

test('같은 이름의 무관한 프로퍼티는 소비로 세지 않는다', () => {
  const r = scanContent(
    MD,
    GEN,
    file(`const other = { 타이틀: 'x' }\nexport const T = other.타이틀`),
    meta,
  )
  assert.equal(r.orphan.length, 3) // SPEC 을 import 하지 않았으므로 전부 orphan
})

// ── 헬퍼 ──────────────────────────────────────────────────────────────

test('extractGenKeys: 2단 구조의 leaf 만, 빈 절은 키 없음', () => {
  const keys = extractGenKeys(
    `export const SPEC = { '빈 절': {}, A: { a: 'x', 'b c': 'y' } } as const`,
    'g.ts',
  )
  assert.deepEqual(keys, [
    { section: 'A', label: 'a' },
    { section: 'A', label: 'b c' },
  ])
})

test('collectSources: .d.ts·테스트·스킵 디렉토리를 제외한다', () => {
  const files = collectSources(['src'], false)
  assert.ok(files.includes('src/cli/scan.ts'))
  assert.ok(!files.some((f) => f.endsWith('.test.ts')))
  assert.ok(!files.some((f) => f.includes('node_modules')))
  assert.ok(collectSources(['src'], true).includes('src/cli/scan.test.ts'))
})
