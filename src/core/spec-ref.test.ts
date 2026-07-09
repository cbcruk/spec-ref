import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSpec } from './spec-ref.ts'

const LINES = [
  '# 자동 접수 설정', // 1
  '', // 2
  '진료실별 자동 접수 여부를 저장한다.', // 3  (백틱 없음 → 카피 아님)
  '', // 4
  '## 저장 / 미저장 시 이탈', // 5
  '', // 6
  '- `진료실별 자동 접수 설정을 저장했어요.`', // 7
  '- 타이틀: `자동 접수 설정을 중단하시겠어요?`', // 8
  '- 내용: `중단하면 지금까지 변경한 정보가 저장되지 않아요.`', // 9
  '- 저장하지 않은 변경이 있으면 이탈 전 확인 모달을 띄운다.', // 10 (백틱 없음 → 서술, 카피 아님)
  '', // 11
  '## 접수 재개', // 12
  '', // 13
  '- `자동 접수를 다시 시작했어요.`', // 14
]
const MD = LINES.join('\n')

test('절을 heading 단위로 분해하고 이름·줄을 기록한다', () => {
  const secs = parseSpec(MD)
  assert.deepEqual(
    secs.map((s) => s.name),
    ['자동 접수 설정', '저장 / 미저장 시 이탈', '접수 재개'],
  )
  assert.deepEqual(
    secs.map((s) => s.line),
    [1, 5, 12],
  )
})

test('카피 = 백틱 인라인 코드 값. 라벨 텍스트는 값에 안 섞이고, 서술은 제외', () => {
  const sec = parseSpec(MD)[1]
  assert.deepEqual(sec.copies, [
    '진료실별 자동 접수 설정을 저장했어요.',
    '자동 접수 설정을 중단하시겠어요?', // '타이틀:' 은 값에 포함되지 않음
    '중단하면 지금까지 변경한 정보가 저장되지 않아요.',
  ])
})

test('카피가 없는 절(문단만)은 copies 가 빈다', () => {
  const [intro] = parseSpec(MD)
  assert.deepEqual(intro.copies, [])
})

test('빈 문서 → 빈 배열', () => {
  assert.deepEqual(parseSpec(''), [])
})

test('heading 앞 텍스트는 어떤 절에도 속하지 않는다', () => {
  const secs = parseSpec(['서문 `안카피`.', '', '# 첫 절', '', '- `카피`'].join('\n'))
  assert.equal(secs.length, 1)
  assert.deepEqual(secs[0].copies, ['카피'])
})

test('한 항목에 백틱이 여럿이면 모두 카피', () => {
  const sec = parseSpec(['# S', '', '- `가` 그리고 `나`'].join('\n'))[0]
  assert.deepEqual(sec.copies, ['가', '나'])
})

test('중첩 리스트의 백틱은 한 번만 수집된다 (이중 순회 없음)', () => {
  const sec = parseSpec(['# S', '', '- 상위 `가`', '  - 하위 `나`'].join('\n'))[0]
  assert.deepEqual(sec.copies, ['가', '나']) // ['가','나','나'] 가 아님
})

test('같은 카피가 두 항목에 나오면 슬롯 두 개로 보존된다 (dedup 안 함)', () => {
  const sec = parseSpec(['# S', '', '- `확인`', '- `확인`'].join('\n'))[0]
  assert.deepEqual(sec.copies, ['확인', '확인'])
})

test('리스트 밖(문단 직속) 백틱은 카피가 아니다', () => {
  const sec = parseSpec(['# S', '', '문단 속 `백틱`은 규약 밖.'].join('\n'))[0]
  assert.deepEqual(sec.copies, [])
})

test('옛 규약 라벨(백틱 없는 타이틀:/내용:)은 legacyLabels 로 보고된다', () => {
  const sec = parseSpec(
    ['# S', '', '- 타이틀: 자동 접수 설정을 중단하시겠어요?', '- 내용: 저장되지 않아요.'].join(
      '\n',
    ),
  )[0]
  assert.deepEqual(sec.copies, [])
  assert.deepEqual(sec.legacyLabels, [
    '타이틀: 자동 접수 설정을 중단하시겠어요?',
    '내용: 저장되지 않아요.',
  ])
})

test('백틱을 갖춘 라벨 항목은 legacy 가 아니다', () => {
  const sec = parseSpec(['# S', '', '- 타이틀: `제대로 감쌌어요`'].join('\n'))[0]
  assert.deepEqual(sec.copies, ['제대로 감쌌어요'])
  assert.deepEqual(sec.legacyLabels, [])
})

test('타이틀:/내용: 이외의 콜론 산문은 legacy 로 오탐하지 않는다', () => {
  const sec = parseSpec(['# S', '', '- 노출 조건: 어드민에서 ON 설정 시'].join('\n'))[0]
  assert.deepEqual(sec.copies, [])
  assert.deepEqual(sec.legacyLabels, [])
})

test('entries: 라벨은 첫 백틱 이전 텍스트의 첫 콜론 앞부분', () => {
  const sec = parseSpec(
    ['# S', '', '- 타이틀: `값1`', '- Y: TOAST |> `값2`', '- `무명`'].join('\n'),
  )[0]
  assert.deepEqual(
    sec.entries.map((e) => e.label),
    ['타이틀', 'Y', null],
  )
  assert.deepEqual(
    sec.entries.map((e) => e.values),
    [['값1'], ['값2'], ['무명']],
  )
})

test('entries: 백틱 뒤 텍스트는 라벨에 안 섞인다 (값이 콜론을 품어도)', () => {
  const sec = parseSpec(['# S', '', '- `주의: 값` 이후 설명'].join('\n'))[0]
  assert.deepEqual(sec.entries, [{ label: null, values: ['주의: 값'] }])
})
