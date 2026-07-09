export interface SpecEntry {
  label: string | null // `- 이름: \`값\`` 의 이름 (콜론 앞 텍스트). 없으면 null
  values: string[] // 이 항목의 백틱 카피 값들 (보통 1개)
}

export interface SpecSection {
  name: string
  line: number
  entries: SpecEntry[] // 카피를 가진 리스트 항목들, 문서 순서
  copies: string[] // entries 의 값을 평탄화한 슬롯 배열 (검증기용, 중복 보존)
  legacyLabels: string[] // 옛 규약(`- 타이틀: 값` 백틱 없음)으로 남은 항목 — 보호 밖이므로 보고 대상
}
