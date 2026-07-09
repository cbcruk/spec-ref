<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## 이 저장소의 테스트 실행 (위 체크리스트의 예외)

**테스트는 `vp test`가 아니라 `pnpm test`로 돌린다.** 테스트가 `node:test` 기반(`tsx --test`)이라 Vitest가 수집하지 못하고, 현 의존성 조합(vite-plus 0.2.2 + vite-plus-test 0.1.24)은 Vitest 실행 자체가 깨져 있다(패키지에 vitest bin 누락, programmatic API도 rolldown 바인딩 불일치로 실패). `vp test`가 "테스트 없음"이나 에러를 내도 그것이 테스트 결과가 아니다 — `pnpm test`(22케이스)가 실제 스위트다. vite-plus가 고쳐지면 그때 Vitest 스타일 전환을 검토할 것.
