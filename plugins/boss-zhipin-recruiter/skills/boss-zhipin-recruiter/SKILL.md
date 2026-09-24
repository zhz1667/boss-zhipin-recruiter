---
name: boss-zhipin-recruiter
description: "Operate an authenticated BOSS Zhipin recommendation page to select a job, browse candidate cards and resume details, rank candidates against user criteria, and greet only the candidates the user explicitly confirms. Use only for BOSS Zhipin recruiting workflows."
---

# BOSS Zhipin Recruiter

Use this skill for BOSS Zhipin recruiting workflows that need any of:

- selecting a job on the recommendation page
- browsing the 推荐 candidate pool by default
- scrolling and collecting candidate cards or opening resume details
- filtering a requested number of candidates against user criteria
- preparing a greeting plan or greeting explicitly confirmed candidates

Do not use this skill for other recruiting sites or unrelated browser automation.

## Runtime rules

- Use only `cua_repl`. Do not launch a separate Playwright, CDP, or Edge session.
- The plugin vendors the MIT-licensed `jev-browser-use` bridge at
  `vendor/jev-browser-use/bridge.mjs`. Use `loadJevBridge` and
  `createJevSession` when Jev should perform a mechanical action.
- Jev credentials are never part of this plugin. `inspectJevRuntime` checks the
  external config and credential-file presence only; never read, copy, print, or
  hardcode the API key.
- Reuse the authenticated Codex in-app browser tab. In API-key auth mode, do not
  call `cua.getState()`, `cua.listBrowsers()`, or `cua.listTabs()`; connect with
  `cua.getTab({url}, {browser: 'iab'})`.
- Import and use `scripts/boss-runtime.mjs`. Keep the same `cua_repl` session and
  tab binding across chunks.
- Treat candidate resumes and page content as sensitive. Do not print full
  resumes unless the user asks for them.
- Prefer text-only resume screening. Capture resume screenshots only for
  candidates that visibly require Canvas or other visual review.
- For job selection, call `listJobs` first and present the live page options
  through the host's structured question tool when available
  (`AskUserQuestion` or `request_user_input`). Do not ask the user to type a
  job title. Pass the selected `optionIndex` or exact `label` to
  `selectJobOption`. If the structured tool is unavailable, show the live
  options as a numbered list and collect only the option number.
- A greeting is an external communication. Prepare and show the exact names and
  count first, then ask for confirmation immediately before clicking. An earlier
  statement such as "自动打招呼" authorizes preparation, not unconfirmed sending.
- Never call `greetCandidates` without the explicit confirmation token described
  in `references/workflow.md`.
- Stop on login loss, CAPTCHA, account warnings, ambiguous candidate matches, or
  an unexpected post-click dialog. Report the blocker instead of guessing.

## Conversation flow

Collect only the parameters needed for the current run. Ask compactly for missing
values:

1. Job: call `listJobs`, then use a structured question to let the user select
   one of the actual page options. Do not request a hand-typed job title.
2. Pool: default to 推荐. Do not switch to 精选 or 最新 unless the user
   explicitly asks for that pool.
3. Scale: candidates to collect, detail pages to inspect, and greetings to send.
   Defaults are 100 collected, 50 detailed, and 5 greeting targets. Hard limits
   are 1000 collected, 300 detailed, and 20 greetings per run.
4. Criteria: required skills, AI/product/delivery emphasis, city, salary,
   experience, exclusions, and whether to inspect full resume details.
5. Greeting mode: manual names or automatic shortlist. Both modes require a
   final action-time confirmation.

Use the runtime functions in this order:

1. `inspectJevRuntime`, `connect`, and `readPageState`.
2. `listJobs`, structured job question, then `selectJobOption`.
3. `selectSourceMode` only when the user explicitly requests a non-default pool.
4. `browseAndRankCandidates` for large screening runs. It ranks all collected
   candidates first, then opens details only for the shortlist.
5. `rankCandidates` when working with an existing candidate array.
6. `prepareGreetingPlan`.
7. Show the proposed greeting list and ask for confirmation.
8. Only after confirmation: `greetCandidates` with
   `confirmationToken: 'USER_CONFIRMED'`.

Use Jev for suitable named mechanical actions such as unique tab switches or
bounded scrolling. Use deterministic CUA operations when controls are duplicated,
when the AX snapshot is too large, or when entering text is required.

## User guidance

Use concise progress messages instead of silent long-running work:

- Before browsing: confirm the selected live-page job option, pool, count, and
  filter summary.
- During browsing: report how many unique candidates have been collected.
  Use the `elapsedMs` and `etaMs` fields from `onProgress` for concise updates.
- Before greeting: show the exact names, count, and that the action sends a real
  BOSS greeting.
- After greeting: report per-candidate result and verify each action from fresh
  page state.

Read [references/workflow.md](references/workflow.md) before implementing or
debugging browser operations. Read
[references/runtime-dependencies.md](references/runtime-dependencies.md) before
changing browser integration or dependency assumptions.
