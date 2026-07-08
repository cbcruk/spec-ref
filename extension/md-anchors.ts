// 마크다운 헤딩 앵커(#슬러그) → 줄 번호 해소. vscode 비의존(헤드리스 테스트 가능).

export interface Heading {
  text: string
  line: number // 0-기반
}

// ```/~~~ 펜스 안은 건너뛰고 ATX 헤딩(#..######)만 수집.
export function parseHeadings(md: string): Heading[] {
  const out: Heading[] = []
  const lines = md.split(/\r?\n/)
  let fence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*(```|~~~)/.test(line)) {
      fence = !fence
      continue
    }
    if (fence) continue
    const m = /^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/.exec(line)
    if (m) out.push({ text: m[1].trim(), line: i })
  }
  return out
}

// GitHub 슬러그: 소문자화 → 문장부호 제거(유니코드 문자·숫자·공백·하이픈 유지) → 공백→하이픈.
// 예) "저장 / 미저장 시 이탈" → "저장--미저장-시-이탈"
export function slugify(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-')
}

// 관대한 정규화: 문장부호·하이픈·공백을 전부 단일 공백으로. 단·이중 하이픈, `/` 차이를 흡수.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

// 헤딩 앵커 fragment를 0-기반 줄 번호로. 못 찾으면 null.
// 1) 정확 GitHub 슬러그  2) 정규화 완전일치  3) 정규화 prefix (마지막 안전망)
export function resolveHeadingLine(md: string, fragment: string): number | null {
  const headings = parseHeadings(md)
  let frag = fragment
  try {
    frag = decodeURIComponent(fragment)
  } catch {
    /* 잘못된 %인코딩 → 원문 사용 */
  }

  const bySlug = headings.find((h) => slugify(h.text) === frag.toLowerCase())
  if (bySlug) return bySlug.line

  const nf = normalize(frag)
  if (!nf) return null

  const byExact = headings.find((h) => normalize(h.text) === nf)
  if (byExact) return byExact.line

  const byPrefix = headings.find((h) => normalize(h.text).startsWith(nf))
  return byPrefix ? byPrefix.line : null
}
