import { fromMarkdown } from 'mdast-util-from-markdown'
import type { SpecEntry, SpecSection } from './spec-ref.types.ts'
import { norm, nodeText } from './spec-ref.utils.ts'

export type { SpecEntry, SpecSection } from './spec-ref.types.ts'

const LEGACY_LABEL = /^(타이틀|내용)\s*:/

// 리스트 항목 하나에서 라벨과 카피 값을 뽑는다. 중첩 리스트는 별도 항목이므로
// 건너뛰고, 라벨은 첫 백틱 이전 텍스트의 첫 콜론 앞부분이다.
//   `- 이름: \`값\``        → { label: '이름', values: ['값'] }
//   `- \`값\``              → { label: null,  values: ['값'] }
//   `- 산문 (백틱 없음)`     → { label: …,     values: [] }
function itemEntry(li: any): SpecEntry & { text: string } {
  const values: string[] = []
  let before = ''
  let sawCode = false
  const walk = (n: any): void => {
    if (n.type === 'list') return // 중첩 항목은 자기 entry 로 처리된다
    if (n.type === 'inlineCode') {
      values.push(n.value)
      sawCode = true
      return
    }
    if (n.type === 'text' && !sawCode) before += n.value
    for (const c of n.children ?? []) walk(c)
  }
  for (const c of li.children ?? []) walk(c)
  const m = norm(before).match(/^([^:]+):/)
  const label = m ? norm(m[1]) : null
  return { label: label || null, values, text: norm(before) }
}

// 각 listItem 을 정확히 한 번 방문한다(중첩은 부모의 list 자식을 통해서만 진입).
function collectItems(n: any, sec: SpecSection): void {
  if (n.type === 'listItem') {
    const e = itemEntry(n)
    if (e.values.length) {
      sec.entries.push({ label: e.label, values: e.values })
      sec.copies.push(...e.values)
    } else if (LEGACY_LABEL.test(e.text)) {
      sec.legacyLabels.push(e.text)
    }
    for (const c of n.children ?? []) if (c.type === 'list') collectItems(c, sec)
    return
  }
  for (const c of n.children ?? []) collectItems(c, sec)
}

// SPEC.md 를 절(heading) 단위로 분해하고, 각 절의 명시 카피를 추출한다.
// 카피 = 리스트 항목의 백틱 인라인 코드 값. copies 는 슬롯 배열 —
// 같은 문구가 여러 항목에 나오면 그 수만큼 담긴다(검증기가 슬롯 수로 대조).
export function parseSpec(md: string): SpecSection[] {
  const root: any = fromMarkdown(md)
  const sections: SpecSection[] = []
  let cur: SpecSection | null = null

  for (const node of root.children) {
    if (node.type === 'heading') {
      cur = {
        name: norm(nodeText(node)),
        line: node.position.start.line,
        entries: [],
        copies: [],
        legacyLabels: [],
      }
      sections.push(cur)
    } else if (cur) {
      collectItems(node, cur)
    }
  }
  return sections
}
