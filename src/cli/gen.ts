import { readFileSync, writeFileSync } from 'node:fs'
import { parseSpec } from '../core/spec-ref.ts'

// SPEC.md → spec.gen.ts 결정적 생성기.
// 이름 규약: `- 이름: \`값\`` 의 이름이 키가 된다. 라벨이 곧 키이므로
// LLM 없이 md→ts 가 결정적이다. --check 로 커밋된 생성물의 신선도를 게이트.

const IDENT = /^[\p{ID_Start}$_][\p{ID_Continue}$]*$/u
const q = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const key = (s: string): string => (IDENT.test(s) ? s : q(s))

export interface GenResult {
  code: string
  warnings: string[] // 이름 없는 카피 등 — 생성은 되나 참조성이 떨어지는 것
  errors: string[] // 중복 라벨·중복 절·옛 규약 등 — 생성물을 쓰면 안 되는 것
}

export function generate(specMd: string, regenCmd = 'spec-ref-gen'): GenResult {
  const secs = parseSpec(specMd)
  const warnings: string[] = []
  const errors: string[] = []
  const seenSections = new Set<string>()
  const lines: string[] = [
    `// 생성됨 — 직접 수정 금지. SPEC.md 를 고치고 재생성할 것: ${regenCmd}`,
    'export const SPEC = {',
  ]

  for (const sec of secs) {
    if (seenSections.has(sec.name)) errors.push(`중복 절 이름: "${sec.name}"`)
    seenSections.add(sec.name)

    const body: string[] = []
    const seenLabels = new Set<string>()
    const unnamed: string[] = []
    for (const e of sec.entries) {
      if (!e.label) {
        unnamed.push(...e.values)
        continue
      }
      if (seenLabels.has(e.label)) {
        errors.push(`절 "${sec.name}" 에 중복 라벨: "${e.label}"`)
        continue
      }
      seenLabels.add(e.label)
      body.push(
        e.values.length === 1
          ? `    ${key(e.label)}: ${q(e.values[0])},`
          : `    ${key(e.label)}: [${e.values.map(q).join(', ')}],`,
      )
    }
    if (unnamed.length) {
      if (seenLabels.has('copies'))
        errors.push(`절 "${sec.name}": 라벨 'copies' 가 이름 없는 카피 배열과 충돌`)
      for (const v of unnamed)
        warnings.push(
          `절 "${sec.name}" 에 이름 없는 카피 ${q(v)} — 라벨을 붙이면 이름으로 참조 가능`,
        )
      body.push(`    copies: [${unnamed.map(q).join(', ')}],`)
    }
    for (const l of sec.legacyLabels)
      errors.push(`절 "${sec.name}" 옛 규약 라벨(백틱 없음): "${l}" — 값을 백틱으로 감쌀 것`)

    lines.push(body.length ? `  ${key(sec.name)}: {` : `  ${key(sec.name)}: {},`)
    if (body.length) {
      lines.push(...body, '  },')
    }
  }
  lines.push('} as const')
  return { code: lines.join('\n') + '\n', warnings, errors }
}

export function runGen(args: string[]): void {
  const flagValue = (flag: string): string | null => {
    const i = args.indexOf(flag)
    return i >= 0 ? (args[i + 1] ?? null) : null
  }
  const outPath = flagValue('--out')
  const checkPath = flagValue('--check')
  const flagArgIdx = new Set(
    ['--out', '--check']
      .map((f) => args.indexOf(f))
      .filter((i) => i >= 0)
      .map((i) => i + 1),
  )
  const [specPath] = args.filter((a, i) => !a.startsWith('--') && !flagArgIdx.has(i))
  const badFlag = (args.includes('--out') && !outPath) || (args.includes('--check') && !checkPath)
  if (!specPath || badFlag) {
    console.error('usage: spec-ref-gen <spec.md> [--out <spec.gen.ts>] [--check <spec.gen.ts>]')
    process.exit(2)
  }

  // --out 과 --check 가 같은 헤더를 만들어야 신선도 비교가 성립한다.
  const target = outPath ?? checkPath
  const regenCmd = target ? `spec-ref-gen ${specPath} --out ${target}` : 'spec-ref-gen'
  const { code, warnings, errors } = generate(readFileSync(specPath, 'utf8'), regenCmd)
  for (const w of warnings) console.error(`⚠ ${w}`)
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`)
    process.exit(1)
  }

  if (checkPath) {
    const existing = readFileSync(checkPath, 'utf8')
    if (existing === code) {
      console.log(`✓ 최신 — ${checkPath} 는 ${specPath} 와 일치`)
    } else {
      console.error(
        `✗ 낡음 — ${checkPath} 가 ${specPath} 재생성 결과와 다름. 재생성할 것: ${regenCmd}`,
      )
      process.exit(1)
    }
  } else if (outPath) {
    writeFileSync(outPath, code)
    console.log(`생성 완료 → ${outPath}`)
  } else {
    process.stdout.write(code)
  }
}
