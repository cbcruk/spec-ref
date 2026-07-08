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
# 클라이언트: vscode-languageclient
```

### CLI (CI 게이트)

```bash
pnpm check <spec.md> <code.ts>          # = tsx src/cli/ref-check.ts …
pnpm check:fixtures                     # fixtures/ 예시로 바로 확인
# 문제가 있으면 exit 1 → CI에서 머지 차단 가능
```

### LSP — 헤드리스 검증

VSCode 없이 서버 동작을 확인:

```bash
pnpm lsp:probe     # fixtures/ 를 워크스페이스로 서버를 띄우고 JSON-RPC 왕복
```

initialize → 진단 → 자동완성(절/항목) → 정의 점프 → SPEC.md 편집 후 크로스파일 재검증까지 출력한다.

### LSP — VSCode 익스텐션

`extension/` 아래 `package.json`과 `client.ts`가 스캐폴드. `src/lsp/server.ts`를 stdio로 띄우고 `.ts`/`.tsx`에 붙인다. `**/*.md` watcher로 SPEC 변경을 감지한다.

#### 사전 준비

- **VSCode** `1.75.0` 이상 (`extension/package.json`의 `engines.vscode`)
- **Node.js** `18` 이상 + **pnpm**
- 루트에서 `pnpm i` 완료 — 익스텐션은 서버를 `tsx` 런타임으로 띄우므로 루트의 `tsx`와 `mdast-util-from-markdown`·`vscode-languageserver*` 의존성이 설치돼 있어야 한다.

#### 빌드

```bash
cd extension
pnpm i --ignore-workspace   # vscode-languageclient·@types/vscode 등 클라이언트 의존성
pnpm build                  # tsc -p . && cp -R ../src out/src
```

> **`--ignore-workspace` 이유** — 상위에 `pnpm-workspace.yaml`(Vite+)이 있어, 그냥 `pnpm i`를 돌리면 pnpm이 익스텐션이 아니라 워크스페이스 루트를 설치한다. 그러면 `@types/vscode`·`vscode-languageclient`가 빠져 `Cannot find module 'vscode'` 류의 `tsc` 에러가 난다. `--ignore-workspace`로 익스텐션을 독립 패키지로 설치해야 한다.

빌드는 `extension/tsconfig.json`(module/moduleResolution `Node16`)을 쓴다. `out/client.js`(익스텐션 진입점, CommonJS)와 함께 코어·LSP 소스(`out/src/**`)가 복사되고, 서버는 이 `src/lsp/server.ts`를 `tsx`로 실행한다.

#### 설치 방법 1 — 개발 모드 (Extension Development Host)

가장 빠른 확인 경로. 별도 패키징 없이 바로 띄운다.

1. VSCode로 `extension/` 폴더를 연다.
2. `F5`(또는 **Run and Debug → Run Extension**)를 눌러 **Extension Development Host** 창을 연다.
3. 새 창에서 `.ts`/`.tsx` 파일을 열면 익스텐션이 활성화된다(`activationEvents`). 같은 워크스페이스의 `**/*.md`가 SPEC으로 인덱싱된다.

#### 설치 방법 2 — `.vsix` 패키징 후 설치

팀에 배포하거나 상시 사용하려면 패키징한다.

```bash
cd extension
npx @vscode/vsce package        # spec-ref-lsp-0.1.0.vsix 생성
code --install-extension spec-ref-lsp-0.1.0.vsix
```

또는 VSCode에서 **Extensions 패널 → `···` → Install from VSIX…** 로 `.vsix`를 선택한다.

> **배포 주의** — 현재 스캐폴드는 서버를 `tsx` 런타임으로 실행하므로, `.vsix`를 쓰는 환경에도 `tsx`와 서버 의존성이 필요하다. 독립 배포 시에는 `tsx` 런타임 대신 서버를 **단일 js로 번들**(예: `esbuild`)해 `runtime` 의존을 없애는 것을 권장한다.

#### 설정

익스텐션 매니페스트는 SPEC 인덱싱 범위를 조정할 설정 키를 선언해 둔다:

```jsonc
{
  // SPEC 문서로 인덱싱할 마크다운 glob (기본 "**/*.md")
  "specRef.specGlob": "docs/**/*.md",
}
```

> 현재 스캐폴드 서버는 워크스페이스의 `**/*.md`를 전부 인덱싱하며 이 값을 아직 소비하지 않는다. `client.ts`에서 `initializationOptions`로 넘겨 서버가 읽도록 배선하는 것이 다음 단계다.

에디터에서 얻는 것:

- `@spec ` 뒤 → SPEC 절 자동완성, `>` 뒤 → 항목 라벨 자동완성(카피/서술 구분)
- 깨진 참조·값 불일치 → 해당 줄 squiggle
- `@spec` 줄에서 정의로 이동 → SPEC.md의 그 노드로 점프
- SPEC.md가 바뀌면 참조하는 코드가 자동 재검증(dead-reference 표시). **고치지는 않는다.**

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
    ref-check.ts         CLI (CI 게이트, exit 1 on 문제)
  lsp/
    server.ts            LSP 서버 (진단 · 자동완성 · 정의 · hover)
    probe.ts             헤드리스 LSP 하네스 (VSCode 없이 검증)
extension/
  client.ts              VSCode 클라이언트 스캐폴드
  package.json           익스텐션 매니페스트 스캐폴드
  tsconfig.json          익스텐션 빌드 설정 (Node16, out/ 출력)
fixtures/
  SPEC.md · messages.ts  CLI·probe 가 쓰는 예시 워크스페이스
```
