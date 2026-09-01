# spec-ref

SPEC 문서가 못 박은 사용자 노출 카피를, 코드가 **참조 가능한 형태로 소비**하게 만드는 도구. SPEC.md를 `.ts`로 투영하고(`spec.gen.ts`), 코드는 문자열을 재복사하지 않고 그 **SPEC 상수를 가져다 쓴다**. **SPEC 상수를 소비하는 코드에선** 값 drift가 구조적으로 불가능해지고, 참조 무결성은 `tsc`가, 생성물 충실성은 `check:gen`이 지킨다.

> 보증의 범위 — 값 drift 불가능이라는 보증 자체는 소비를 **선택한** 코드에만 미친다. 다만 "선택했는가"는 더 이상 코드리뷰만의 몫이 아니다 — `spec-ref-scan` 이 소비자 코드를 훑어 **하드코딩 재복사(no-ref)** 를 결정적으로 잡는다. 남는 갭은 SPEC 에 아예 없는 카피와, 동적 접근처럼 정적으로 판정 불가한 소비뿐이다.

핵심 원칙 한 줄: **SPEC은 소스가 아니라 참조 프레임이다. 도구는 감지·보고만 하고 아무것도 고치지 않는다.** (초기 설계 배경은 [`DESIGN.md`](./DESIGN.md) — `@spec` 앵커 + CLI/LSP 검증 시절의 기록이며, 아래 md→ts 방향으로 피봇하기 전 이력이다.)

---

## 설치

**사전 요구사항:** Node.js `18` 이상(개발·CI는 `22`에서 검증).

### 설치형 CLI — 다른 프로젝트에서

패키지로 설치하면 세 개의 bin 이 생긴다. 런타임 의존성은 `mdast-util-from-markdown` 과 `typescript`(생성물 파싱용)뿐 — `tsx` 없이 순수 node 로 실행된다.

```bash
pnpm add -D spec-ref                                # 또는 npm i -D / yarn add -D
npx spec-ref-gen <spec.md> --out src/spec.gen.ts    # SPEC.md → 참조 가능한 .ts
npx spec-ref-check <spec.md> src/spec.gen.ts        # 충실성 검사
npx spec-ref-scan <spec.md> src/spec.gen.ts src     # 소비 검사 (재복사·미소비)
```

| 명령                                                 | 하는 일                                 |
| ---------------------------------------------------- | --------------------------------------- |
| `spec-ref-gen <spec.md>`                             | 생성 결과를 stdout 으로                 |
| `spec-ref-gen <spec.md> --out <spec.gen.ts>`         | 파일로 생성                             |
| `spec-ref-gen <spec.md> --check <spec.gen.ts>`       | 신선도 게이트 — 낡았으면 exit 1 (CI용)  |
| `spec-ref-check <spec.md> <spec.gen.ts>`             | 충실성 그물 (수동/LLM 생성물 검증)      |
| `spec-ref-scan <spec.md> <spec.gen.ts> [src…]`       | 소비자 그물 — 하드코딩 재복사·미소비 키 |
| `spec-ref-check --json …` · `spec-ref-scan --json …` | 위 결과를 기계 판독 JSON 으로           |

CI 는 `spec-ref-gen <spec.md> --check <gen.ts>` + `spec-ref-scan <spec.md> <gen.ts> src` + `tsc` 세 줄이면 된다. 코어(`parseSpec`)는 라이브러리로도 쓸 수 있다: `import { parseSpec } from 'spec-ref'`.

### 에이전트용 스킬

패키지에 `.claude/skills/spec-ref/SKILL.md` 가 함께 실린다. 코딩 에이전트가 SPEC 카피를 다룰 때의 판단 층(규약 안내, 자유형 md 처리, 검사 실패별 대응)이며, **검증은 여전히 위 CLI 가 결정적으로 한다** — 스킬은 게이트가 아니라 게이트 사용법이다. 설치 후 프로젝트에 복사한다:

```bash
mkdir -p .claude/skills && cp -r node_modules/spec-ref/.claude/skills/spec-ref .claude/skills/
```

### 로컬 설치 — 배포 없이 내 머신에서 테스트

npm 배포 전에 전역 명령으로 바로 써보려면 이 저장소를 클론한 뒤 링크한다:

```bash
pnpm link:local     # = pnpm build && npm link → 전역 spec-ref-gen / spec-ref-check / spec-ref-scan
spec-ref-gen ~/work/any-project/SPEC.md --out ~/work/any-project/spec.gen.ts   # 어디서든
```

전역 명령은 저장소의 `dist/` 를 심볼릭으로 가리킨다 — 소스를 고치면 `pnpm build`(또는 반복 중이라면 `pnpm build:watch` 를 한 터미널에 띄워둠)로 다시 컴파일하면 전역 명령에 그대로 반영된다. 해제는 `npm unlink -g spec-ref`.

> pnpm 네이티브로 링크하려면 최초 1회 `pnpm setup` 후 `pnpm build && pnpm link --global`. 전역 bin 디렉토리가 없으면(`ERR_PNPM_NO_GLOBAL_BIN_DIR`) `pnpm setup` 이 그걸 만든다. `npm link` 는 그 설정 없이도 동작한다.

### 저장소 개발

```bash
git clone https://github.com/cbcruk/spec-ref.git && cd spec-ref
pnpm i && pnpm test   # 50개 통과하면 정상
pnpm build            # tsc → dist/ (bin·라이브러리). 배포 시 prepublishOnly 가 자동 실행
```

dev 스크립트(`pnpm gen`·`pnpm check:gen`·`pnpm scan`)는 `tsx`로 소스를 직접 돌려 빌드 없이 반복한다. `dist/` 는 gitignore 대상(배포 산출물).

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

헤딩·이름은 식별자로 억지 변환하지 않고 **따옴표 키 + bracket 접근**(`SPEC['저장 / 미저장 시 이탈'].타이틀`)을 쓴다. 원문 그대로 두면서 TS가 존재를 검사하므로 슬러그 변환 문제가 없다.

---

## 이름 규약 — md→ts 를 결정적으로 만드는 열쇠

카피 추출(`parseSpec`)은 원래 결정적이었다. 변환에서 유일하게 비결정적이었던 건 **키 네이밍**이고, SPEC.md에 작은 규약 하나를 더하면 그것도 결정된다:

```md
- 저장완료: `진료실별 자동 접수 설정을 저장했어요.`
- 타이틀: `자동 접수 설정을 중단하시겠어요?`
```

**라벨(콜론 앞)이 곧 생성물의 키다.** 이러면 md→ts 전체가 결정적이 되어 LLM이 루프에서 빠진다. (명령은 [설치](#설치)의 표 참고. `pnpm gen:fixtures` · `pnpm gen:check:fixtures` 로 `fixtures/` 예시를 바로 돌려볼 수 있다.)

- 이름 없는 카피(`` - `값` ``)는 절의 `copies: []` 배열로 실리고 경고가 뜬다 — 라벨을 붙이면 이름으로 참조된다.
- 한 라벨에 백틱이 여럿이면 배열로: `` - 목록: `가` 또는 `나` `` → `목록: ['가', '나']`.
- 중복 라벨·중복 절 이름·옛 규약 라벨(백틱 없는 `타이틀:`)은 생성 **에러**(exit 1) — 조용히 이상한 생성물을 만들지 않는다.
- 워크플로: **SPEC.md 편집 → `pnpm gen --out` → 함께 커밋.** CI 는 `pnpm gen --check` + `tsc` 만 돌리면 된다.

## 충실성 그물 (`check:gen`) — 생성기를 안 거친 생성물 검증

생성기 출력은 구성상 충실하지만, **LLM이나 손으로 만든** `spec.gen.ts`(자유형 md라 이름 규약을 못 쓰는 경우)는 별도 그물로 검증한다:

```bash
pnpm check:gen <spec.md> <spec.gen.ts>        # 카피 슬롯 대조, 문제면 exit 1
pnpm check:gen --json …                       # 기계 판독 (에이전트/CI)
pnpm check:gen:fixtures
```

`check:gen`은 SPEC의 카피 **슬롯**(코어 `parseSpec` — **리스트 항목의 백틱 인라인 코드 값**, 절마다 나온 횟수 보존)과 생성물의 **값 위치** 문자열(TS AST — 프로퍼티 초기값·배열 원소·변수 초기값만; 키·computed key·element access·import 지정자는 제외)을 **출현 횟수까지 대조**한다:

- `missing` — SPEC 슬롯 수보다 생성물 출현이 적음 → LLM 누락. **같은 카피가 두 절에 있으면 생성물에도 두 번 실려야 한다** — 한 절이 통째로 빠지는 걸 잡기 위해서다. (정당한 카피의 초과 출현은 허용.)
- `hallucinated` — 생성물에만 있음(SPEC 어디에도 없음) → LLM 환각·오타 (마침표 하나 뗀 변형까지 잡힌다)
- `legacyLabels` — **옛 규약**(`- 타이틀: 값` — 백틱 없음)으로 남은 항목. 백틱 규약에선 보호 밖이므로 조용히 통과시키지 않고 실패로 보고한다 — 값을 백틱으로 감싸 마이그레이션할 것.

`--json`은 `{ missing, hallucinated, legacyLabels, copies, ok }` 를 그대로 내보내, 코딩 에이전트가 편집 루프에 물릴 수 있다: **md 편집 → 재생성 → `check:gen --json` → `missing`/`hallucinated` 감지 → 수정.** 컴파일러 지식이 필요 없는 결정적 검사라, 이름 규약을 못 쓰는 자유형 md에서도 "md2ts는 LLM, 충실성은 이 그물"이라는 분업이 성립한다.

> **카피 규약** — 참조 대상 문구는 SPEC.md에서 **백틱으로 감싼다**(`` - 타이틀: `자동 접수 설정을 중단하시겠어요?` ``). 백틱만이 "이건 verbatim 카피" 신호다. 백틱 없는 산문 항목(예: "…이탈 전 확인 모달을 띄운다")은 카피가 아니라 그냥 검증 대상이 아니다. 단, 옛 카피 규약 형태(`타이틀:`/`내용:` 라벨인데 백틱 없음)만은 마이그레이션 누락으로 보고 `legacyLabels` 로 잡는다.
>
> **그물이 못 잡는 것** — 카피의 **존재·verbatim·출현 횟수**는 잡지만, 그 카피가 **올바른 이름/절 아래** 있는지(배치)는 검사하지 않는다. 키 네이밍·배치는 사람 리뷰(diff가 작다)에 맡긴다.

---

## 소비자 그물 (`scan`) — 코드가 실제로 상수를 쓰는가

`check:gen` 이 SPEC↔생성물만 보는 데 반해, `scan` 은 그 바깥 — **소비자 코드**를 본다.

```bash
pnpm scan <spec.md> <spec.gen.ts> [src…]      # 기본 경로는 src
pnpm scan --json … | --strict | --include-tests
pnpm scan:fixtures
```

- **`noRef` (재복사)** — SPEC 카피와 **글자 그대로 같은** 문자열이 소비자 코드에 박혀 있다. 문자열 리터럴·템플릿·JSX 텍스트 어디든 잡고 `파일:줄` 을 준다. 생성물을 안 거친 카피이므로 그물 밖 — 그 리터럴을 SPEC 상수 참조로 바꾸면 된다. **이게 게이트다(exit 1).**
- **`orphan` (미소비)** — 생성물의 leaf 키인데 아무 코드도 참조하지 않는다. 미구현이거나 지울 카피라는 신호. **기본은 경고고 exit 0** — 판단이 필요한 사실이지 위반이 아니기 때문. `--strict` 로 게이트에 넣을 수 있다.

orphan 판정은 생성물을 `import` 한 파일에서 `SPEC['절'].라벨` 접근 경로를 AST로 추적한다. `const s = SPEC['절']` 같은 **별칭 변수도 따라간다.** 판정할 수 없는 지점 — 동적 인덱스(`SPEC[k]`), 객체를 통째로 넘기기 — 은 전부 **"소비됨"으로 보수적으로** 센다: orphan 을 잘못 지목하느니 놓치는 쪽이다. 따라서 `orphan` 은 과소 보고일 수 있고, 비어 있다고 전부 소비됐다는 뜻은 아니다.

기본적으로 `*.test.*`·`*.spec.*`·`.d.ts`·`node_modules`·`dist` 는 건너뛴다(테스트의 카피 리터럴은 보통 정당하다). `--include-tests` 로 포함시킬 수 있다.

> 여기까지 오면 초기 아키텍처의 `no-ref`·`orphan` 이 다시 덮인다 — 이번엔 `@spec` 앵커가 아니라 **생성물 상수 그래프** 위에서. `genImporters: 0` 이면 스캔 경로가 틀린 것이니 orphan 목록보다 경로를 먼저 의심할 것.

---

## 아키텍처

```
src/core/spec-ref.ts        코어 (순수) — parseSpec(md): SPEC → 절·entries(라벨+값)·카피 슬롯
  · spec-ref.types.ts       도메인 타입 (SpecSection · SpecEntry)
  · spec-ref.utils.ts       순수 헬퍼 (norm · mdast 순회)
      │  (라이브러리·실행 분리)
      ├── src/cli/gen.ts         생성기 로직 — generate() · runGen()
      ├── src/cli/gen-check.ts   그물 로직 — checkGenContent() · runCheckGen()
      ├── src/cli/scan.ts        소비자 그물 — scanContent() · runScan() (TS AST)
      └── src/bin/*.ts           #!/usr/bin/env node 진입점 (bin 으로 매핑)

.claude/skills/spec-ref/SKILL.md   판단 층 (에이전트용) — 위 CLI 를 부르는 절차서
```

라이브러리(순수 export)와 bin(항상 실행되는 얇은 진입점)을 나눠, 설치 후 symlink 로 실행돼도 안전하다(진입 가드 불필요). `tsc -p tsconfig.build.json` 이 `dist/` 로 컴파일 — 런타임에 `tsx` 불필요. **이름 규약을 지킨 md 는 `gen`으로 결정적 생성**(LLM 불필요), 자유형 md 는 LLM/수동 생성 후 `check:gen` 그물로 검증한다.

**층의 분업이 이 도구의 전부다.** 판단(자유형 md 해석·키 네이밍·배치·재복사 정리)은 LLM/사람이 하고, 검증(카피 verbatim·슬롯 수·재복사 탐지·미소비 탐지)은 결정적 함수가 한다. 스킬은 판단 층을 문서화한 것이지 게이트가 아니다 — 게이트는 언제나 exit code 다.

---

## 파일 맵

```
src/
  core/
    spec-ref.ts          코어 — parseSpec (SPEC.md → 절·entries·카피 슬롯)
    spec-ref.test.ts     parseSpec 유닛 테스트
    spec-ref.types.ts    도메인 타입 (SpecSection · SpecEntry)
    spec-ref.utils.ts    순수 헬퍼 (norm · mdast 순회)
  cli/
    gen.ts               생성기 로직 — generate() · runGen()
    gen.test.ts          generate 유닛 테스트 + fixtures 신선도 dogfood
    gen-check.ts         그물 로직 — checkGenContent() · runCheckGen()
    gen-check.test.ts    checkGenContent · extractStringValues 유닛 테스트
    scan.ts              소비자 그물 — scanContent() · extractGenKeys() · runScan()
    scan.test.ts         no-ref · orphan · 별칭/동적 접근 유닛 테스트
  bin/
    spec-ref-gen.ts      #!/usr/bin/env node → runGen (bin: spec-ref-gen)
    spec-ref-check.ts    #!/usr/bin/env node → runCheckGen (bin: spec-ref-check)
    spec-ref-scan.ts     #!/usr/bin/env node → runScan (bin: spec-ref-scan)
tsconfig.build.json      dist/ 컴파일 설정 (NodeNext, .ts→.js import rewrite)
fixtures/
  SPEC.md                예시 SPEC (이름 규약: `- 이름: \`값\``)
  spec.gen.ts            gen 이 생성한 투영 (직접 수정 금지 — gen:fixtures 로 재생성)
  consumer.ts            소비 규약 예시 (scan 이 no-ref·orphan 을 판정하는 대상)
.claude/skills/
  spec-ref/SKILL.md      에이전트 판단 층 (패키지에 함께 배포)
```

---

## 이력

초기엔 코드가 `@spec` 주석으로 SPEC 절을 가리키고, CLI(verdict)·LSP(에디터 진단)·VSCode 헤딩 링크 익스텐션이 그 참조를 검증·네비게이션했다. **md→ts 투영으로 피봇하면서** 그 표면들은 은퇴했다 — 값 drift·dead 참조는 `tsc`가, 네비게이션은 네이티브 언어서비스가 대체하기 때문. 남은 건 생성물 충실성 하나뿐이고, 그게 `check:gen`이다. (은퇴한 코드는 git 이력 참고.)

피봇 직후 한동안 대체 없이 비어 있던 검출 두 가지 — 옛 `no-ref`(코드가 SPEC 카피를 하드코딩으로 재복사)와 `orphan`(어떤 코드도 소비하지 않는 카피) — 는 `spec-ref-scan` 으로 되돌아왔다. 이번엔 `@spec` 앵커가 아니라 생성물 상수를 뿌리로 삼는 TS AST 추적이라, 결정적이면서 규약 부담도 없다. 남은 갭은 두 개다: SPEC 에 존재하지 않는 카피(도구가 알 도리가 없다)와, 정적으로 판정 불가한 동적 소비(보수적으로 "소비됨"으로 센다).
