import { readFileSync } from 'node:fs'
import { parseSpec, extractCodeRefs, resolveRefs, type Row } from '../core/spec-ref.ts'

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

function main(): void {
  const [specPath, ...codePaths] = process.argv.slice(2)
  if (!specPath || codePaths.length === 0) {
    console.error('usage: tsx src/cli/ref-check.ts <spec.md> <code.ts> [more.ts ...]')
    process.exit(2)
  }

  const secs = parseSpec(readFileSync(specPath, 'utf8'))
  let errors = 0
  const usedCopies = new Set<string>()

  for (const codePath of codePaths) {
    const refs = extractCodeRefs(readFileSync(codePath, 'utf8'), codePath)
    const { rows } = resolveRefs(secs, refs)
    console.log(`\n${codePath}`)
    for (const row of rows) {
      const { icon, msg, error } = describe(row)
      if (error) errors++
      if (row.verdict.kind === 'verified-item' || row.verdict.kind === 'verified-section')
        usedCopies.add(row.ref.value)
      console.log(`  ${icon} L${row.ref.line} ${row.ref.path}  ${msg}`)
    }
  }

  const orphans: string[] = []
  for (const s of secs)
    for (const c of s.copies) if (!usedCopies.has(c)) orphans.push(`${s.name} › "${c}"`)
  if (orphans.length) {
    console.log(`\norphan (참조하는 코드 없는 SPEC 카피): ${orphans.length}건`)
    for (const o of orphans) console.log(`  ○ ${o}`)
  }

  console.log(`\n${errors === 0 ? '✓ 통과' : `✗ 문제 ${errors}건`}`)
  process.exit(errors === 0 ? 0 : 1)
}

main()
