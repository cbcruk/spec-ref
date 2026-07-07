import {
  createConnection,
  StreamMessageReader,
  StreamMessageWriter,
  TextDocuments,
  TextDocumentSyncKind,
  DiagnosticSeverity,
  CompletionItemKind,
  Location,
  Range,
  type Diagnostic,
  type InitializeResult,
} from 'vscode-languageserver/node'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { URI } from 'vscode-uri'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { parseSpec, extractCodeRefs, resolveRefs, type SpecSection } from '../core/spec-ref.ts'

const connection = createConnection(
  new StreamMessageReader(process.stdin),
  new StreamMessageWriter(process.stdout),
)
const documents = new TextDocuments(TextDocument)

const isMd = (uri: string) => uri.endsWith('.md')
const isTs = (uri: string) => uri.endsWith('.ts') || uri.endsWith('.tsx')

const specIndex = new Map<string, SpecSection[]>()
const allSections = () => [...specIndex.values()].flat()

function indexMd(uri: string, text: string) {
  const secs = parseSpec(text)
  for (const s of secs) s.uri = uri
  specIndex.set(uri, secs)
}

function scanWorkspace(rootUri: string) {
  const root = URI.parse(rootUri).fsPath
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.')) continue
      const full = path.join(dir, name)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else if (name.endsWith('.md')) indexMd(URI.file(full).toString(), readFileSync(full, 'utf8'))
    }
  }
  try {
    walk(root)
  } catch {
    /* ignore */
  }
}

function validateTs(doc: TextDocument) {
  const refs = extractCodeRefs(doc.getText(), doc.uri)
  const { rows } = resolveRefs(allSections(), refs)
  const diagnostics: Diagnostic[] = []
  for (const { ref, verdict } of rows) {
    let message: string | null = null
    let severity: DiagnosticSeverity = DiagnosticSeverity.Error
    switch (verdict.kind) {
      case 'dead-item':
        message =
          `참조 항목 "${verdict.itemPrefix}" 없음 (제목 '${verdict.section}'은 유효)` +
          (verdict.movedTo ? ` → '${verdict.movedTo}' 절로 이동한 듯` : '') +
          ' · @spec 갱신 필요'
        break
      case 'dead-section':
        message =
          `참조 절 "${verdict.section}" 없음` +
          (verdict.movedTo ? ` · 값은 '${verdict.movedTo}'에 있음` : '')
        break
      case 'value-mismatch':
        message = `값 불일치: 코드 "${ref.value}" ≠ SPEC ${verdict.expected.map((e) => `"${e}"`).join(', ') || '(카피 없음)'}`
        break
      case 'behavior-item':
        message = `참조 항목은 서술 노드 — "${ref.value}"는 SPEC 명시 카피가 아님`
        severity = DiagnosticSeverity.Warning
        break
      case 'no-ref':
        message = verdict.foundIn
          ? `@spec 참조 없음 (값은 '${verdict.foundIn}' 절의 카피)`
          : `@spec 참조 없음 · SPEC 미명시 카피`
        severity = DiagnosticSeverity.Warning
        break
    }
    if (!message) continue
    const line = ref.line - 1
    const text = doc.getText(Range.create(line, 0, line + 1, 0))
    diagnostics.push({
      severity,
      range: Range.create(line, 0, line, Math.max(0, text.replace(/\n$/, '').length)),
      message,
      source: 'spec-ref',
    })
  }
  connection.sendDiagnostics({ uri: doc.uri, diagnostics })
}

function revalidateAllTs() {
  for (const doc of documents.all()) if (isTs(doc.uri)) validateTs(doc)
}

function specContext(prefix: string): { heading: string; item: string | null } | null {
  const m = prefix.match(/@spec\s+(.*)$/)
  if (!m) return null
  const raw = m[1].replace(/\*\/\s*$/, '')
  const parts = raw.split('>')
  const heading = parts[0].trim()
  return {
    heading,
    item: parts.length > 1 ? parts.slice(1).join('>').trim() : null,
  }
}

connection.onInitialize((params): InitializeResult => {
  const rootUri = params.workspaceFolders?.[0]?.uri ?? params.rootUri ?? undefined
  if (rootUri) scanWorkspace(rootUri)
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { triggerCharacters: ['@', '>', ' '] },
      definitionProvider: true,
      hoverProvider: true,
    },
  }
})

connection.onInitialized(() => revalidateAllTs())

documents.onDidChangeContent((e) => {
  if (isMd(e.document.uri)) {
    indexMd(e.document.uri, e.document.getText())
    revalidateAllTs()
  } else if (isTs(e.document.uri)) validateTs(e.document)
})

connection.onCompletion((params) => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc || !isTs(doc.uri)) return []
  const prefix = doc.getText(
    Range.create(params.position.line, 0, params.position.line, params.position.character),
  )
  const ctx = specContext(prefix)
  if (!ctx) return []

  if (ctx.item === null) {
    return allSections()
      .filter((s) => s.name.startsWith(ctx.heading))
      .map((s) => ({
        label: s.name,
        kind: CompletionItemKind.Module,
        detail: `SPEC 절 (${URI.parse(s.uri!).fsPath.split('/').pop()})`,
      }))
  }
  const secs = allSections().filter((s) => s.name === ctx.heading)
  const items = secs.flatMap((s) => s.items)
  return items
    .filter((it) => it.label.startsWith(ctx.item!))
    .map((it) => ({
      label: it.label,
      kind: it.kind === 'behavior' ? CompletionItemKind.Field : CompletionItemKind.Value,
      detail: it.kind === 'behavior' ? '서술 항목' : `카피 (${it.copyValues.join(' / ')})`,
    }))
})

connection.onDefinition((params) => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return null
  const lineText = doc.getText(Range.create(params.position.line, 0, params.position.line, 100000))
  const ctx = specContext(lineText)
  if (!ctx) return null
  const sec = allSections().find((s) => s.name === ctx.heading)
  if (!sec?.uri) return null
  let line = sec.line
  if (ctx.item) {
    const it = sec.items.find((i) => i.label.startsWith(ctx.item!))
    if (it) line = it.line
  }
  return Location.create(sec.uri, Range.create(line - 1, 0, line - 1, 0))
})

connection.onHover((params) => {
  const doc = documents.get(params.textDocument.uri)
  if (!doc) return null
  const lineText = doc.getText(Range.create(params.position.line, 0, params.position.line, 100000))
  const ctx = specContext(lineText)
  if (!ctx) return null
  const sec = allSections().find((s) => s.name === ctx.heading)
  if (!sec) return null
  if (ctx.item) {
    const it = sec.items.find((i) => i.label.startsWith(ctx.item!))
    if (it)
      return {
        contents: {
          kind: 'markdown',
          value: `**${sec.name}** › ${it.label}\n\n${it.kind === 'behavior' ? '_서술 항목_' : '카피: `' + it.copyValues.join('`, `') + '`'}`,
        },
      }
  }
  return {
    contents: {
      kind: 'markdown',
      value: `**${sec.name}** — 명시 카피 ${sec.copies.size}개`,
    },
  }
})

documents.listen(connection)
connection.listen()
