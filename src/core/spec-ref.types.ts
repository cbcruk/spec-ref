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
  items: SpecItem[]
  copies: Set<string>
  blocks: any[]
}
