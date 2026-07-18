# 설계 여정과 결정 기록

> **⚠️ 은퇴한 아키텍처의 기록** — 이 문서가 서술하는 구현(`@spec` 앵커, `src/cli/ref-check.ts`, `src/lsp/server.ts`·`probe.ts`, `resolveRefs`, verdict 체계)은 **md→ts 투영으로 피봇하면서 삭제됐다.** 아래의 "현재 상태"는 피봇 이전 시점의 현재다. 살아 있는 아키텍처는 [`README.md`](./README.md)를, 삭제된 코드는 git 이력을 볼 것. 이 문서는 그 형태에 도달했던 추론과 기각된 대안의 기록으로 남긴다.

이 문서는 spec-ref가 지금의 형태가 된 **이유**를 담는다. 기각한 대안과 그 근거가 핵심이다.

---

## 출발점

기술적 실마리는 "HTTP GET에서 본문 없이 상태만 받을 수 있나"였다. 답은 HEAD 요청(정석) / `Range: 0-0`(부분) / GET 후 조기 종료(스트림 취소). 여기서 링크 체크로 번졌다:

- 브라우저 `fetch`는 CORS 때문에 임의 외부 URL의 상태를 못 읽는다(`no-cors` → opaque, `status === 0`). 그래서 **외부 링크 검증은 빌드 타임 Node**에서 한다.
- SSG의 dead **anchor** 검증은 아예 네트워크가 없다 — 빌드 산출물의 heading id 집합을 정적 대조한다.
- rspress `RouteService`는 route 테이블을 메모리에 소유(`Map`, O(1) 조회)해서 링크 검증을 "요청"이 아니라 "조회"로 만든다. 앵커 id는 컴파일 후에야 알 수 있어, "있으면 즉시 쓰고 없으면 도착 시 콜백"하는 consumer/observer 패턴으로 처리한다.

**되풀이되는 모티프:** _"필요한 데이터가 아직 없을 수 있다 — 있으면 즉시, 없으면 나중에."_ HTTP(헤더→본문), rspress 앵커(빌드 순서), 그리고 뒤의 LSP 증분 인덱스까지 층을 갈아타며 같은 형태로 재등장한다.

---

## 문제 정의

LLM 에이전트 개발 중 코드베이스에 `SPEC.md`를 둔다. 핵심 제약: **SPEC은 비개발자도 편집하는 범용 인간 영역**이다. 그렇다면 SPEC↔Code를 잇는 아답터가 필요하다.

---

## 결정 기록

각 항목: **결정 → 근거 → 기각한 대안.**

### 1. 방향은 코드 → SPEC

코드가 자기 근거로 SPEC 절을 참조한다.

- 근거: 참조를 코드가 소유하면 "이 값이 SPEC의 무엇에 근거하나"가 코드 곁에 남는다.
- 대안(SPEC → 코드, 절마다 구현체 포인터)은 역인덱스가 주가 되는 다른 설계 — 지금은 채택 안 함.

### 2. SPEC은 소스가 아니라 "참조 프레임"

값은 코드/i18n에 있고, SPEC은 정렬 기준점일 뿐이다.

- 근거: SPEC 편집은 "여기 불일치 있음" 신호여야지, 아무것도 흘려보내면 안 된다.
- **기각: codegen + import(`spec.generated.ts`)**. 매력적이었지만 위험하다 —
  - 의도 문서를 프로덕션 소스로 격상시켜, **비개발자 편집이 리뷰·테스트 없이 프로덕션 카피를 바꾼다.**
  - "드리프트 불가"의 이면은 "SPEC 실수가 즉시 배포". 검증할 대상 자체를 없앤다.
  - 의도(behavior)와 정확한 바이트(마이크로카피·구두점·로케일)는 다른 층위인데 이를 산문에 묶는다.
  - 산문을 데이터로 파싱하는 취약성, 심볼 정체성 vs 자유 산문 충돌, i18n 충돌, 생성 아티팩트 고질병.
  - rspress가 route 테이블을 소유해 안전했던 건 그게 *개발자가 통제하는 코드의 파생물*이라서다. 여기서 소유하려는 건 _비개발자의 산문_ — 소유가 안전이 아니라 정반대.

### 3. 검증은 결정적, LLM은 게이트에 없음

값 동등 + 노드 존재 = 순수 함수.

- 근거: 게이트는 **재현성·완전성·비용**이 필요하다. 같은 입력에 같은 판정, 200개면 200개 다 확인, ms에 종료. LLM은 셋 다 보장 못 한다.
- LLM이 유용한 곳은 그 _위층_(의미 변경 분류·제안)이며, LSP 그라운딩(go-to-def, find-refs)이 그 판단을 신뢰 가능하게 만든다. 단 **감지 뒤 2차**로만.
- 대화형 보조(LLM+LSP)와 차단형 게이트(결정적 함수)를 **같은 것으로 합치지 않는다.**

### 4. silent 패치 없음 — 수동 관리

도구는 사실만 진술하고 아무것도 고치지 않는다.

- 근거: 자동 수정(codegen이든 LLM PR이든)은 "비개발자 편집 → 리뷰 없이 반영"을 부활시킨다.
- 수동의 약점(누락)은 결정적 감지가 상쇄한다 — 미처리 divergence는 CI 실패/squiggle로 **가시적 부채**로 남지 조용히 썩지 않는다.
- 이 결정으로 "변경 해석/제안" 층이 파이프라인에서 통째로 빠지고, 시스템이 단순해진다.

### 5. 검증 가능성은 SPEC의 표현 형식에 달렸다

- 설명형 술어("저장하면 알린다")는 대조할 값이 없어 검증 불가 → LLM 추론(비결정)으로 회귀.
- 그래서 **명시 카피는 마킹**한다(백틱). "자연어를 딱 필요한 만큼만 제약"(BDD의 Given/When/Then, Kiro의 EARS)은 선택이 아니라 전제였다.

### 6. "SPEC 슈퍼셋"의 재해석

TS급 새 언어가 아니라 **표준 마크다운 + 참조 규약 + 린터**.

- TS의 성취는 문법이 아니라 점진적 도입이었다. 성공 조건: 모든 유효 마크다운은 유효 SPEC, 마킹은 순수 add-on.
- 마킹 어휘는 이미 표준에 있다(백틱=값, heading=위치). 새 파서가 아니라 mdast 위에 참조 의미를 얹는 얇은 층. → 부담은 "새 컴파일러"가 아니라 "마크다운용 ESLint 플러그인" 급.

### 7. 참조 키는 내용, 위치가 아니다

- 노드 타입 참조(구조 경로 `listItem[3]`)는 순서만 바뀌어도 **조용히 틀린다** — 최악의 실패. → 사용자 책임으로도 성립 안 함.
- 리스트는 내용으로 가리킨다. 그래야 문구가 바뀔 때 **명확히 DEAD**로 떠서 "사용자 책임" 계약이 작동한다.
- 일반적으로 참조 대상은 제목(거침·안정) 또는 리스트(정밀·취약=사용자 책임).

### 8. 파서는 mdast(remark), ast-grep 아님

- ast-grep는 tree-sitter 코드 언어용 — 마크다운을 파싱하지 않는다.
- remark(`mdast-util-from-markdown`)가 heading/list/listItem/inlineCode를 노드로, 위치까지 준다. 이로써 카피/서술을 텍스트 휴리스틱이 아니라 **노드 타입**으로 가른다.

### 9. LSP는 코어 위의 얇은 어댑터

- `{@link}`는 **심볼 그래프** 위에서만 go-to-def·find-refs·rename이 공짜. 우리 타겟은 마크다운 노드라 심볼이 아니다 → 그 힌트는 **우리가 구현해서** 얻는다.
- rename 자동 전파는 의도적으로 포기(= 사용자 책임). 자동 전파를 원하면 위험한 codegen+import로 돌아가야 하므로.
- 같은 `resolveRefs`가 CLI(게이트)와 LSP(에디터)를 함께 구동. "language server는 CLI로도 재사용된다"의 실현.

---

## 현재 상태

- **코어**(`src/core/spec-ref.ts`): mdast 파싱 + `@spec` 2단 해소 + 노드타입 판정. 결정적, 비파괴. (타입·헬퍼는 `spec-ref.types.ts`·`spec-ref.utils.ts`로 분리.)
- **CLI**(`src/cli/ref-check.ts`): CI 게이트. 문제 시 exit 1.
- **LSP**(`src/lsp/server.ts`): 진단·자동완성·정의·hover. SPEC.md watch + 크로스파일 재검증. VSCode 없이 `src/lsp/probe.ts`로 실제 JSON-RPC 검증 완료.

처음 "본문 없이 상태만" 질문에서 dead-link → rspress RouteService → SPEC↔Code 참조 → mdast 노드 참조 → 동작하는 LSP까지, 한 바퀴가 닫혔다.

## 열린 다음 후보 (필수 아님)

- completion의 JSDoc-context 정밀화(라인 휴리스틱 → AST 확인)
- 진단 range를 `@spec` 태그 줄로
- 동작 참조(테스트를 가리키는 참조)로 확장 — 카피 너머
- 다중 SPEC.md 규모에서의 인덱스 성능/증분화

---

# 부록: 타 산업 참조 — 현행 방향의 외부 검증

> ⚠️ 위 본문은 **피봇 이전**(`@spec` 앵커 + CLI/LSP) 기록이다. 이 부록은 반대로 **현행 방향**(SPEC.md → `spec.gen.ts` 결정적 생성 + `check:gen` 충실성 그물)이 소프트웨어 밖 성숙 산업들의 관행과 어떻게 맞물리는지를 다룬다. 근거는 심층 리서치(26소스 → 58클레임 → 20 confirmed / 2 refuted, 각 클레임 3표 적대적 검증)와 사후 재검증이다. 검증되지 않은 것은 그렇게 표시한다.

## 프레임: 성숙 산업이 수렴하는 삼각형

명세↔구현 정합성을 강제하는 성숙 산업들은 독립적으로 같은 삼각형에 도달한다: **(1) 제약된 표기**(자유 산문도 완전 형식언어도 아닌 중간), **(2) _먼저_ 표준화된 공유 어휘**, **(3) 결정론적 검증**. 그리고 전통적으로 **권위는 물리적 실패에서** 나온다(공차 밖이면 폐기). 이미 조사된 물리 도메인: 항공(EARS, ISO 29148), 건축(IDS/BIM, 공유어휘=IFC), 기계(GD&T, 공유어휘=datum, 권위=물리측정).

핵심 질문은 **비물리·카피 도메인이 물리적 ground truth 없이 이 삼각형을 완성할 수 있는가**였다.

## 대조표 (비물리 도메인)

| 도메인                   | (1) 표기                  | (2) 공유어휘 먼저?                  | (3) 결정론적 검증                     | 권위의 출처                      | 생성/제약 |
| ------------------------ | ------------------------- | ----------------------------------- | ------------------------------------- | -------------------------------- | --------- |
| 금융 **XBRL**            | XBRL/XML instance         | **O — taxonomy**                    | **O — Formula(XPath assertion)**      | 규제 mandate + conformance suite | 제약      |
| i18n **MessageFormat 2** | 메시지 문법               | 약함(데이터모델 O, 용어어휘 _반증_) | **O 단 형태만**(구조·placeholder)     | Unicode 표준 + JSON suite        | 제약      |
| 접근성 **WCAG**          | success criteria          | 부분(ARIA)                          | **X — 하이브리드, AA 50중 16만 자동** | 법·규제                          | 제약      |
| 법률 **Catala**          | Catala DSL(default logic) | 법령 = 어휘                         | **O — F\* 증명, 정부 구현 버그 적발** | 법적 강제력·법령                 | **생성**  |
| 계약 **CiceroMark**      | 산문 + 타입변수 임베드    | 템플릿 모델                         | O — 엄격 문법                         | 법적 강제력                      | 생성적    |
| 게임 **Yarn Spinner**    | `.yarn` 소스              | 라인 `id`(로컬 앵커)                | **O — `lock` 해시 드리프트 검출**     | 없음(제품), ground truth=소스    | 제약      |

출처: XBRL [validation](https://specifications.xbrl.org/validation.html)·[implementingrules](https://www.xbrl.org/guidance/implementingrules/), MF2 [TR35](https://www.unicode.org/reports/tr35/tr35-73/tr35-messageFormat.html)·[wg](https://github.com/unicode-org/message-format-wg), WCAG [conformance](https://www.w3.org/WAI/WCAG22/Understanding/conformance)·[Deque](https://www.deque.com/automated-accessibility-coverage-report/), Catala [POPL21](https://dl.acm.org/doi/10.1145/3473582)·[SSRN](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4291177), [CiceroMark](https://docs.accordproject.org/docs/markup-cicero.html), [Yarn Spinner](https://github.com/YarnSpinnerTool/YSDocs/blob/main/docs/yarn-spinner-for-unity/assets-and-localization/inbuilt-localisation.md).
_조사했으나 confirmed 증거를 못 얻은 것: 의료(HL7 FHIR·SNOMED), 금융 메시징(ISO 20022), i18n(XLIFF QA) — 소스가 unreliable로 걸러짐._

## 세 가지 결론

**1. 비물리에서도 삼각형은 선다 — 권위의 대체물은 conformance suite.**
XBRL이 깨끗한 증거다: 검증 규칙이 taxonomy 안에 살고("business validation rules ... to all the users of the taxonomy"), Formula assertion이 결정론적으로 판정하며("valid if all related assertions evaluate to true"), conformance suite("some comply, some don't")가 물리적 실패를 대신하는 기준이 된다. MF2도 독립적으로 JSON conformance suite를 갖춘다. **물리적 ground truth의 자리를 `규제/표준 + conformance 테스트 묶음`이 채운다 — 이게 spec-ref의 `fixtures/` + 테스트가 미니어처로 하는 일이다.**

**2. 형태는 검증, 의미는 사람 — 성숙 표준도 예외 없다.**
MF2는 메시지 _구조_(placeholder·plural)만 결정론 검증하고 카피가 *맞는 문장*인지는 안 본다(그리고 "MF2가 IFC 같은 합의 용어 어휘를 준다"는 클레임은 3-0으로 반증됨). WCAG은 스스로 "combination of automated testing and human evaluation"이라 명시하고 자동 커버리지가 소수(AA 16/50). **spec-ref의 `check:gen`(verbatim 존재 검사)은 정확히 이 형태-다리에 앉는다** — "맞는 문구냐"(의미)는 XBRL·MF2·WCAG가 그렇듯 사람/권위의 몫으로 남긴다. spec-ref는 이 표준들과 같은 가족·같은 경계에 있다.

**3. 생성 vs 제약 둘 다 실재하며, copy/behavior에 매핑된다.**
법률(Catala)은 **생성적**이다 — "correct-by-construction executable specification", 명세가 곧 구현(Gonzalez "충분히 정밀한 명세는 코드다"의 실물). 나머지는 전부 **제약적**(독립 산출물을 검사). spec-ref는 둘 다 걸친다: `gen`(생성) + `check:gen`(제약). 그리고 이 선이 **copy/behavior 선과 겹친다** — 카피는 md→ts가 전사(total) 함수라 *생성*이 성립(명세가 곧 상수), 행동은 전사 불가라 *제약/테스트*만 가능.

## 가장 가까운 사촌: Yarn Spinner = 우리 `--check` (재검증 완료)

게임 대사 툴 Yarn Spinner가 출하 제품에서 spec-ref의 신선도 게이트를 이미 구현하고 있다 — **authored player-facing 카피**에 대해:

| spec-ref                                   | Yarn Spinner                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `gen --check` = 재생성 후 diff → 낡음 감지 | `lock` 컬럼 = "unique value ... to detect if the line has been modified since the strings file was generated" |
| exit 1 "낡음"                              | 바뀐 라인에 `NEEDS UPDATE` 도장                                                                               |
| 라벨 = 키 (SPEC 카피 ↔ 코드 참조 앵커)     | 라인 `id` (소스 ↔ 번역 앵커)                                                                                  |

권위는 외부에 없고(제품 툴) ground truth는 소스 `.yarn`뿐 — spec-ref가 SPEC.md를 그렇게 쓰는 것과 동일. **즉 authored 카피는 산업 표준 어휘도 물리적 ground truth도 없이, 프로젝트 스케일에서 `제약 표기 + 결정론적 드리프트 검출`만으로 충분하다는 실증.**

## 이식 결론 (스케일을 붙여 정정)

- **산업 스케일: 이식 안 됨.** UI 카피엔 IFC/datum/taxonomy 같은 *범산업 표준 어휘*가 없고, i18n(MF2)조차 그 다리를 못 세웠다(반증).
- **프로젝트 스케일: 이식 됨.** XBRL·MF2·Yarn이 보여준 건 _범산업_ 어휘가 아니라 **권위 있는 로컬 어휘 + conformance 기제**면 삼각형이 선다는 것. spec-ref에서 **SPEC.md = 로컬 IFC(권위 있는 어휘), `check:gen`/`gen --check` = 로컬 conformance suite**.

## 훔쳐올 것: per-entry 신선도 (규모 커질 때)

Yarn은 **per-line 저장 해시**라 _어느 라인이_ 낡았는지 콕 집는다(`NEEDS UPDATE`가 그 라인에만). spec-ref의 `--check`는 **whole-file 재생성 diff**라 "파일이 낡음"까지만 안다. 카피 코퍼스가 커지면 **각 카피에 소스 해시를 달아 바뀐 카피만 표시**하는 per-entry 신선도가 실질 개선 — Yarn이 그 값어치를 실증한다. 지금 규모엔 과잉이지만 1순위 후보.
