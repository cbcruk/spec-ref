export interface SpecSection {
  name: string
  line: number
  copies: string[] // 이 절의 명시 카피(백틱 인라인 코드) 값들, verbatim
}
