import { fromMarkdown } from 'mdast-util-from-markdown'
import type { ItemKind, SpecSection } from './spec-ref.types.ts'
import { collectInlineCode, collectListItems, norm, nodeText, ownLabel } from './spec-ref.utils.ts'

export type { ItemKind, SpecItem, SpecSection } from './spec-ref.types.ts'

// SPEC.md 를 절(heading) 트리로 분해하고, 각 절의 명시 카피(백틱/라벨)를 추출한다.
export function parseSpec(md: string): SpecSection[] {
  const root: any = fromMarkdown(md)
  const sections: SpecSection[] = []
  let cur: SpecSection | null = null

  for (const node of root.children) {
    if (node.type === 'heading') {
      cur = {
        name: norm(nodeText(node)),
        line: node.position.start.line,
        items: [],
        copies: new Set(),
        blocks: [],
      }
      sections.push(cur)
    } else if (cur) {
      cur.blocks.push(node)
    }
  }

  for (const sec of sections) {
    const lis: any[] = []
    sec.blocks.forEach((b) => collectListItems(b, lis))
    for (const li of lis) {
      const label = ownLabel(li)
      const codes = collectInlineCode(li)
      const m = label.match(/^(타이틀|내용)\s*:\s*(.*)$/)
      let kind: ItemKind = 'behavior'
      let copyValues: string[] = []
      if (m) {
        kind = 'copy-label'
        copyValues = m[2] ? [m[2].trim()] : []
      } else if (codes.length) {
        kind = 'copy-code'
        copyValues = codes
      }
      sec.items.push({ label, kind, copyValues, line: li.position.start.line })
      copyValues.forEach((c) => sec.copies.add(c))
    }
  }
  return sections
}
