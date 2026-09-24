export const BOSS_ORIGIN = 'https://www.zhipin.com';
export const RECOMMEND_URL = `${BOSS_ORIGIN}/web/chat/recommend`;
export const FRAME_SELECTOR = 'iframe[src*="/web/frame/recommend/"]';
export const CARD_SELECTOR = '.candidate-card-wrap';
export const JOB_SELECTOR = '.job-selecter-wrap';

export const SOURCE_MODES = Object.freeze({
  recommended: { label: '推荐', selector: '.tab-item[title="推荐"]' },
  featured: { label: '精选', selector: '.tab-item[title="精选牛人"]' },
  latest: { label: '最新', selector: '.tab-item[title="新牛人"]' }
});

export const DEFAULT_LIMITS = Object.freeze({
  collect: 100,
  detail: 50,
  greet: 5,
  maxCollect: 1000,
  maxDetail: 300,
  maxGreet: 20
});

const AI_KEYWORDS = [
  ' ai ', 'ai产品', 'ai项目', '大模型', 'llm', 'rag', 'agent', '智能体',
  '算法', '机器学习', '深度学习', '多模态', 'gpu', '智算', 'aigc', 'prompt'
];
const PRODUCT_KEYWORDS = ['产品规划', '产品设计', '产品经理', 'prd', '需求分析', '用户体验', '原型'];
const DELIVERY_KEYWORDS = ['项目交付', '项目管理', '全流程', '交付管理', 'pmp', 'pmo', '风险管控', '进度管理'];

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function parseMoney(value) {
  const text = cleanText(value).toLowerCase();
  if (!text || text.includes('面议')) return null;
  const numbers = [...text.matchAll(/(\d+(?:\.\d+)?)\s*k?/g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  if (!numbers.length) return null;
  return { min: Math.min(...numbers), max: Math.max(...numbers), raw: value };
}

function parseYears(value) {
  const text = cleanText(value);
  const more = text.match(/(\d+)\s*年以上/);
  if (more) return Number(more[1]) + 1;
  const exact = text.match(/(\d+)\s*年/);
  return exact ? Number(exact[1]) : null;
}

function parseAge(value) {
  const match = cleanText(value).match(/(\d+)\s*岁/);
  return match ? Number(match[1]) : null;
}

function keywordHits(text, keywords) {
  const haystack = ` ${cleanText(text).toLowerCase()} `;
  return unique(keywords.filter((keyword) => haystack.includes(keyword.toLowerCase())));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function candidateKey(candidate) {
  return [candidate.name, candidate.salary, candidate.base, candidate.expectation]
    .map(cleanText)
    .join('|')
    .toLowerCase();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function resolveJevBridge({ preferBundled = true } = {}) {
  const [fs, os, pathModule, urlModule] = await Promise.all([
    import('node:fs/promises'),
    import('node:os'),
    import('node:path'),
    import('node:url')
  ]);
  const scriptDir = pathModule.dirname(urlModule.fileURLToPath(import.meta.url));
  const bundled = pathModule.resolve(
    scriptDir,
    '..',
    '..',
    '..',
    'vendor',
    'jev-browser-use',
    'bridge.mjs'
  );
  const home = os.homedir();
  const installedCandidates = [
    pathModule.join(home, '.codex', 'plugins', 'cache', 'jev-browser-use', '0.1.0', 'skills', 'jev-browser-use', 'bridge.mjs'),
    pathModule.join(home, '.codex', 'plugins', 'cache', 'jev-browser-use', 'jev-browser-use', '0.1.0', 'skills', 'jev-browser-use', 'bridge.mjs')
  ];
  const candidates = preferBundled
    ? [{ path: bundled, source: 'bundled' }, ...installedCandidates.map((path) => ({ path, source: 'installed' }))]
    : [...installedCandidates.map((path) => ({ path, source: 'installed' })), { path: bundled, source: 'bundled' }];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate.path);
      return candidate;
    } catch {
      // Try the next bridge location.
    }
  }
  throw new Error('Jev bridge is unavailable. Reinstall boss-zhipin-recruiter or jev-browser-use.');
}

export async function loadJevBridge(options = {}) {
  const resolved = await resolveJevBridge(options);
  const urlModule = await import('node:url');
  const module = await import(urlModule.pathToFileURL(resolved.path).href);
  return { module, ...resolved };
}

export async function inspectJevRuntime(options = {}) {
  const fs = await import('node:fs/promises');
  const { module, path, source } = await loadJevBridge(options);
  const config = await module.loadConfig();
  let credentialsPresent = false;
  if (config.envFile) {
    try {
      await fs.access(config.envFile);
      credentialsPresent = true;
    } catch {
      credentialsPresent = false;
    }
  }
  return {
    bridgePath: path,
    bridgeSource: source,
    provider: config.provider,
    model: config.model,
    envFileConfigured: Boolean(config.envFile),
    credentialsPresent,
    apiKeyInPlugin: false
  };
}

export async function createJevSession(tab, defaults = {}) {
  const { module } = await loadJevBridge();
  const config = await module.loadConfig();
  return module.createSession(tab, {
    ...config,
    allowedOrigins: [BOSS_ORIGIN],
    maxSteps: 8,
    maxMs: 30000,
    minConfidence: 0.55,
    ...defaults
  });
}

export async function runJevTask(tab, task, options = {}) {
  const session = await createJevSession(tab, options);
  return await session.run(task);
}

export async function connect(cua, { url = RECOMMEND_URL, createIfMissing = true, visible = false } = {}) {
  assert(cua, 'A cua runtime is required.');
  try {
    return await cua.getTab({ url }, { browser: 'iab' });
  } catch (error) {
    if (!createIfMissing) throw error;
    return await cua.createBrowserTab('iab', url, { visible });
  }
}

export function bossFrame(tab) {
  assert(tab?.playwright?.frameLocator, 'A Codex browser tab is required.');
  return tab.playwright.frameLocator(FRAME_SELECTOR);
}

export async function assertBossOrigin(tab) {
  const url = await tab.url();
  const origin = new URL(url).origin;
  assert(origin === BOSS_ORIGIN, `Unexpected origin: ${origin}`);
  return url;
}

export async function readPageState(tab) {
  await assertBossOrigin(tab);
  const frame = bossFrame(tab);
  const state = await frame.locator('body').evaluate((body) => {
    const jobLabel = body.querySelector('.job-selecter-wrap .ui-dropmenu-label');
    const currentMode = body.querySelector('.tab-item.curr');
    const text = body.innerText || '';
    return {
      jobLabel: jobLabel?.innerText?.trim() || '',
      candidateMode: currentMode?.innerText?.trim() || '',
      candidateCount: body.querySelectorAll('.candidate-card-wrap').length,
      loginRequired: /扫码登录|登录后|请先登录/.test(text),
      captchaRequired: /安全验证|验证码|请完成验证|操作过于频繁/.test(text)
    };
  });
  return { url: await tab.url(), ...state };
}

export async function selectJob(tab, { title, city, salary } = {}) {
  assert(title || city || salary, 'At least one job selector is required.');
  const frame = bossFrame(tab);
  const label = frame.locator(`${JOB_SELECTOR} .ui-dropmenu-label`).first();
  await label.click();

  const search = frame.locator(`${JOB_SELECTOR} .chat-job-search`).first();
  if (await search.count()) {
    await search.fill(title || '');
    await tab.playwright.waitForTimeout(400);
  }

  const parts = [title, city, salary].filter(Boolean).map(escapeRegExp);
  const matcher = new RegExp(parts.join('.*'), 'i');
  const matches = frame.locator(`${JOB_SELECTOR} .job-list .job-item`).filter({ hasText: matcher });
  const count = await matches.count();
  assert(count > 0, `No job matched: ${[title, city, salary].filter(Boolean).join(' / ')}`);
  assert(count === 1, `Ambiguous job match (${count} results). Add city or salary.`);

  await matches.first().click();
  await tab.playwright.waitForTimeout(800);
  const selected = cleanText(await label.innerText());
  assert(selected.includes(title || city || salary), `Job selection did not update: ${selected}`);
  return selected;
}

export async function selectSourceMode(tab, mode = 'latest') {
  const normalized = String(mode).toLowerCase();
  const target = SOURCE_MODES[normalized];
  assert(target, `Unknown source mode: ${mode}`);
  const frame = bossFrame(tab);
  await frame.locator(target.selector).click();
  await tab.playwright.waitForTimeout(800);
  const selected = cleanText(await frame.locator('.tab-item.curr').first().innerText());
  assert(selected.includes(target.label), `Mode switch failed: ${selected}`);
  return selected;
}

export async function extractCandidates(tab) {
  const cards = await bossFrame(tab).locator(CARD_SELECTOR).evaluateAll((nodes) => nodes.map((card) => {
    const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
    const text = clean(card.innerText);
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    const button = [...card.querySelectorAll('button')]
      .find((element) => element.innerText.trim().includes('打招呼'));
    const tags = [...card.querySelectorAll('.tag-item, .job-tag')]
      .map((element) => element.innerText.trim())
      .filter(Boolean);
    const advantageIndex = lines.indexOf('优势');
    const advantageLines = advantageIndex >= 0 ? lines.slice(advantageIndex + 1) : [];
    const stopWords = new Set(['项目经历', '教育经历', '打招呼', '继续沟通']);
    const summary = advantageLines.filter((line) => !stopWords.has(line)).join(' ');
    return {
      name: card.querySelector('.name')?.innerText?.trim() || '',
      salary: card.querySelector('.salary-wrap')?.innerText?.trim() || '',
      base: card.querySelector('.base-info')?.innerText?.trim() || '',
      expectation: card.querySelector('.expect-wrap')?.innerText?.trim() || '',
      tags: [...new Set(tags)],
      summary,
      text,
      hasGreetButton: Boolean(button),
      greetDisabled: button ? button.disabled : null,
      greetLabel: button?.innerText?.trim() || '',
      greetClass: button ? String(button.className || '') : ''
    };
  }));
  return cards.map((candidate) => {
    const salary = parseMoney(candidate.salary);
    return {
      ...candidate,
      key: candidateKey(candidate),
      salaryMin: salary?.min ?? null,
      salaryMax: salary?.max ?? null,
      experienceYears: parseYears(candidate.base),
      age: parseAge(candidate.base)
    };
  });
}

export function dedupeCandidates(candidates) {
  const seen = new Map();
  for (const candidate of candidates) {
    const key = candidate.key || candidateKey(candidate);
    if (!seen.has(key)) seen.set(key, { ...candidate, key });
  }
  return [...seen.values()];
}

export function rankCandidates(candidates, criteria = {}) {
  const city = cleanText(criteria.city);
  const required = (criteria.keywords || []).map((value) => cleanText(value).toLowerCase());
  const excluded = (criteria.excludeKeywords || []).map((value) => cleanText(value).toLowerCase());
  const minSalary = Number.isFinite(criteria.minSalary) ? criteria.minSalary : null;
  const maxSalary = Number.isFinite(criteria.maxSalary) ? criteria.maxSalary : null;
  const minExperience = Number.isFinite(criteria.minExperience) ? criteria.minExperience : null;

  return candidates.map((candidate) => {
    const text = `${candidate.text || ''} ${candidate.tags?.join(' ') || ''}`.toLowerCase();
    const aiSignals = keywordHits(text, AI_KEYWORDS);
    const productSignals = keywordHits(text, PRODUCT_KEYWORDS);
    const deliverySignals = keywordHits(text, DELIVERY_KEYWORDS);
    const customSignals = keywordHits(text, required);
    const exclusions = excluded.filter((keyword) => text.includes(keyword));
    const cityMatch = city ? text.includes(city.toLowerCase()) : null;
    const salaryMatch = minSalary != null || maxSalary != null
      ? candidate.salaryMax != null
        && (minSalary == null || candidate.salaryMax >= minSalary)
        && (maxSalary == null || candidate.salaryMin <= maxSalary)
      : null;
    const experienceMatch = minExperience != null
      ? candidate.experienceYears != null && candidate.experienceYears >= minExperience
      : null;

    let score = 15;
    score += Math.min(aiSignals.length, 4) * 8;
    score += Math.min(productSignals.length, 3) * 6;
    score += Math.min(deliverySignals.length, 3) * 5;
    score += Math.min(customSignals.length, 4) * 6;
    if (cityMatch === true) score += 10;
    if (salaryMatch === true) score += 5;
    if (experienceMatch === true) score += 5;
    score -= exclusions.length * 20;
    score = Math.max(0, Math.min(100, score));

    const risks = [];
    if (cityMatch === false) risks.push(`城市不匹配: ${criteria.city}`);
    if (salaryMatch === false) risks.push('薪资不在指定区间');
    if (experienceMatch === false) risks.push('经验低于指定年限');
    if (!aiSignals.length && criteria.requireAI) risks.push('未发现明确 AI 关键词');
    risks.push(...exclusions.map((keyword) => `命中排除条件: ${keyword}`));

    return {
      ...candidate,
      score,
      signals: { ai: aiSignals, product: productSignals, delivery: deliverySignals, custom: customSignals },
      risks,
      recommended: score >= 60 && risks.length === 0
    };
  }).sort((left, right) => right.score - left.score);
}

async function scrollCandidateFrame(tab) {
  const point = await tab.playwright.locator(FRAME_SELECTOR).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await tab.scroll([point.x, point.y], 'down', 1);
}

async function readScrollMetrics(tab) {
  return await bossFrame(tab).locator('body').evaluate((body) => ({
    scrollTop: body.scrollTop,
    scrollHeight: body.scrollHeight,
    clientHeight: body.clientHeight
  }));
}

export async function browseCandidates(tab, {
  mode = 'latest',
  limit = DEFAULT_LIMITS.collect,
  maxScrolls = null,
  enrichDetails = false,
  detailLimit = DEFAULT_LIMITS.detail,
  detailPages = 8,
  onProgress
} = {}) {
  const collectLimit = Math.min(Math.max(1, limit), DEFAULT_LIMITS.maxCollect);
  const scrollBudget = Number.isInteger(maxScrolls)
    ? Math.min(Math.max(1, maxScrolls), 500)
    : Math.max(20, Math.ceil(collectLimit / 5));
  const selectedMode = await selectSourceMode(tab, mode);
  const seen = new Map();
  let previousHeight = 0;

  for (let scroll = 0; scroll <= scrollBudget && seen.size < collectLimit; scroll += 1) {
    const cards = await extractCandidates(tab);
    for (const candidate of cards) seen.set(candidate.key, candidate);
    if (onProgress) onProgress({ phase: 'collect', mode: selectedMode, count: seen.size, scroll });
    if (seen.size >= collectLimit) break;

    const metrics = await readScrollMetrics(tab);
    const atBottom = metrics.scrollTop + metrics.clientHeight >= metrics.scrollHeight - 5;
    if (atBottom && metrics.scrollHeight === previousHeight) break;
    previousHeight = metrics.scrollHeight;
    await scrollCandidateFrame(tab);
    await tab.playwright.waitForTimeout(900);
  }

  let candidates = dedupeCandidates([...seen.values()]).slice(0, collectLimit);
  if (enrichDetails && candidates.length) {
    candidates = await enrichCandidateDetails(tab, candidates, {
      limit: Math.min(detailLimit, DEFAULT_LIMITS.maxDetail),
      detailPages,
      onProgress
    });
  }
  return candidates;
}

export async function enrichCandidateDetails(tab, candidates, {
  limit = DEFAULT_LIMITS.detail,
  detailPages = 8,
  onProgress
} = {}) {
  const frame = bossFrame(tab);
  const output = [];
  const detailLimit = Math.min(Math.max(0, limit), DEFAULT_LIMITS.maxDetail);

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (index >= detailLimit) {
      output.push(candidate);
      continue;
    }
    const matches = frame.locator(CARD_SELECTOR).filter({ hasText: candidate.name });
    const count = await matches.count();
    if (count !== 1) {
      output.push({ ...candidate, detailError: count === 0 ? 'candidate_not_found' : 'ambiguous_candidate' });
      continue;
    }
    await matches.first().click();
    const dialog = frame.locator('.dialog-wrap.active').first();
    await dialog.waitFor({ state: 'visible', timeoutMs: 5000 });
    const detailText = cleanText(await dialog.innerText());
    const pageInfo = await captureOpenResumePages(tab, { maxPages: detailPages });
    output.push({
      ...candidate,
      detailText,
      detailPageCount: pageInfo.length,
      detailScrollTops: pageInfo.map((page) => page.scrollTop),
      detailNeedsVisualReview: detailText.length < 500
    });
    await tab.pressKey(null, 'Escape');
    await frame.locator('.dialog-wrap.active').waitFor({ state: 'detached', timeoutMs: 3000 }).catch(() => {});
    if (onProgress) onProgress({ phase: 'detail', count: output.length, total: detailLimit, name: candidate.name });
  }
  return output;
}

export async function captureOpenResumePages(tab, { maxPages = 4, onPage } = {}) {
  const frame = bossFrame(tab);
  const dialog = frame.locator('.dialog-wrap.active').first();
  assert(await dialog.count(), 'No active resume dialog is open.');
  const scroller = dialog.locator('.resume-detail-wrap').first();
  const pageLimit = Math.min(Math.max(1, maxPages), 20);
  const pages = [];

  await scroller.click({ position: { x: 120, y: 120 } }).catch(() => {});

  for (let index = 0; index < pageLimit; index += 1) {
    const scrollState = await scroller.evaluate((element) => ({
      scrollTop: element.scrollTop,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight
    }));
    const screenshot = await tab.screenshot({ fullPage: false });
    const page = { index, ...scrollState, screenshot };
    pages.push(page);
    if (onPage) onPage(page);
    const atBottom = scrollState.scrollTop + scrollState.clientHeight >= scrollState.scrollHeight - 2;
    if (atBottom) break;
    await tab.pressKey(null, 'PageDown');
    await tab.playwright.waitForTimeout(500);
  }
  return pages;
}

export async function prepareGreetingPlan(tab, names) {
  assert(Array.isArray(names), 'names must be an array.');
  const frame = bossFrame(tab);
  const plan = [];
  for (const name of unique(names.map(cleanText))) {
    const matches = frame.locator(CARD_SELECTOR).filter({ hasText: name });
    const cardCount = await matches.count();
    if (cardCount !== 1) {
      plan.push({ name, status: cardCount === 0 ? 'missing' : 'ambiguous' });
      continue;
    }
    const card = matches.first();
    const text = cleanText(await card.innerText());
    const button = card.getByRole('button', { name: '打招呼' });
    const buttonCount = await button.count();
    if (!buttonCount) {
      plan.push({ name, status: text.includes('继续沟通') ? 'already_contacted' : 'no_greet_button' });
      continue;
    }
    plan.push({
      name,
      status: await button.first().isEnabled() ? 'ready' : 'disabled',
      buttonLabel: cleanText(await button.first().innerText()),
      cardText: text
    });
  }
  return plan;
}

export async function greetCandidates(tab, names, {
  confirmationToken,
  maxCount = DEFAULT_LIMITS.greet,
  rateLimitMs = 1500,
  onProgress
} = {}) {
  assert(confirmationToken === 'USER_CONFIRMED', 'Greeting requires explicit user confirmation.');
  assert(Array.isArray(names) && names.length, 'At least one candidate name is required.');
  const selected = unique(names.map(cleanText)).slice(0, Math.min(maxCount, DEFAULT_LIMITS.maxGreet));
  const frame = bossFrame(tab);
  const results = [];

  for (const name of selected) {
    const cards = frame.locator(CARD_SELECTOR).filter({ hasText: name });
    const cardCount = await cards.count();
    if (cardCount !== 1) {
      results.push({ name, status: cardCount === 0 ? 'missing' : 'ambiguous' });
      continue;
    }
    const card = cards.first();
    const button = card.getByRole('button', { name: '打招呼' });
    if (!(await button.count())) {
      results.push({ name, status: 'already_contacted_or_unavailable' });
      continue;
    }
    if (!(await button.first().isEnabled())) {
      results.push({ name, status: 'disabled' });
      continue;
    }

    await button.first().click();
    await tab.playwright.waitForTimeout(rateLimitMs);
    const bodyText = cleanText(await frame.locator('body').innerText());
    if (/安全验证|验证码|请完成验证|操作过于频繁/.test(bodyText)) {
      results.push({ name, status: 'stopped_by_captcha' });
      break;
    }

    const cardText = await card.innerText().then(cleanText).catch(() => '');
    const activeDialogCount = await frame.locator('.dialog-wrap.active').count();
    const verified = cardText.includes('继续沟通');
    const status = verified ? 'greeted' : activeDialogCount ? 'needs_codex_verification' : 'clicked_needs_verification';
    results.push({ name, status, activeDialogCount });
    if (onProgress) onProgress({ phase: 'greet', name, status, sent: results.length, total: selected.length });
    if (activeDialogCount) break;
  }
  return results;
}

export async function runSelfTest() {
  const fixtures = [
    {
      name: 'A', salary: '18-25K', base: '30岁 8年 本科',
      expectation: '宁波 项目经理/主管',
      text: 'AI Agent RAG 大模型 产品规划 项目交付 PMP',
      tags: ['产品经理'], key: 'a'
    },
    {
      name: 'B', salary: '12-16K', base: '35岁 10年以上 本科',
      expectation: '杭州 项目经理/主管',
      text: '传统 ERP 项目实施 项目管理',
      tags: ['项目经理'], key: 'b'
    }
  ];
  const ranked = rankCandidates(fixtures, {
    city: '宁波',
    minSalary: 16,
    maxSalary: 26,
    minExperience: 5,
    requireAI: true
  });
  assert(ranked[0].name === 'A', 'ranking self-test failed');
  assert(parseMoney('18-25K').max === 25, 'salary parser self-test failed');
  assert(parseYears('10年以上') >= 11, 'experience parser self-test failed');
  let guardPassed = false;
  try {
    await greetCandidates(null, ['A'], {});
  } catch (error) {
    guardPassed = /explicit user confirmation/.test(error.message);
  }
  assert(guardPassed, 'greeting confirmation guard self-test failed');
  const jevRuntime = await inspectJevRuntime();
  assert(jevRuntime.bridgeSource === 'bundled', 'bundled Jev bridge self-test failed');
  assert(jevRuntime.apiKeyInPlugin === false, 'API key isolation self-test failed');
  return { ok: true, tests: 6, jevRuntime, ranked: ranked.map(({ name, score }) => ({ name, score })) };
}

if (typeof process !== 'undefined' && process.argv?.[1]?.endsWith('boss-runtime.mjs')) {
  runSelfTest()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
