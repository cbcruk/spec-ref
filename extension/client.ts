import * as path from 'node:path'
import { workspace, type ExtensionContext } from 'vscode'
import {
  LanguageClient,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions,
} from 'vscode-languageclient/node'

let client: LanguageClient

export function activate(context: ExtensionContext) {
  const serverModule = context.asAbsolutePath(path.join('out', 'server.js'))
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio },
    debug: { module: serverModule, transport: TransportKind.stdio },
  }

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: 'file', language: 'typescript' },
      { scheme: 'file', language: 'typescriptreact' },
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/*.md'),
    },
  }

  client = new LanguageClient('specRef', 'SPEC Reference', serverOptions, clientOptions)
  client.start()
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop()
}
