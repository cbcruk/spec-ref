import { readFileSync } from 'node:fs'
import {
  parseSpec,
  extractCodeRefs,
  resolveRefs,
  type Row,
  type Verdict,
} from '../core/spec-ref.ts'

const ERROR_KINDS = new Set<Verdict['kind']>(['value-mismatch', 'dead-section', 'dead-item'])
const isError = (kind: Verdict['kind']) => ERROR_KINDS.has(kind)

function describe({ ref, verdict }: Row): { icon: string; msg: string; error: boolean } {
  switch (verdict.kind) {
    case 'verified-item':
      return { icon: '✓', error: false, msg: `${verdict.section} › ${verdict.label}` }
    case 'verified-section':
      return { icon: '✓', error: false, msg: `${verdict.section} (절)` }
    case 'value-mismatch':
      return {
        icon: '✗',
        error: true,
        msg: `값 불일치 @ ${verdict.section} › ${verdict.label}\n      코드: "${ref.value}"\n      SPEC: ${verdict.expected.map((e) => `"${e}"`).join(', ') || '(카피 없음)'}`,
      }
    case 'dead-section':
      return {
        icon: '✗',
        error: true,
        msg: `절 없음: "${verdict.section}"${verdict.movedTo ? ` · 값은 '${verdict.movedTo}'에 있음` : ''}`,
      }
    case 'dead-item':
      return {
        icon: '✗',
        error: true,
        msg: `항목 없음: "${verdict.itemPrefix}" (절 '${verdict.section}'은 유효)${verdict.movedTo ? ` → '${verdict.movedTo}'로 이동한 듯` : ''}`,
      }
    case 'behavior-item':
      return {
        icon: '!',
        error: false,
        msg: `서술 노드 참조 @ ${verdict.section} › ${verdict.label} — "${ref.value}"는 명시 카피 아님`,
      }
    case 'no-ref':
      return {
        icon: '·',
        error: false,
        msg: verdict.foundIn
          ? `@spec 없음 · 값은 '${verdict.foundIn}' 절의 카피`
          : `@spec 없음 · SPEC 미명시 카피`,
      }
  }
}

interface FileResult {
  path: string
  rows: Row[]
}
interface Orphan {
  section: string
  copy: string
}
interface CheckReport {
  spec: string
  files: FileResult[]
  orphans: Orphan[]
  errors: number
  ok: boolean
}

function check(specPath: string, codePaths: string[]): CheckReport {
  const secs = parseSpec(readFileSync(specPath, 'utf8'))
  const files: FileResult[] = []
  const usedCopies = new Set<string>()
  let errors = 0

  for (const codePath of codePaths) {
    const refs = extractCodeRefs(readFileSync(codePath, 'utf8'), codePath)
    const { rows } = resolveRefs(secs, refs)
    for (const row of rows) {
      if (isError(row.verdict.kind)) errors++
      if (row.verdict.kind === 'verified-item' || row.verdict.kind === 'verified-section')
        usedCopies.add(row.ref.value)
    }
    files.push({ path: codePath, rows })
  }

  const orphans: Orphan[] = []
  for (const s of secs)
    for (const c of s.copies) if (!usedCopies.has(c)) orphans.push({ section: s.name, copy: c })

  return { spec: specPath, files, orphans, errors, ok: errors === 0 }
}

function renderText(report: CheckReport): void {
  for (const { path, rows } of report.files) {
    console.log(`\n${path}`)
    for (const row of rows) {
      const { icon, msg } = describe(row)
      console.log(`  ${icon} L${row.ref.line} ${row.ref.path}  ${msg}`)
    }
  }
  if (report.orphans.length) {
    console.log(`\norphan (참조하는 코드 없는 SPEC 카피): ${report.orphans.length}건`)
    for (const o of report.orphans) console.log(`  ○ ${o.section} › "${o.copy}"`)
  }
  console.log(`\n${report.ok ? '✓ 통과' : `✗ 문제 ${report.errors}건`}`)
}

function main(): void {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const [specPath, ...codePaths] = args.filter((a) => a !== '--json')
  if (!specPath || codePaths.length === 0) {
    console.error('usage: tsx src/cli/ref-check.ts [--json] <spec.md> <code.ts> [more.ts ...]')
    process.exit(2)
  }

  const report = check(specPath, codePaths)
  if (json) console.log(JSON.stringify(report, null, 2))
  else renderText(report)

  process.exit(report.ok ? 0 : 1)
}

main()
