import { fromMarkdown } from 'mdast-util-from-markdown'
import type { SpecSection } from './spec-ref.types.ts'
import { collectInlineCode, collectListItems, norm, nodeText } from './spec-ref.utils.ts'

export type { SpecSection } from './spec-ref.types.ts'

// SPEC.md 를 절(heading) 단위로 분해하고, 각 절의 명시 카피를 추출한다.
// 카피 = 리스트 항목의 백틱 인라인 코드 값. 라벨·서술 같은 별도 분류는 없다 —
// 참조 대상은 verbatim 값 하나뿐이고, 이름은 생성물(.ts)의 몫.
export function parseSpec(md: string): SpecSection[] {
  const root: any = fromMarkdown(md)
  const sections: SpecSection[] = []
  let cur: SpecSection | null = null
  let blocks: any[] = []

  const flush = () => {
    if (!cur) return
    const lis: any[] = []
    blocks.forEach((b) => collectListItems(b, lis))
    for (const li of lis) for (const code of collectInlineCode(li)) cur.copies.push(code)
  }

  for (const node of root.children) {
    if (node.type === 'heading') {
      flush()
      cur = { name: norm(nodeText(node)), line: node.position.start.line, copies: [] }
      sections.push(cur)
      blocks = []
    } else if (cur) {
      blocks.push(node)
    }
  }
  flush()
  return sections
}
