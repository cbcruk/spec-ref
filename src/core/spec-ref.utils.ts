export const norm = (s: string): string => s.trim().replace(/\s+/g, ' ')

export function nodeText(n: any): string {
  if (n.type === 'text' || n.type === 'inlineCode') return n.value
  if (n.children) return n.children.map(nodeText).join('')
  return ''
}
