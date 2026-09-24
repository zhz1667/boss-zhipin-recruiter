# BOSS recruiter workflow

## Runtime import

Resolve the absolute path of `scripts/boss-runtime.mjs` from this skill directory,
then import it inside `cua_repl`:

```js
var boss = await import('file:///absolute/path/to/scripts/boss-runtime.mjs');
var jevRuntime = await boss.inspectJevRuntime();
var tab = await boss.connect(cua);
var state = await boss.readPageState(tab);
nodeRepl.write({ state: state, jevRuntime: jevRuntime });
```

Do not use `cua.getState()` in API-key auth mode. If an existing BOSS tab is not
available, `connect` creates an in-app browser tab. The user must still be logged
in; the plugin does not copy cookies, passwords, or tokens.

The plugin bundles the MIT-licensed Jev `bridge.mjs` as a runtime fallback.
`inspectJevRuntime` only reports whether the external `envFile` exists. It never
reads the credential file and never writes the API key into plugin files.

For a suitable named mechanical action, create a Jev session:

```js
var outcome = await boss.runJevTask(tab, {
  goal: 'Keep the recommendation pool selected. Stop after the selection is confirmed.',
  controls: [{ op: 'click', name: '推荐' }],
  policy: {
    click: true,
    denyNames: [/打招呼/, /删除/, /举报/]
  }
});
```

Do not use Jev for duplicate control names such as the repeated `打招呼`
buttons. Use card-scoped deterministic CUA actions there.

## Job selection

The recommendation frame exposes a job selector at
`.job-selecter-wrap .ui-dropmenu-label`. Read the live options first, then use
the host's structured question tool (`AskUserQuestion` or
`request_user_input`) so the user can select an actual page option. Do not ask
the user to type the job title.

```js
var jobs = await boss.listJobs(tab);
// Present `jobs` through the structured question tool, then use the selected item:
var selectedJob = await boss.selectJobOption(tab, {
  optionIndex: selectedOption.optionIndex,
  label: selectedOption.label
});
```

`selectJobOption` verifies the exact page label before clicking. If the selected
index and label disagree, stop instead of guessing. `selectJob` remains only as
a compatibility fallback for an exact live-page match; it is not the preferred
interactive flow.

## Candidate collection

The active pool is selected through the tabs:

- `推荐`: `.tab-item[title="推荐"]`
- `精选`: `.tab-item[title="精选牛人"]`
- `最新`: `.tab-item[title="新牛人"]`

Use `推荐` by default and do not switch to `精选` or `最新` unless the user
explicitly requests that pool.

Cards in the `热搜牛人推荐` section are excluded by `CARD_SELECTOR`
(`.candidate-card-wrap:not(.anonymous-geek-guide-card)`). They cannot be
greeted normally, so they must never be collected, ranked, or included in a
greeting plan.

For large runs, use the two-stage flow: collect and rank all card summaries
first, then open full resume details only for the shortlist.

```js
var ranked = await boss.browseAndRankCandidates(tab, {
  mode: 'recommended',
  limit: 100,
  maxScrolls: 40,
  detailLimit: 25,
  detailPages: 2,
  criteria: {
    keywords: ['golang', 'gin', 'redis', 'postgresql'],
    minSalary: 8,
    maxSalary: 15
  },
  onProgress: function (event) { nodeRepl.write(event); }
});
```

Set `detailLimit` to the number of finalists that need full resume review.
Use `browseCandidates(..., { enrichDetails: true })` only when the user
explicitly requires full details for every collected candidate.

Collection deduplicates by name, salary, base information, and expectation.
Detailed review clicks the candidate card itself to open the resume dialog,
reads `.dialog-wrap.active`, then presses `PageDown` through the
`.resume-detail-wrap` scroll area and closes it with `Escape`. Use the card
index captured during extraction so duplicate names or stale cards do not cause
the wrong resume to open.

The runtime uses condition-based waits instead of long fixed delays. Text-only
detail screening does not capture screenshots, which removes the largest
unnecessary cost when reviewing a large batch. `onProgress` reports
`elapsedMs` and `etaMs` for the remaining detailed review.

Some BOSS resumes render as a Canvas inside
`.dialog-wrap.active iframe[src*="c-resume"]`. In that case DOM text only covers
the outer overview. The plugin captures viewport screenshots while paging so
Codex can perform visual interpretation:

```js
var pages = await boss.captureOpenResumePages(tab, {
  maxPages: 8,
  captureScreenshots: true,
  includeText: true,
  onPage: function (page) { nodeRepl.emitImage(page.screenshot); }
});
```

Use screenshots only for the minimum candidates needed by the current task. Do
not save resume screenshots unless the user asks for a local artifact.

## Filtering

`rankCandidates` is a deterministic first pass. It scores AI, product, delivery,
custom keyword, city, salary, and experience signals. Codex must still read the
resume details and make the final semantic recommendation.

```js
var ranked = boss.rankCandidates(candidates, {
  city: '宁波',
  minSalary: 16,
  maxSalary: 26,
  minExperience: 5,
  requireAI: true,
  keywords: ['智能体', 'RAG', 'AI产品'],
  excludeKeywords: ['外包销售']
});
```

## Greeting gate

First prepare the plan:

```js
var plan = await boss.prepareGreetingPlan(tab, ['候选人甲', '候选人乙']);
```

Show every `ready` name, the total count, and the fact that clicking sends a real
greeting. Wait for an unambiguous confirmation such as "确认向这 2 人打招呼".
Then call:

```js
var results = await boss.greetCandidates(tab, ['候选人甲', '候选人乙'], {
  confirmationToken: 'USER_CONFIRMED',
  maxCount: 5,
  rateLimitMs: 1500,
  onProgress: function (event) { nodeRepl.write(event); }
});
```

`greetCandidates` refuses to run without the literal confirmation token. This is
a mechanical guard, not a substitute for the user's actual confirmation.

## Result handling

- `greeted`: the card visibly changed to `继续沟通`.
- `clicked_needs_verification`: the click occurred but success is not yet proven.
- `needs_codex_verification`: an unexpected dialog opened and the batch stopped.
- `missing`, `ambiguous`, `disabled`, or `already_contacted_or_unavailable`:
  no greeting was sent for that item.
- `stopped_by_captcha`: stop immediately and ask the user to handle the page.

After a batch, take a fresh state and independently verify each requested person.
