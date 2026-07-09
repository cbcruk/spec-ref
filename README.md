# spec-ref

SPEC 문서가 못 박은 사용자 노출 카피를, 코드가 **참조 가능한 형태로 소비**하게 만드는 도구. SPEC.md를 `.ts`로 투영하고(`spec.gen.ts`), 코드는 문자열을 재복사하지 않고 그 **SPEC 상수를 가져다 쓴다**. **SPEC 상수를 소비하는 코드에선** 값 drift가 구조적으로 불가능해지고, 참조 무결성은 `tsc`가, 생성물 충실성은 `check:gen`이 지킨다.

> 보증의 범위 — 이 보증은 소비를 **선택한** 코드에만 미친다. 어떤 도구도 "모든 카피성 문자열이 SPEC 상수를 소비하는가"는 강제하지 않으므로, 개발자가 문구를 하드코딩으로 재복사하면 그 문자열은 그물 밖이다. 소비 규약은 코드리뷰의 몫.

핵심 원칙 한 줄: **SPEC은 소스가 아니라 참조 프레임이다. 도구는 감지·보고만 하고 아무것도 고치지 않는다.** (초기 설계 배경은 [`DESIGN.md`](./DESIGN.md) — `@spec` 앵커 + CLI/LSP 검증 시절의 기록이며, 아래 md→ts 방향으로 피봇하기 전 이력이다.)

---

## 접근 — SPEC.md 를 `.ts` 로 투영

SPEC 카피를 "참조 가능"하게 만들려고 마크다운을 앵커로 검증하는 대신, **이미 참조 가능한 것(TS 모듈)** 으로 바꾼다.

투영은 **flat 참조 모델**이다 — `절 > 이름 > 값`. 계층·서술·구조를 충실히 옮기는 게 아니라, 코드가 가리킬 **이름 붙은 leaf 값**만 담는다.

```ts
// spec.gen.ts — SPEC.md 에서 생성 (직접 수정 금지)
export const SPEC = {
  '저장 / 미저장 시 이탈': {
    저장완료: '진료실별 자동 접수 설정을 저장했어요.',
    타이틀: '자동 접수 설정을 중단하시겠어요?',
    내용: '중단하면 지금까지 변경한 정보가 저장되지 않아요.',
  },
} as const

// 소비 코드 — 값을 SPEC 에서 가져온다. 문자열을 재복사하지 않는다.
export const LEAVE_HEADER = SPEC['저장 / 미저장 시 이탈'].타이틀
```

여기서 공짜로 얻는 것 — **전부 `tsc`와 언어서비스가 준다, 별도 도구 없이:**

- **값 drift 불가능** — 코드가 SPEC 상수를 소비하니 문구가 한 곳에만 산다. SPEC이 바뀌면 소비처가 자동으로 새 값을 받는다.
- **dead 참조 = 컴파일 에러** — 절/키가 사라지거나 리네임되면 옛 접근이 `tsc` 에러(`Property … does not exist`)로 뜬다.
- **네이티브 네비게이션** — go-to-def·find-references·rename이 그냥 된다.

헤딩·이름은 식별자로 억지 변환하지 않고 **따옴표 키 + bracket 접근**(`SPEC['저장 / 미저장 시 이탈'].타이틀`)을 쓴다. 원문 그대로 두면서 TS가 존재를 검사하므로 슬러그 변환 문제가 없다. **키(이름)는 작성자/LLM의 네이밍 자유고, 아래 `check:gen`은 값만 SPEC 카피와 대조한다.**

---

## md→ts 변환은 LLM, 충실성은 결정적 그물

`.md → .ts` 투영은 헤딩 계층·escaping 등 손이 많이 가는 변환이다. 이걸 **LLM에 맡기되**, 두 가지를 지킨다:

1. **LLM은 빌드가 아니라 편집 시점에.** 생성물을 커밋·리뷰한다. 비결정성은 커밋된 소스로 고정되고, 빌드는 `tsc` + 아래 그물만 돈다(오프라인·재현 가능).
2. **결정적 그물이 감싼다.** LLM이 카피를 누락하거나 미묘하게 변형할 위험을, 집합 diff로 잡는다.

```bash
pnpm i                                       # mdast-util-from-markdown, tsx, typescript
pnpm check:gen <spec.md> <spec.gen.ts>       # 생성물이 SPEC 카피를 verbatim 담았는지
pnpm check:gen:fixtures                       # fixtures/ 예시로 바로 확인
pnpm check:gen --json <spec.md> <spec.gen.ts> # 기계 판독 (에이전트/CI)
pnpm test                                     # node:test 유닛 (tsx --test)
# 문제가 있으면 exit 1 → CI 게이트
```

`check:gen`은 SPEC의 카피 **슬롯**(코어 `parseSpec` — **리스트 항목의 백틱 인라인 코드 값**, 절마다 나온 횟수 보존)과 생성물의 **값 위치** 문자열(TS AST — 프로퍼티 초기값·배열 원소·변수 초기값만; 키·computed key·element access·import 지정자는 제외)을 **출현 횟수까지 대조**한다:

- `missing` — SPEC 슬롯 수보다 생성물 출현이 적음 → LLM 누락. **같은 카피가 두 절에 있으면 생성물에도 두 번 실려야 한다** — 한 절이 통째로 빠지는 걸 잡기 위해서다. (정당한 카피의 초과 출현은 허용.)
- `hallucinated` — 생성물에만 있음(SPEC 어디에도 없음) → LLM 환각·오타 (마침표 하나 뗀 변형까지 잡힌다)
- `legacyLabels` — **옛 규약**(`- 타이틀: 값` — 백틱 없음)으로 남은 항목. 백틱 규약에선 보호 밖이므로 조용히 통과시키지 않고 실패로 보고한다 — 값을 백틱으로 감싸 마이그레이션할 것.

`--json`은 `{ missing, hallucinated, legacyLabels, copies, ok }` 를 그대로 내보내, 코딩 에이전트가 편집 루프에 물릴 수 있다: **md 편집 → 재생성 → `check:gen --json` → `missing`/`hallucinated` 감지 → 수정.** 컴파일러 지식이 필요 없는 결정적 검사라 "md2ts는 LLM, 충실성은 이 그물"이라는 분업이 성립한다.

> **카피 규약** — 참조 대상 문구는 SPEC.md에서 **백틱으로 감싼다**(`` - 타이틀: `자동 접수 설정을 중단하시겠어요?` ``). 백틱만이 "이건 verbatim 카피" 신호다. 백틱 없는 산문 항목(예: "…이탈 전 확인 모달을 띄운다")은 카피가 아니라 그냥 검증 대상이 아니다. 단, 옛 카피 규약 형태(`타이틀:`/`내용:` 라벨인데 백틱 없음)만은 마이그레이션 누락으로 보고 `legacyLabels` 로 잡는다.
>
> **그물이 못 잡는 것** — 카피의 **존재·verbatim·출현 횟수**는 잡지만, 그 카피가 **올바른 이름/절 아래** 있는지(배치)는 검사하지 않는다. 키 네이밍·배치는 사람 리뷰(diff가 작다)에 맡긴다.

---

## 아키텍처

```
src/core/spec-ref.ts        코어 (순수) — parseSpec(md): SPEC → 절·카피(백틱 값)
  · spec-ref.types.ts       도메인 타입 (SpecSection)
  · spec-ref.utils.ts       순수 헬퍼 (norm · mdast 순회)
      │
      └── src/cli/gen-check.ts   생성물 충실성 검사 (md 카피 ↔ ts 문자열, exit 1)
```

md→ts **생성기 자체는 이 저장소에 없다** — LLM이 편집 시점에 만든다. 저장소는 그 결과를 검증하는 결정적 그물(`check:gen`)과, 그 그물이 재사용하는 코어(`parseSpec`)만 담는다.

---

## 파일 맵

```
src/
  core/
    spec-ref.ts          코어 — parseSpec (SPEC.md → 절·카피)
    spec-ref.test.ts     parseSpec 유닛 테스트
    spec-ref.types.ts    도메인 타입 (SpecSection)
    spec-ref.utils.ts    순수 헬퍼 (norm · mdast 순회)
  cli/
    gen-check.ts         생성물 충실성 검사 (md↔ts 카피 집합 diff, --json)
    gen-check.test.ts    checkGenContent · extractStringValues 유닛 테스트
fixtures/
  SPEC.md                예시 SPEC
  spec.gen.ts            SPEC.md 투영 예시 (check:gen 대상)
```

---

## 이력

초기엔 코드가 `@spec` 주석으로 SPEC 절을 가리키고, CLI(verdict)·LSP(에디터 진단)·VSCode 헤딩 링크 익스텐션이 그 참조를 검증·네비게이션했다. **md→ts 투영으로 피봇하면서** 그 표면들은 은퇴했다 — 값 drift·dead 참조는 `tsc`가, 네비게이션은 네이티브 언어서비스가 대체하기 때문. 남은 건 생성물 충실성 하나뿐이고, 그게 `check:gen`이다. (은퇴한 코드는 git 이력 참고.)

단, 대체 없이 **사라진** 검출 두 가지는 알고 있을 것: 옛 `no-ref`(코드가 SPEC 카피를 하드코딩으로 재복사한 경우)와 `orphan`(어떤 코드도 소비하지 않는 SPEC 카피). 둘 다 소비자 코드를 스캔해야 잡히는데 현 도구는 SPEC↔생성물만 본다 — 위 "보증의 범위"가 이 갭의 다른 얼굴이다.
