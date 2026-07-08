import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkGenContent, extractStringValues } from './gen-check.ts'

const MD = [
  '## 저장 / 미저장 시 이탈',
  '',
  '- `진료실별 자동 접수 설정을 저장했어요.`',
  '- 타이틀: 자동 접수 설정을 중단하시겠어요?',
  '- 내용: 중단하면 지금까지 변경한 정보가 저장되지 않아요.',
  '- 저장하지 않은 변경이 있으면 이탈 전 확인 모달을 띄운다.',
  '',
  '## 접수 재개',
  '',
  '- `자동 접수를 다시 시작했어요.`',
].join('\n')

const GEN_OK = `export const SPEC = {
  '저장 / 미저장 시 이탈': {
    타이틀: '자동 접수 설정을 중단하시겠어요?',
    내용: '중단하면 지금까지 변경한 정보가 저장되지 않아요.',
    copies: ['진료실별 자동 접수 설정을 저장했어요.'],
    behaviors: ['저장하지 않은 변경이 있으면 이탈 전 확인 모달을 띄운다.'],
  },
  '접수 재개': { copies: ['자동 접수를 다시 시작했어요.'] },
} as const
`

const meta = { spec: 'SPEC.md', gen: 'spec.gen.ts' }

test('충실한 생성물 → ok, missing·hallucinated 없음, 카피 4개', () => {
  const r = checkGenContent(MD, GEN_OK, meta)
  assert.equal(r.ok, true)
  assert.deepEqual(r.missing, [])
  assert.deepEqual(r.hallucinated, [])
  assert.equal(r.copies, 4)
})

test('카피 누락 → missing 에 잡히고 ok=false', () => {
  const gen = GEN_OK.replace("'접수 재개': { copies: ['자동 접수를 다시 시작했어요.'] },", '')
  const r = checkGenContent(MD, gen, meta)
  assert.equal(r.ok, false)
  assert.deepEqual(r.missing, ['자동 접수를 다시 시작했어요.'])
  assert.deepEqual(r.hallucinated, [])
})

test('SPEC에 없는 값 추가 → hallucinated 에 잡힘', () => {
  const gen = GEN_OK.replace("'접수 재개': {", "'접수 재개': { extra: '없는 카피임',")
  const r = checkGenContent(MD, gen, meta)
  assert.equal(r.ok, false)
  assert.deepEqual(r.hallucinated, ['없는 카피임'])
  assert.deepEqual(r.missing, [])
})

test('마침표 하나 뗀 미묘한 변형도 잡는다 (missing + hallucinated)', () => {
  const gen = GEN_OK.replace(
    '자동 접수 설정을 중단하시겠어요?',
    '자동 접수 설정을 중단하시겠어요', // 물음표 제거
  )
  const r = checkGenContent(MD, gen, meta)
  assert.equal(r.ok, false)
  assert.deepEqual(r.missing, ['자동 접수 설정을 중단하시겠어요?'])
  assert.deepEqual(r.hallucinated, ['자동 접수 설정을 중단하시겠어요'])
})

test('behavior(서술) 문자열은 있어도 환각으로 오탐하지 않는다', () => {
  // GEN_OK 는 behaviors 를 포함 → hallucinated 비어야
  const r = checkGenContent(MD, GEN_OK, meta)
  assert.ok(!r.hallucinated.includes('저장하지 않은 변경이 있으면 이탈 전 확인 모달을 띄운다.'))
})

test('behavior 는 필수가 아니다 — 빼도 ok', () => {
  const gen = GEN_OK.replace(
    "    behaviors: ['저장하지 않은 변경이 있으면 이탈 전 확인 모달을 띄운다.'],\n",
    '',
  )
  const r = checkGenContent(MD, gen, meta)
  assert.equal(r.ok, true)
})

test('절 이름 키(공백·슬래시 포함)는 값으로 세지 않는다', () => {
  // '저장 / 미저장 시 이탈' 같은 키가 hallucinated 로 새면 ok=false 가 됐을 것
  const r = checkGenContent(MD, GEN_OK, meta)
  assert.ok(!r.hallucinated.includes('저장 / 미저장 시 이탈'))
  assert.ok(!r.hallucinated.includes('접수 재개'))
})

test('extractStringValues: 값만, 키·import 지정자는 제외', () => {
  const src = [
    "import { x } from './mod.ts'",
    "export const O = { 'key': 'val', arr: ['a', 'b'] } as const",
  ].join('\n')
  const vals = extractStringValues(src, 'x.ts')
  assert.ok(vals.has('val'))
  assert.ok(vals.has('a'))
  assert.ok(vals.has('b'))
  assert.ok(!vals.has('key')) // 프로퍼티 키 제외
  assert.ok(!vals.has('./mod.ts')) // import 지정자 제외
})
