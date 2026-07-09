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

test('카피 = 백틱 인라인 코드 값. 라벨 텍스트는 값에 안 섞인다', () => {
  const sec = parseSpec(MD)[1]
  assert.deepEqual(sec.copies, [
    '진료실별 자동 접수 설정을 저장했어요.',
    '자동 접수 설정을 중단하시겠어요?', // '타이틀:' 은 값에 포함되지 않음
    '중단하면 지금까지 변경한 정보가 저장되지 않아요.',
  ])
})

test('백틱 없는 항목(서술)은 카피가 아니다', () => {
  const sec = parseSpec(MD)[1]
  assert.ok(!sec.copies.includes('저장하지 않은 변경이 있으면 이탈 전 확인 모달을 띄운다.'))
})

test('카피가 없는 절(문단만)은 copies 가 빈다', () => {
  const [intro] = parseSpec(MD)
  assert.deepEqual(intro.copies, [])
})

test('절 하나에 백틱 하나', () => {
  const 재개 = parseSpec(MD)[2]
  assert.deepEqual(재개.copies, ['자동 접수를 다시 시작했어요.'])
})

test('빈 문서 → 빈 배열', () => {
  assert.deepEqual(parseSpec(''), [])
})

test('heading 앞 텍스트는 어떤 절에도 속하지 않는다', () => {
  const secs = parseSpec(['서문 `안카피`.', '', '# 첫 절', '', '- `카피`'].join('\n'))
  assert.equal(secs.length, 1)
  assert.equal(secs[0].name, '첫 절')
  assert.deepEqual(secs[0].copies, ['카피'])
})

test('한 항목에 백틱이 여럿이면 모두 카피', () => {
  const sec = parseSpec(['# S', '', '- `가` 그리고 `나`'].join('\n'))[0]
  assert.deepEqual(sec.copies, ['가', '나'])
})
