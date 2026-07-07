export type ItemKind = 'copy-label' | 'copy-code' | 'behavior'

export interface SpecItem {
  label: string
  kind: ItemKind
  copyValues: string[]
  line: number
}

export interface SpecSection {
  name: string
  line: number
  uri?: string
  items: SpecItem[]
  copies: Set<string>
  blocks: any[]
}

export interface CodeRef {
  path: string
  value: string
  line: number
  spec: string | null
}

export type Verdict =
  | { kind: 'verified-item'; section: string; label: string }
  | { kind: 'verified-section'; section: string }
  | { kind: 'value-mismatch'; section: string; label: string; expected: string[] }
  | { kind: 'behavior-item'; section: string; label: string }
  | { kind: 'dead-item'; section: string; itemPrefix: string; movedTo: string | null }
  | { kind: 'dead-section'; section: string; movedTo: string | null }
  | { kind: 'no-ref'; foundIn: string | null }

export interface Row {
  ref: CodeRef
  verdict: Verdict
}
