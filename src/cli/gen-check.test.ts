import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkGenContent, extractStringValues } from './gen-check.ts'

const MD = [
  '## 저장 / 미저장 시 이탈',
  '',
  '- `진료실별 자동 접수 설정을 저장했어요.`',
  '- 타이틀: `자동 접수 설정을 중단하시겠어요?`',
  '- 내용: `중단하면 지금까지 변경한 정보가 저장되지 않아요.`',
  '- 저장하지 않은 변경이 있으면 이탈 전 확인 모달을 띄운다.', // 서술 (백틱 없음 → 카피 아님)
  '',
  '## 접수 재개',
  '',
  '- `자동 접수를 다시 시작했어요.`',
].join('\n')

// flat 참조 모델 — 키는 작성자 네이밍, 값만 검사된다.
const GEN_OK = `export const SPEC = {
  '저장 / 미저장 시 이탈': {
    저장완료: '진료실별 자동 접수 설정을 저장했어요.',
    타이틀: '자동 접수 설정을 중단하시겠어요?',
    내용: '중단하면 지금까지 변경한 정보가 저장되지 않아요.',
  },
  '접수 재개': { 재개완료: '자동 접수를 다시 시작했어요.' },
} as const
`

const meta = { spec: 'SPEC.md', gen: 'spec.gen.ts' }

test('충실한 생성물 → ok, missing·hallucinated·legacy 없음, 슬롯 4개', () => {
  const r = checkGenContent(MD, GEN_OK, meta)
  assert.equal(r.ok, true)
  assert.deepEqual(r.missing, [])
  assert.deepEqual(r.hallucinated, [])
  assert.deepEqual(r.legacyLabels, [])
  assert.equal(r.copies, 4)
})

test('키 이름은 자유 — 값만 맞으면 통과 (키를 바꿔도 ok)', () => {
  const gen = GEN_OK.replace('저장완료:', 'saveToast:').replace('재개완료:', 'resumeToast:')
  assert.equal(checkGenContent(MD, gen, meta).ok, true)
})

test('카피 누락 → missing 에 잡히고 ok=false', () => {
  const gen = GEN_OK.replace("'접수 재개': { 재개완료: '자동 접수를 다시 시작했어요.' },", '')
  const r = checkGenContent(MD, gen, meta)
  assert.equal(r.ok, false)
  assert.deepEqual(r.missing, ['자동 접수를 다시 시작했어요.'])
  assert.deepEqual(r.hallucinated, [])
})

test('SPEC에 없는 값 추가 → hallucinated 에 잡힘', () => {
  const gen = GEN_OK.replace('재개완료:', "extra: '없는 카피임', 재개완료:")
  const r = checkGenContent(MD, gen, meta)
  assert.equal(r.ok, false)
  assert.deepEqual(r.hallucinated, ['없는 카피임'])
  assert.deepEqual(r.missing, [])
})

test('마침표/물음표 하나 뗀 미묘한 변형도 잡는다 (missing + hallucinated)', () => {
  const gen = GEN_OK.replace('자동 접수 설정을 중단하시겠어요?', '자동 접수 설정을 중단하시겠어요')
  const r = checkGenContent(MD, gen, meta)
  assert.equal(r.ok, false)
  assert.deepEqual(r.missing, ['자동 접수 설정을 중단하시겠어요?'])
  assert.deepEqual(r.hallucinated, ['자동 접수 설정을 중단하시겠어요'])
})

test('두 절이 공유하는 카피는 슬롯 수만큼 실려야 한다 — 한 절 누락 시 missing', () => {
  const md = ['## A', '', '- `확인`', '', '## B', '', '- `확인`'].join('\n')
  const genOnce = "export const SPEC = { A: { ok: '확인' } } as const"
  const r = checkGenContent(md, genOnce, meta)
  assert.equal(r.ok, false) // 전엔 Set 붕괴로 ok=true (절 B 통째 누락이 통과)
  assert.deepEqual(r.missing, ['확인'])
  assert.equal(r.copies, 2) // 슬롯 수 — distinct 아님

  const genBoth = "export const SPEC = { A: { ok: '확인' }, B: { ok: '확인' } } as const"
  assert.equal(checkGenContent(md, genBoth, meta).ok, true)
})

test('정당한 카피의 초과 출현은 허용한다 (환각 아님)', () => {
  const gen = GEN_OK.replace('재개완료:', "별칭: '자동 접수를 다시 시작했어요.', 재개완료:")
  const r = checkGenContent(MD, gen, meta)
  assert.equal(r.ok, true)
  assert.deepEqual(r.hallucinated, [])
})

test('옛 규약 라벨(백틱 없음)은 legacyLabels 로 보고되고 ok=false', () => {
  const md = ['## S', '', '- 타이틀: 자동 접수 설정을 중단하시겠어요?'].join('\n')
  const r = checkGenContent(md, 'export const SPEC = {} as const', meta)
  assert.equal(r.ok, false)
  assert.deepEqual(r.legacyLabels, ['타이틀: 자동 접수 설정을 중단하시겠어요?'])
  assert.deepEqual(r.missing, []) // 카피로 세지진 않음 — 별도 문제로 보고
})

test('extractStringValues: 값 위치만 — 키·computed key·element access·import 제외', () => {
  const src = [
    "import { x } from './mod.ts'",
    "export const O = { 'key': 'val', ['computed']: 'cv', arr: ['a', 'b'] } as const",
    "export const pick = O['key']",
    "const alias = SPEC['저장 / 미저장 시 이탈']",
  ].join('\n')
  const vals = extractStringValues(src, 'x.ts')
  assert.ok(vals.includes('val'))
  assert.ok(vals.includes('cv')) // computed key 의 "값"은 여전히 값
  assert.ok(vals.includes('a'))
  assert.ok(vals.includes('b'))
  assert.ok(!vals.includes('key')) // 프로퍼티 키 제외
  assert.ok(!vals.includes('computed')) // computed key 문자열 제외 (전엔 값으로 셌음)
  assert.ok(!vals.includes('./mod.ts')) // import 지정자 제외
  assert.ok(!vals.includes('저장 / 미저장 시 이탈')) // element access 인덱스 제외
})

test('extractStringValues: 중복 출현을 보존한다 (슬롯 대조용)', () => {
  const vals = extractStringValues("const O = { a: '확인', b: '확인' }", 'x.ts')
  assert.deepEqual(vals, ['확인', '확인'])
})
