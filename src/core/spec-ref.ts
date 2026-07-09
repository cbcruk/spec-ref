import { fromMarkdown } from 'mdast-util-from-markdown'
import type { SpecSection } from './spec-ref.types.ts'
import { norm, nodeText } from './spec-ref.utils.ts'

export type { SpecSection } from './spec-ref.types.ts'

const LEGACY_LABEL = /^(타이틀|내용)\s*:/

// 한 번의 순회로 절의 카피(리스트 항목 안 백틱 값)를 수집한다. 각 노드를 정확히
// 한 번씩 방문하므로 중첩 리스트의 백틱도 한 번만 수집된다.
// 옛 카피 규약(`- 타이틀: 값` — 백틱 없음)으로 남은 항목은 보호가 사라진 채
// 조용히 통과하지 않도록 legacyLabels 로 보고한다.
function collect(n: any, inListItem: boolean, sec: SpecSection): void {
  if (n.type === 'inlineCode') {
    if (inListItem) sec.copies.push(n.value)
    return
  }
  if (n.type === 'listItem') {
    const para = (n.children ?? []).find((c: any) => c.type === 'paragraph')
    if (para) {
      const hasCode = (para.children ?? []).some((c: any) => c.type === 'inlineCode')
      const text = norm(nodeText(para))
      if (!hasCode && LEGACY_LABEL.test(text)) sec.legacyLabels.push(text)
    }
    for (const c of n.children ?? []) collect(c, true, sec)
    return
  }
  for (const c of n.children ?? []) collect(c, inListItem, sec)
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
        copies: [],
        legacyLabels: [],
      }
      sections.push(cur)
    } else if (cur) {
      collect(node, false, cur)
    }
  }
  return sections
}
