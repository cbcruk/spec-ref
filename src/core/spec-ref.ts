import { fromMarkdown } from 'mdast-util-from-markdown'
import ts from 'typescript'
import type { CodeRef, ItemKind, Row, SpecSection } from './spec-ref.types.ts'
import { collectInlineCode, collectListItems, norm, nodeText, ownLabel } from './spec-ref.utils.ts'

export type { CodeRef, ItemKind, Row, SpecItem, SpecSection, Verdict } from './spec-ref.types.ts'

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

function specTag(node: ts.Node): string | null {
  for (const tag of ts.getJSDocTags(node)) {
    if (tag.tagName.text !== 'spec') continue
    const c = tag.comment
    if (typeof c === 'string') return norm(c)
    if (Array.isArray(c)) return norm(c.map((p: any) => p.text).join(''))
    return null
  }
  return null
}

export function extractCodeRefs(source: string, fileName = 'messages.ts'): CodeRef[] {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true)
  const out: CodeRef[] = []
  const lineOf = (p: number) => sf.getLineAndCharacterOfPosition(p).line + 1
  const isStr = (n: ts.Node): n is ts.StringLiteral =>
    ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)

  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue
    const stmtSpec = specTag(stmt)
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name) || !decl.initializer) continue
      const base = decl.name.text
      let init = decl.initializer
      if (ts.isAsExpression(init)) init = init.expression
      if (isStr(init)) {
        out.push({ path: base, value: init.text, line: lineOf(init.getStart(sf)), spec: stmtSpec })
      } else if (ts.isObjectLiteralExpression(init)) {
        for (const p of init.properties) {
          if (ts.isPropertyAssignment(p) && isStr(p.initializer)) {
            const propSpec = specTag(p) ?? stmtSpec
            out.push({
              path: `${base}.${p.name.getText(sf).replace(/^['"]|['"]$/g, '')}`,
              value: (p.initializer as ts.StringLiteral).text,
              line: lineOf(p.initializer.getStart(sf)),
              spec: propSpec,
            })
          }
        }
      }
    }
  }
  return out
}

function findCopyAnywhere(secs: SpecSection[], v: string): string | null {
  for (const s of secs) if (s.copies.has(v)) return s.name
  return null
}

export function resolve(
  md: string,
  refs: CodeRef[],
): { rows: Row[]; orphans: { copy: string; section: string }[] } {
  return resolveRefs(parseSpec(md), refs)
}

export function resolveRefs(
  secs: SpecSection[],
  refs: CodeRef[],
): { rows: Row[]; orphans: { copy: string; section: string }[] } {
  const used = new Set<string>()

  const rows: Row[] = refs.map((ref) => {
    if (!ref.spec)
      return { ref, verdict: { kind: 'no-ref', foundIn: findCopyAnywhere(secs, ref.value) } }

    const [head, ...rest] = ref.spec.split('>')
    const heading = norm(head)
    const itemPrefix = rest.length ? norm(rest.join('>')) : null

    const sec = secs.find((s) => s.name === heading)
    if (!sec)
      return {
        ref,
        verdict: {
          kind: 'dead-section',
          section: heading,
          movedTo: findCopyAnywhere(secs, ref.value),
        },
      }

    if (!itemPrefix) {
      if (sec.copies.has(ref.value)) {
        used.add(ref.value)
        return { ref, verdict: { kind: 'verified-section', section: heading } }
      }
      return {
        ref,
        verdict: {
          kind: 'value-mismatch',
          section: heading,
          label: '(절 전체)',
          expected: [...sec.copies],
        },
      }
    }

    const item = sec.items.find((it) => it.label.startsWith(itemPrefix))
    if (!item) {
      let movedTo: string | null = null
      for (const s of secs)
        if (s.items.some((it) => it.label.startsWith(itemPrefix))) {
          movedTo = s.name
          break
        }
      return { ref, verdict: { kind: 'dead-item', section: heading, itemPrefix, movedTo } }
    }
    if (item.kind === 'behavior')
      return { ref, verdict: { kind: 'behavior-item', section: heading, label: item.label } }
    if (item.copyValues.includes(ref.value)) {
      used.add(ref.value)
      return { ref, verdict: { kind: 'verified-item', section: heading, label: item.label } }
    }
    return {
      ref,
      verdict: {
        kind: 'value-mismatch',
        section: heading,
        label: item.label,
        expected: item.copyValues,
      },
    }
  })

  const orphans: { copy: string; section: string }[] = []
  for (const s of secs)
    for (const c of s.copies) if (!used.has(c)) orphans.push({ copy: c, section: s.name })
  return { rows, orphans }
}
