import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSpec } from './spec-ref.ts'

// 줄 번호까지 검증하려고 라인 배열로 조립 (인덱스+1 = 1-기반 줄).
const LINES = [
  '# 자동 접수 설정', // 1
  '', // 2
  '진료실별 자동 접수 여부를 저장한다.', // 3
  '', // 4
  '## 저장 / 미저장 시 이탈', // 5
  '', // 6
  '- `진료실별 자동 접수 설정을 저장했어요.`', // 7
  '- 타이틀: 자동 접수 설정을 중단하시겠어요?', // 8
  '- 내용: 중단하면 지금까지 변경한 정보가 저장되지 않아요.', // 9
  '- 저장하지 않은 변경이 있으면 이탈 전 확인 모달을 띄운다.', // 10
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

test('항목 없는 절은 items·copies 가 빈다', () => {
  const [intro] = parseSpec(MD)
  assert.equal(intro.items.length, 0)
  assert.equal(intro.copies.size, 0)
})

test('백틱 인라인 코드 → copy-code, 값이 copies 에 담긴다', () => {
  const sec = parseSpec(MD)[1]
  const code = sec.items.find((i) => i.kind === 'copy-code')
  assert.ok(code)
  assert.deepEqual(code.copyValues, ['진료실별 자동 접수 설정을 저장했어요.'])
  assert.equal(code.line, 7)
  assert.ok(sec.copies.has('진료실별 자동 접수 설정을 저장했어요.'))
})

test('타이틀:/내용: 라벨 → copy-label, 라벨 뒤 값만 카피로 추출', () => {
  const sec = parseSpec(MD)[1]
  const labels = sec.items.filter((i) => i.kind === 'copy-label')
  assert.equal(labels.length, 2)
  const title = labels.find((i) => i.label.startsWith('타이틀'))
  assert.ok(title)
  assert.deepEqual(title.copyValues, ['자동 접수 설정을 중단하시겠어요?'])
  assert.equal(title.line, 8)
  assert.ok(sec.copies.has('자동 접수 설정을 중단하시겠어요?'))
})

test('산문 항목 → behavior, 카피 아님(copies 에 안 들어감)', () => {
  const sec = parseSpec(MD)[1]
  const beh = sec.items.find((i) => i.kind === 'behavior')
  assert.ok(beh)
  assert.equal(beh.label, '저장하지 않은 변경이 있으면 이탈 전 확인 모달을 띄운다.')
  assert.deepEqual(beh.copyValues, [])
  assert.ok(!sec.copies.has(beh.label))
})

test('한 절의 copies 는 카피(코드+라벨)만, 서술은 제외', () => {
  const sec = parseSpec(MD)[1]
  assert.deepEqual(
    [...sec.copies].sort(),
    [
      '중단하면 지금까지 변경한 정보가 저장되지 않아요.',
      '자동 접수 설정을 중단하시겠어요?',
      '진료실별 자동 접수 설정을 저장했어요.',
    ].sort(),
  )
})

test('빈 문서 → 빈 배열', () => {
  assert.deepEqual(parseSpec(''), [])
})

test('heading 앞 텍스트는 어떤 절에도 속하지 않는다', () => {
  const secs = parseSpec(['서문 문단.', '', '# 첫 절', '', '- `카피`'].join('\n'))
  assert.equal(secs.length, 1)
  assert.equal(secs[0].name, '첫 절')
  assert.ok(secs[0].copies.has('카피'))
})
