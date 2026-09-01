// 소비 규약의 예시 — 문자열을 재복사하지 않고 SPEC 상수를 가져다 쓴다.
// spec-ref-scan 이 이 파일을 보고 no-ref(재복사)·orphan(미소비) 을 판정한다.
import { SPEC } from './spec.gen.ts'

const leave = SPEC['저장 / 미저장 시 이탈']

export const SAVE_TOAST = leave.저장완료
export const LEAVE_TITLE = leave.타이틀
export const LEAVE_BODY = leave.내용
export const RESUME_TOAST = SPEC['접수 재개'].재개완료
