import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { URI } from 'vscode-uri'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../../fixtures')
const serverPath = path.join(HERE, 'server.ts')
const tsPath = path.join(ROOT, 'messages.ts')
const tsUri = URI.file(tsPath).toString()
const tsText = readFileSync(tsPath, 'utf8')

const server = spawn('npx', ['tsx', serverPath], {
  cwd: process.cwd(),
  stdio: ['pipe', 'pipe', 'inherit'],
})

let buf = Buffer.alloc(0)
const handlers: ((msg: any) => void)[] = []
server.stdout.on('data', (d) => {
  buf = Buffer.concat([buf, d])
  while (true) {
    const headerEnd = buf.indexOf('\r\n\r\n')
    if (headerEnd === -1) break
    const header = buf.slice(0, headerEnd).toString()
    const len = Number(/Content-Length: (\d+)/.exec(header)?.[1])
    const start = headerEnd + 4
    if (buf.length < start + len) break
    const msg = JSON.parse(buf.slice(start, start + len).toString())
    buf = buf.slice(start + len)
    handlers.forEach((h) => h(msg))
  }
})
function send(msg: any) {
  const s = JSON.stringify({ jsonrpc: '2.0', ...msg })
  server.stdin.write(`Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`)
}
function waitFor(pred: (m: any) => boolean, ms = 8000): Promise<any> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout')), ms)
    const h = (m: any) => {
      if (pred(m)) {
        clearTimeout(t)
        const i = handlers.indexOf(h)
        if (i >= 0) handlers.splice(i, 1)
        res(m)
      }
    }
    handlers.push(h)
  })
}

const specLineIdx = tsText.split('\n').findIndex((l) => l.includes('@spec 저장'))
const specLine = tsText.split('\n')[specLineIdx]
const afterSpec = specLine.indexOf('@spec ') + '@spec '.length
const afterGt = specLine.indexOf('>') + 2

;(async () => {
  send({
    id: 1,
    method: 'initialize',
    params: {
      processId: process.pid,
      rootUri: URI.file(ROOT).toString(),
      workspaceFolders: [{ uri: URI.file(ROOT).toString(), name: 'fx' }],
      capabilities: {},
    },
  })
  const init = await waitFor((m) => m.id === 1)
  console.log('① initialize → capabilities:', Object.keys(init.result.capabilities).join(', '))

  send({ method: 'initialized', params: {} })
  send({
    method: 'textDocument/didOpen',
    params: { textDocument: { uri: tsUri, languageId: 'typescript', version: 1, text: tsText } },
  })

  const diag = await waitFor(
    (m) => m.method === 'textDocument/publishDiagnostics' && m.params.uri === tsUri,
  )
  console.log(`\n② diagnostics (${diag.params.diagnostics.length}건):`)
  for (const d of diag.params.diagnostics)
    console.log(`   L${d.range.start.line + 1} [${d.severity === 1 ? 'ERR' : 'WARN'}] ${d.message}`)

  send({
    id: 2,
    method: 'textDocument/completion',
    params: { textDocument: { uri: tsUri }, position: { line: specLineIdx, character: afterSpec } },
  })
  const c1 = await waitFor((m) => m.id === 2)
  console.log(`\n③ completion @ "@spec ▮"  → 절 이름 ${c1.result.length}개:`)
  console.log('   ' + c1.result.map((i: any) => i.label).join(' | '))

  send({
    id: 3,
    method: 'textDocument/completion',
    params: { textDocument: { uri: tsUri }, position: { line: specLineIdx, character: afterGt } },
  })
  const c2 = await waitFor((m) => m.id === 3)
  console.log(`\n④ completion @ "…이탈 > ▮"  → 항목 라벨 ${c2.result.length}개:`)
  for (const i of c2.result.slice(0, 6)) console.log(`   • ${i.label}   (${i.detail})`)

  send({
    id: 4,
    method: 'textDocument/definition',
    params: { textDocument: { uri: tsUri }, position: { line: specLineIdx, character: afterGt } },
  })
  const def = await waitFor((m) => m.id === 4)
  const loc = def.result
  console.log(
    `\n⑤ definition @ "…이탈 > 타이틀:" → ${URI.parse(loc.uri).fsPath.split('/').pop()}:${loc.range.start.line + 1}`,
  )

  const mdPath = path.join(ROOT, 'SPEC.md')
  const mdUri = URI.file(mdPath).toString()
  const mdText = readFileSync(mdPath, 'utf8')
  send({
    method: 'textDocument/didOpen',
    params: { textDocument: { uri: mdUri, languageId: 'markdown', version: 1, text: mdText } },
  })
  const renamed = mdText.replace('## 저장 / 미저장 시 이탈', '## 저장 정책')
  const deadDiag = waitFor(
    (m) =>
      m.method === 'textDocument/publishDiagnostics' &&
      m.params.uri === tsUri &&
      m.params.diagnostics.some((d: any) => d.message.includes('없음')),
  )
  send({
    method: 'textDocument/didChange',
    params: { textDocument: { uri: mdUri, version: 2 }, contentChanges: [{ text: renamed }] },
  })
  const diag2 = await deadDiag
  console.log(`\n⑥ SPEC.md 제목 rename ("저장 / 미저장 시 이탈"→"저장 정책") 후 .ts 자동 재검증:`)
  for (const d of diag2.params.diagnostics.filter((d: any) => d.severity === 1))
    console.log(`   L${d.range.start.line + 1} [ERR] ${d.message}`)

  send({ id: 99, method: 'shutdown' })
  await waitFor((m) => m.id === 99)
  send({ method: 'exit' })
  server.kill()
  console.log('\n✓ LSP 서버가 실제 JSON-RPC에 응답 완료')
})().catch((e) => {
  console.error('probe error:', e)
  server.kill()
  process.exit(1)
})
