export interface SpecSection {
  name: string
  line: number
  copies: string[] // 이 절의 명시 카피 슬롯(리스트 항목의 백틱 값), 문서 순서·중복 보존
  legacyLabels: string[] // 옛 규약(`- 타이틀: 값` 백틱 없음)으로 남은 항목 — 보호 밖이므로 보고 대상
}
