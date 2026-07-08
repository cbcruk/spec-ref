import { readFileSync } from 'node:fs'
import { argv } from 'node:process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { parseSpec } from '../core/spec-ref.ts'

// 생성된 .ts에서 '값 위치' 문자열 리터럴만 뽑는다.
// 프로퍼티 키(`"타이틀":`)와 import/export 지정자(`from './x.ts'`)는 제외.
export function extractStringValues(src: string, fileName: string): Set<string> {
  const sf = ts.createSourceFile(fileName, src, ts.ScriptTarget.Latest, true)
  const out = new Set<string>()

  const isPropertyKey = (n: ts.Node): boolean =>
    !!n.parent &&
    ((ts.isPropertyAssignment(n.parent) && n.parent.name === n) ||
      (ts.isPropertySignature(n.parent) && n.parent.name === n))

  const isModuleSpecifier = (n: ts.Node): boolean =>
    !!n.parent && (ts.isImportDeclaration(n.parent) || ts.isExportDeclaration(n.parent))

  const visit = (n: ts.Node): void => {
    if (
      (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) &&
      !isPropertyKey(n) &&
      !isModuleSpecifier(n)
    ) {
      out.add(n.text)
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

export interface GenReport {
  spec: string
  gen: string
  missing: string[] // SPEC 카피인데 생성물에 없음 → 누락
  hallucinated: string[] // 생성물 값인데 SPEC 어디에도 없음 → 환각/오타
  copies: number
  ok: boolean
}

// 순수 로직: SPEC.md 텍스트와 생성물 .ts 텍스트를 받아 충실성을 대조한다.
// 결정적 · 오프라인 · 컴파일러 지식 불필요(집합 diff). LLM 생성물을 감싸는 그물.
export function checkGenContent(
  specMd: string,
  genTs: string,
  meta: { spec: string; gen: string },
): GenReport {
  const secs = parseSpec(specMd)
  const copies = new Set<string>()
  const allowed = new Set<string>() // 카피 ∪ 서술(behavior) — 생성물에 있어도 되는 텍스트
  for (const s of secs) {
    for (const c of s.copies) {
      copies.add(c)
      allowed.add(c)
    }
    for (const it of s.items) if (it.kind === 'behavior') allowed.add(it.label)
  }

  const tsValues = extractStringValues(genTs, meta.gen)

  const missing = [...copies].filter((c) => !tsValues.has(c))
  const hallucinated = [...tsValues].filter((v) => !allowed.has(v))
  return {
    spec: meta.spec,
    gen: meta.gen,
    missing,
    hallucinated,
    copies: copies.size,
    ok: missing.length === 0 && hallucinated.length === 0,
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
  console.log(`\n${r.gen}  ← ${r.spec}  (카피 ${r.copies}개)`)
  for (const m of r.missing) console.log(`  ✗ 누락  SPEC 카피가 생성물에 없음: "${m}"`)
  for (const h of r.hallucinated) console.log(`  ✗ 환각  SPEC에 없는 값: "${h}"`)
  console.log(
    `\n${r.ok ? '✓ 충실 (모든 카피 verbatim 일치)' : `✗ 문제 ${r.missing.length + r.hallucinated.length}건`}`,
  )
}

function main(): void {
  const args = argv.slice(2)
  const json = args.includes('--json')
  const [specPath, genPath] = args.filter((a) => a !== '--json')
  if (!specPath || !genPath) {
    console.error('usage: tsx src/cli/gen-check.ts [--json] <spec.md> <spec.gen.ts>')
    process.exit(2)
  }

  const report = checkGen(specPath, genPath)
  if (json) console.log(JSON.stringify(report, null, 2))
  else renderText(report)

  process.exit(report.ok ? 0 : 1)
}

// 직접 실행될 때만 CLI 구동 (테스트에서 import 해도 main 이 돌지 않게).
if (argv[1] && fileURLToPath(import.meta.url) === argv[1]) main()
