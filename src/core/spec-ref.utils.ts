export const norm = (s: string): string => s.trim().replace(/\s+/g, ' ')

export function nodeText(n: any): string {
  if (n.type === 'text' || n.type === 'inlineCode') return n.value
  if (n.children) return n.children.map(nodeText).join('')
  return ''
}

export function collectInlineCode(n: any, acc: string[] = []): string[] {
  if (n.type === 'inlineCode') acc.push(n.value)
  if (n.children) n.children.forEach((c: any) => collectInlineCode(c, acc))
  return acc
}

export function collectListItems(n: any, acc: any[] = []): any[] {
  if (n.type === 'listItem') acc.push(n)
  if (n.children) n.children.forEach((c: any) => collectListItems(c, acc))
  return acc
}
