# spec-ref

코드가 `@spec` 주석으로 SPEC 문서의 특정 절·항목을 **참조**하고, 그 참조가 살아있는지·값이 일치하는지를 **결정적으로 검증**하는 도구. CLI(CI 게이트)와 LSP(에디터) 두 표면이 같은 코어를 공유한다.

핵심 원칙 한 줄: **SPEC은 소스가 아니라 참조 프레임이다. 도구는 감지·보고만 하고 아무것도 고치지 않는다.** (배경과 근거는 [`DESIGN.md`](./DESIGN.md) 참고.)

---

## 참조 규약

방향은 **코드 → SPEC**. 코드가 자기 근거로 SPEC 절을 가리킨다.

```ts
/** @spec 저장 / 미저장 시 이탈 */ // 절(heading) 참조 — 거침, 안정
export const SAVE_SUCCESS_TOAST = '진료실별 자동 접수 설정을 저장했어요.'

export const LEAVE_CONFIRM = {
  /** @spec 저장 / 미저장 시 이탈 > 타이틀: */ // 항목(listItem) 참조 — 정밀
  header: '자동 접수 설정을 중단하시겠어요?',
  /** @spec 저장 / 미저장 시 이탈 > 내용: */
  content: '중단하면 지금까지 변경한 정보가 저장되지 않아요.',
} as const
```

- `@spec <제목>` — 절 참조.
- `@spec <제목> > <항목 텍스트 prefix>` — 항목 참조. **항목은 위치(n번째)가 아니라 텍스트로 해소**한다. 순서가 바뀌어도 따라가고, 텍스트가 바뀌면 깔끔하게 DEAD로 뜬다.
- JSDoc 태그는 문(const) 단위 또는 프로퍼티 단위로 붙일 수 있다(프로퍼티 우선).

### SPEC 쪽 "명시 카피"

새 마크다운 문법은 없다. 검증 대상 값은 표준 마크다운 요소로 마킹한다:

- **백틱 인라인 코드** — `` `진료실별 자동 접수 설정을 저장했어요.` ``
- **`타이틀:` / `내용:` 라벨 리스트 항목** — `- 타이틀: 자동 접수 설정을 중단하시겠어요?`

백틱으로 통일하면 라벨 특수처리는 사라진다.

---

## 검증 결과 (verdict)

| 결과                                 | 의미                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------- |
| `verified-item` / `verified-section` | 참조한 절/항목이 존재하고 값이 그 노드의 명시 카피와 일치                  |
| `value-mismatch`                     | 참조는 유효하나 코드 값이 SPEC 카피와 다름 (기대값 제시)                   |
| `behavior-item`                      | 참조한 항목이 **서술 노드**(카피 아님) — 이 코드 문자열은 명시 카피가 아님 |
| `dead-item`                          | 제목은 유효하나 항목 텍스트가 없음 (이동 추적 힌트 제공)                   |
| `dead-section`                       | 참조한 절이 없음 (값 매칭으로 이사처 추적)                                 |
| `no-ref`                             | `@spec` 없음 — 값이 SPEC 카피면 참조 붙일 것, 아니면 개발자 창작           |
| `orphan`                             | 참조하는 코드가 없는 SPEC 명시 카피                                        |

노드 타입으로 검증 모드가 갈린다: `inlineCode`/라벨 = 카피(값 대조), 그 외 `listItem` = 서술(존재만 확인. 동작이 코드와 맞는지는 테스트의 몫).

---

## 아키텍처

```
src/core/spec-ref.ts        ← 코어 (순수 함수)
  parseSpec(md)          remark(mdast)로 SPEC을 노드 트리로 분해, 절·항목·카피 추출
  extractCodeRefs(src)   TS AST로 @spec 참조 + 문자열 리터럴 추출
  resolveRefs(secs,refs) 2단 해소 + 노드타입 판정 → verdict
  · spec-ref.types.ts    도메인 타입 (SpecSection·CodeRef·Verdict…)
  · spec-ref.utils.ts    순수 헬퍼 (norm·mdast 순회)
      │
      ├── src/cli/ref-check.ts   CLI 표면 (CI 게이트, exit 1 on 문제)
      └── src/lsp/server.ts      LSP 표면 (에디터: 진단·자동완성·정의·hover)
```

CLI와 LSP는 **같은 `resolveRefs`** 를 공유한다. 판정 로직은 코어에만 있고 표면은 얇다.

---

## 사용법

### 설치

```bash
pnpm i
# 코어/실행: typescript, tsx, mdast-util-from-markdown
# LSP:      vscode-languageserver, vscode-languageserver-textdocument, vscode-uri
```

### CLI (CI 게이트)

```bash
pnpm check <spec.md> <code.ts>          # = tsx src/cli/ref-check.ts …
pnpm check:fixtures                     # fixtures/ 예시로 바로 확인
pnpm check --json <spec.md> <code.ts>   # 기계 판독 verdict (JSON)
# 문제가 있으면 exit 1 → CI에서 머지 차단 가능
```

#### `--json` — 에이전트가 소비하는 계약

사람용 출력은 아이콘·산문이라 파싱이 깨지기 쉽다. `--json`은 코어가 낸 구조화 verdict를 그대로 내보낸다:

```jsonc
{
  "spec": "SPEC.md",
  "files": [
    {
      "path": "messages.ts",
      "rows": [
        {
          "ref": { "path": "LEAVE_CONFIRM.header", "value": "…", "line": 3, "spec": "…> 타이틀:" },
          "verdict": { "kind": "value-mismatch", "section": "…", "label": "…", "expected": ["…"] },
        },
      ],
    },
  ],
  "orphans": [{ "section": "…", "copy": "…" }],
  "errors": 2,
  "ok": false,
}
```

`verdict.kind`(`value-mismatch`·`dead-item`·`no-ref`…)와 `expected`·`movedTo`·`foundIn` 필드로, 코딩 에이전트가 편집 루프에 그대로 물릴 수 있다: **카피 수정 → `pnpm check --json` → `value-mismatch` 감지 → "SPEC과 어긋냈다" 자각 → SPEC 확인**. exit code(0/1)는 두 모드 동일.

### 생성물 검증 (`check:gen`) — md→ts 를 LLM에 맡기는 길

또 다른 접근: SPEC 카피를 **참조 가능한 형태**로 만들려고 `@spec` 앵커를 검증하는 대신, SPEC.md를 **`.ts` 로 투영**한다. 그러면 코드가 문자열을 재복사하지 않고 SPEC 상수를 **소비**한다 — 값 drift가 구조적으로 불가능하고, 절/항목이 사라지면 `tsc`가 컴파일 에러(`dead-section`/`dead-item`)로 잡는다. 네비게이션(go-to-def·find-refs·rename)도 네이티브.

```ts
// spec.gen.ts (SPEC.md 에서 생성)
export const SPEC = {
  '저장 / 미저장 시 이탈': { 타이틀: '자동 접수 설정을 중단하시겠어요?' /* … */ },
} as const

// 소비 코드 — 값을 SPEC 에서 가져온다 (drift 불가). 잘못된 키는 tsc 에러.
export const LEAVE_HEADER = SPEC['저장 / 미저장 시 이탈'].타이틀
```

md→ts **변환 자체는 LLM에 맡길 수 있다** — 단, LLM은 **빌드가 아니라 편집 시점**에 두고 출력을 커밋·리뷰한다. 비결정성은 커밋된 소스로 고정되고, 빌드는 `tsc` + 아래 결정적 그물만 돈다.

```bash
pnpm check:gen <spec.md> <spec.gen.ts>    # 생성물이 SPEC 카피를 verbatim으로 담았는지
pnpm check:gen:fixtures                    # fixtures/ 예시
pnpm check:gen --json …                    # 기계 판독
```

`check:gen`은 SPEC의 명시 카피 집합(코어 `parseSpec`)과 생성물의 문자열 값 집합(TS AST, 키·import 제외)을 **집합 diff** 한다. LLM이 카피를 **누락**하거나 **미묘하게 변형**(마침표 하나 뗀 것까지)하면 `missing`/`hallucinated`로 잡고 exit 1. 컴파일러 지식이 필요 없는 결정적 검사라, "md2ts는 LLM, 충실성은 이 그물"이라는 분업이 성립한다.

> **그물이 못 잡는 것** — 카피의 **존재·verbatim**은 잡지만, 그 카피가 **올바른 헤딩 키 아래** 있는지(배치)는 매핑을 재유도해야 해서 결정적으로는 못 본다. 매핑을 단순하게(헤딩=키) 유지하거나 배치는 사람 리뷰(diff가 작다)에 맡긴다.

### LSP — 헤드리스 검증

VSCode 없이 서버 동작을 확인:

```bash
pnpm lsp:probe     # fixtures/ 를 워크스페이스로 서버를 띄우고 JSON-RPC 왕복
```

initialize → 진단 → 자동완성(절/항목) → 정의 점프 → SPEC.md 편집 후 크로스파일 재검증까지 출력한다.

> **VSCode 헤딩 링크 익스텐션은 은퇴했다.** md→ts 투영 방향에선 코드가 `SPEC` 상수를 소비하므로 go-to-def·find-refs·rename이 **네이티브**다 — `.md#헤딩`을 클릭 가능하게 만들 이유가 사라졌다. (이력은 git 참고.)

---

## 한계

- **prefix 유일성** — 두 항목이 같은 텍스트로 시작하면 첫 매치를 잡는다. 규약으로 구분 가능한 prefix 사용.
- **하위 트리 카피 상속** — 부모 불릿이 자식의 백틱을 자기 카피로 인정한다. 정밀하게는 백틱 불릿을 직접 가리킬 것.
- **카피 한정** — 문자열 참조만 결정적으로 검증. 동작 참조(예: "3회 실패 시 잠금")는 테스트를 가리키는 참조로 확장 필요.
- **completion 휴리스틱** — 라인 프리픽스로 `@spec` 컨텍스트를 판단(JSDoc AST 확인 아님). 최소 구현.
- **진단 range** — `@spec` 태그 줄이 아니라 값 리터럴 줄에 표시.

---

## 파일 맵

```
src/
  core/
    spec-ref.ts          코어 — parseSpec · extractCodeRefs · resolveRefs
    spec-ref.types.ts    도메인 타입 (SpecSection · CodeRef · Verdict …)
    spec-ref.utils.ts    순수 헬퍼 (norm · mdast 순회)
  cli/
    ref-check.ts         CLI — @spec 참조 검증 (verdict, exit 1 on 문제)
    gen-check.ts         CLI — 생성물(spec.gen.ts) 충실성 검사 (md↔ts 카피 diff)
  lsp/
    server.ts            LSP 서버 (진단 · 자동완성 · 정의 · hover)
    probe.ts             헤드리스 LSP 하네스 (VSCode 없이 검증)
fixtures/
  SPEC.md · messages.ts  CLI·probe 가 쓰는 예시 워크스페이스
  spec.gen.ts            check:gen 예시 생성물 (SPEC.md 투영)
```
