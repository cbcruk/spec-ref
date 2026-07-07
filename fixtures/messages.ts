export const LEAVE_CONFIRM = {
  /** @spec 저장 / 미저장 시 이탈 > 타이틀: */
  header: '자동 접수 설정을 중단하시겠어요?',
  /** @spec 저장 / 미저장 시 이탈 > 내용: */
  content: '중단하면 지금까지 변경한 정보가 저장되지 않아요.',
} as const

/** @spec 저장 / 미저장 시 이탈 */
export const SAVE_SUCCESS_TOAST = '진료실별 자동 접수 설정을 저장했어요.'

/** @spec 접수 재개 */
export const RESUME_TOAST = '자동 접수를 다시 시작했어요.'
