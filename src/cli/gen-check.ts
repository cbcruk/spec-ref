import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { parseSpec } from '../core/spec-ref.ts'

// 값 위치(value position)의 문자열 리터럴인가 — 포함 규칙.
// 프로퍼티 초기값·배열 원소·변수 초기값만 값으로 센다. 그 밖의 위치
// (프로퍼티 키·computed key·element access·import 지정자·호출 인자 등)는
// 카피 값이 아니므로 제외된다. 제외 목록을 늘리는 대신 포함 조건을 고정한다.
function isValuePosition(n: ts.Node): boolean {
  let cur: ts.Node = n
  let parent = cur.parent
  while (
    parent &&
    (ts.isAsExpression(parent) ||
      ts.isSatisfiesExpression(parent) ||
      ts.isParenthesizedExpression(parent))
  ) {
    cur = parent
    parent = cur.parent
  }
  if (!parent) return false
  if (ts.isPropertyAssignment(parent) && parent.initializer === cur) return true
  if (ts.isArrayLiteralExpression(parent)) return true
  if (ts.isVariableDeclaration(parent) && parent.initializer === cur) return true
  return false
}

// 생성된 .ts 의 값 위치 문자열들을 문서 순서·중복 보존으로 뽑는다(슬롯 대조용).
export function extractStringValues(src: string, fileName: string): string[] {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true)
  const out: string[] = []
  const visit = (n: ts.Node): void => {
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && isValuePosition(n)) {
      out.push(n.text)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

export interface GenReport {
  spec: string
  gen: string
  missing: string[] // SPEC 카피 슬롯 수보다 생성물 출현이 적음 → 누락
  hallucinated: string[] // 생성물 값인데 SPEC 어디에도 없음 → 환각/오타
  legacyLabels: string[] // 옛 규약(백틱 없는 타이틀:/내용:) 항목 — 보호 밖, 마이그레이션 필요
  copies: number // SPEC 카피 슬롯 총수 (distinct 아님)
  ok: boolean
}

const countBy = (xs: string[]): Map<string, number> => {
  const m = new Map<string, number>()
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1)
  return m
}

// 순수 로직: SPEC.md 텍스트와 생성물 .ts 텍스트를 받아 충실성을 대조한다.
// 슬롯(multiset) 대조 — 같은 카피가 두 절에 있으면 생성물에도 두 번 실려야 한다.
// (전엔 Set 이라 한 번만 실려도 통과 → 절 하나가 통째로 빠져도 green 이었다.)
// 단, 생성물이 정당한 카피를 더 많이 싣는 것(초과 출현)은 허용한다.
export function checkGenContent(
  specMd: string,
  genTs: string,
  meta: { spec: string; gen: string },
): GenReport {
  const secs = parseSpec(specMd)
  const specSlots: string[] = []
  const legacyLabels: string[] = []
  for (const s of secs) {
    specSlots.push(...s.copies)
    legacyLabels.push(...s.legacyLabels)
  }
  const specCount = countBy(specSlots)
  const genCount = countBy(extractStringValues(genTs, meta.gen))

  const missing = [...specCount.entries()]
    .filter(([c, n]) => (genCount.get(c) ?? 0) < n)
    .map(([c]) => c)
  const hallucinated = [...genCount.keys()].filter((v) => !specCount.has(v))

  return {
    spec: meta.spec,
    gen: meta.gen,
    missing,
    hallucinated,
    legacyLabels,
    copies: specSlots.length,
    ok: missing.length === 0 && hallucinated.length === 0 && legacyLabels.length === 0,
  }
}

// 파일 경로 래퍼.
export function checkGen(specPath: string, genPath: string): GenReport {
  return checkGenContent(readFileSync(specPath, 'utf8'), readFileSync(genPath, 'utf8'), {
    spec: specPath,
    gen: genPath,
  })
}

function renderText(r: GenReport): void {
  console.log(`\n${r.gen}  ← ${r.spec}  (카피 슬롯 ${r.copies}개)`)
  for (const m of r.missing) console.log(`  ✗ 누락  SPEC 카피 슬롯 수만큼 생성물에 없음: "${m}"`)
  for (const h of r.hallucinated) console.log(`  ✗ 환각  SPEC에 없는 값: "${h}"`)
  for (const l of r.legacyLabels)
    console.log(`  ✗ 미마이그레이션  옛 규약 라벨(백틱 없음): "${l}" — 값을 백틱으로 감쌀 것`)
  const problems = r.missing.length + r.hallucinated.length + r.legacyLabels.length
  console.log(`\n${r.ok ? '✓ 충실 (모든 카피 verbatim 일치)' : `✗ 문제 ${problems}건`}`)
}

export function runCheckGen(args: string[]): void {
  const json = args.includes('--json')
  const [specPath, genPath] = args.filter((a) => a !== '--json')
  if (!specPath || !genPath) {
    console.error('usage: spec-ref-check [--json] <spec.md> <spec.gen.ts>')
    process.exit(2)
  }

  const report = checkGen(specPath, genPath)
  if (json) console.log(JSON.stringify(report, null, 2))
  else renderText(report)

  process.exit(report.ok ? 0 : 1)
}
