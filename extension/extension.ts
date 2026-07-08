import * as fs from 'node:fs'
import * as path from 'node:path'
import {
  languages,
  Uri,
  Range,
  DocumentLink,
  type DocumentLinkProvider,
  type ExtensionContext,
  type TextDocument,
} from 'vscode'
import { resolveHeadingLine } from './md-anchors'

// 코드 주석 안에서 `<경로>.md#<앵커>` 링크를 잡는다.
// {@link ./SPEC.md#이탈}, @see ./SPEC.md#이탈, [텍스트](./SPEC.md#이탈) 모두 커버.
// 공백·따옴표·괄호에서 멈춰 마크다운/JSDoc 구두점을 배제한다.
const MD_ANCHOR = /([^\s"'(){}[\]<>]+\.md)#([^\s"'(){}[\]<>]+)/g

interface Pending {
  mdPath: string
  fragment: string
  from: Uri
}
const pending = new WeakMap<DocumentLink, Pending>()

class MdHeadingLinkProvider implements DocumentLinkProvider {
  provideDocumentLinks(doc: TextDocument): DocumentLink[] {
    const text = doc.getText()
    const links: DocumentLink[] = []
    for (const m of text.matchAll(MD_ANCHOR)) {
      const start = m.index ?? 0
      const range = new Range(doc.positionAt(start), doc.positionAt(start + m[0].length))
      const link = new DocumentLink(range)
      pending.set(link, { mdPath: m[1], fragment: m[2], from: doc.uri })
      links.push(link)
    }
    return links
  }

  // 클릭/호버 시점에만 대상 .md를 읽어 헤딩 줄을 찾는다(지연 해소).
  async resolveDocumentLink(link: DocumentLink): Promise<DocumentLink> {
    const p = pending.get(link)
    if (!p) return link
    const abs = path.resolve(path.dirname(p.from.fsPath), p.mdPath)
    try {
      const md = await fs.promises.readFile(abs, 'utf8')
      const line = resolveHeadingLine(md, p.fragment)
      // durable한 헤딩 슬러그 → 그 순간의 #L<line> 으로 번역. VSCode가 해당 줄로 점프.
      link.target = line === null ? Uri.file(abs) : Uri.file(abs).with({ fragment: `L${line + 1}` })
    } catch {
      // 대상 파일 없음 등 — target 미설정(클릭 비활성)
    }
    return link
  }
}

export function activate(context: ExtensionContext): void {
  const selector = ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].map(
    (language) => ({ scheme: 'file', language }),
  )
  context.subscriptions.push(
    languages.registerDocumentLinkProvider(selector, new MdHeadingLinkProvider()),
  )
}

export function deactivate(): void {}
