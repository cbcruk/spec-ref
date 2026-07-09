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

test('충실한 생성물 → ok, missing·hallucinated 없음, 카피 4개', () => {
  const r = checkGenContent(MD, GEN_OK, meta)
  assert.equal(r.ok, true)
  assert.deepEqual(r.missing, [])
  assert.deepEqual(r.hallucinated, [])
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

test('서술(백틱 없는 항목)은 SPEC 카피가 아니므로 생성물에 없어도 ok', () => {
  // GEN_OK 는 서술 문장을 담지 않는다 → 그래도 통과해야
  assert.equal(checkGenContent(MD, GEN_OK, meta).ok, true)
})

test('절 이름 키(공백·슬래시 포함)는 값으로 세지 않는다', () => {
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
  assert.ok(!vals.has('key'))
  assert.ok(!vals.has('./mod.ts'))
})
