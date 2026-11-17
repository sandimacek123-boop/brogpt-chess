import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const sc = (page: Page, expr: string) => page.evaluate(`window.__SORTCLAUDE__.${expr}`);
const pos = (page: Page) => sc(page, 'pos') as Promise<number>;

async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#/visualizer');
  await page.waitForFunction(() => (window as any).__SORTCLAUDE__?.total > 0);
}

test('interface acceptance: merge sort, bars, 160, seed, playback, time travel, viz switch, reproducibility', async ({ page }) => {
  await fresh(page);
  await page.click('[data-algo="merge"]');
  await page.click('[data-viz="bars"]');
  await page.selectOption('select[aria-label="Element count preset"]', '160');
  await page.selectOption('select[aria-label="Initial order"]', 'random');
  await page.fill('[data-testid=seed]', '777');
  await page.press('[data-testid=seed]', 'Enter');
  await page.waitForFunction(() => (window as any).__SORTCLAUDE__.initialKeys().length === 160);
  await page.waitForTimeout(400);
  const initial = (await sc(page, 'initialKeys()')) as number[];
  expect([...initial].sort((a, b) => a - b)).toEqual(Array.from({ length: 160 }, (_, i) => i + 1));

  await page.click('[data-testid=play]');
  await page.waitForTimeout(1500);
  const p1 = await pos(page);
  expect(p1).toBeGreaterThan(0);
  expect(Number((await page.textContent('[data-testid=stat-ops]'))!.replace(/,/g, ''))).toBeGreaterThan(0);

  await page.click('[data-testid=play]'); // pause
  const paused = await pos(page);
  await page.waitForTimeout(500);
  expect(await pos(page)).toBe(paused);

  await page.click('button[aria-label="Step backward"]');
  expect(await pos(page)).toBe(paused - 1);
  await page.click('button[aria-label="Step forward"]');
  expect(await pos(page)).toBe(paused);

  await page.selectOption('[data-testid=speed]', '8');
  await page.click('[data-testid=play]'); // resume
  await page.waitForTimeout(800);
  const beforeSwitch = await pos(page);
  await page.click('[data-testid=play]'); // pause
  const atSwitch = await pos(page);
  expect(atSwitch).toBeGreaterThanOrEqual(beforeSwitch);
  await page.click('[data-viz="spiral"]');
  await page.waitForTimeout(300);
  expect(await pos(page)).toBe(atSwitch); // state preserved across visualization switch

  await page.click('button[aria-label="Go to completion"]');
  expect(await sc(page, 'done')).toBe(true);
  const final = (await sc(page, 'keysAt()')) as number[];
  expect(final).toEqual([...initial].sort((a, b) => a - b));

  await page.click('button:has-text("Restart")');
  expect(await pos(page)).toBe(0);
  expect(await sc(page, 'keysAt()')).toEqual(initial);
  // reload with same seed reproduces the same data
  await page.reload();
  await page.waitForFunction(() => (window as any).__SORTCLAUDE__?.total > 0);
  expect(await sc(page, 'initialKeys()')).toEqual(initial);
});

test('keyboard shortcuts work and do not fire while typing', async ({ page }) => {
  await fresh(page);
  await page.click('[data-testid=stage]');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  expect(await pos(page)).toBe(2);
  await page.click('[data-testid=seed]');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type(' ');
  expect(await pos(page)).toBe(2);
});

test('battle acceptance: identical data, independent counters, pause/resume, verified results, export, replay', async ({ page }) => {
  await fresh(page);
  await page.click('[data-tab=battle]');
  await page.selectOption('[data-testid=contestant-0]', 'quick');
  await page.selectOption('[data-testid=contestant-1]', 'bubble');
  await page.selectOption('select[aria-label="Visualization (all contestants)"]', 'spiral');
  await page.click('[data-testid=prepare-battle]');
  await expect(page.locator('[data-testid=contestant]')).toHaveCount(2);
  await page.click('[data-testid=battle-play]');
  await page.waitForTimeout(1500);
  await page.click('[data-testid=battle-play]'); // pause both
  const stats1 = await page.locator('.c-stats').allTextContents();
  await page.waitForTimeout(600);
  expect(await page.locator('.c-stats').allTextContents()).toEqual(stats1);
  expect(stats1[0]).not.toEqual(stats1[1]);
  await page.click('[data-testid=battle-play]'); // resume
  await page.click('button:text-is("Finish")');
  // finishing a running race opens the results screen automatically
  await expect(page.locator('text=Winner: Quick Sort')).toBeVisible();
  await page.keyboard.press('Escape');
  const dl = page.waitForEvent('download');
  await page.click('button:has-text("JSON")');
  const file = await (await dl).path();
  const json = JSON.parse(await readFile(file!, 'utf8'));
  expect(json.seed).toBe(42);
  expect(json.results).toHaveLength(2);
  expect(json.results.every((r: any) => r.verifiedSorted)).toBe(true);
  expect(json.results.find((r: any) => r.id === 'bubble').comparisons).toBe((160 * 159) / 2);
  await page.click('button:text-is("Replay")');
  await expect(page.locator('.c-stats').first()).toContainText('ops 0');
});

test('custom algorithm sandbox verifies correct code and catches broken / runaway code', async ({ page }) => {
  await page.goto('/#/lab');
  await page.click('text=Creator');
  await page.waitForSelector('.cm-editor');
  await page.click('[data-testid=run-custom]');
  await expect(page.locator('[data-testid=custom-result]')).toContainText('Output is sorted');
  await expect(page.locator('[data-testid=custom-result]')).toContainText('No elements lost');
  await page.selectOption('select[aria-label="Load example"]', 'Broken example (loses data)');
  await page.click('[data-testid=run-custom]');
  await expect(page.locator('[data-testid=custom-result]')).toContainText('Elements were lost');
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('function sort(n) { while (true) { compare(0, 1); } }');
  await page.click('[data-testid=run-custom]');
  await expect(page.locator('[data-testid=custom-result]')).toContainText('possible infinite loop', { timeout: 20000 });
  // sandbox has no network access
  await page.click('.cm-content');
  await page.keyboard.press('Control+a');
  await page.keyboard.type('function sort(n) { log(typeof fetch, typeof XMLHttpRequest, typeof importScripts); }');
  await page.click('[data-testid=run-custom]');
  await expect(page.locator('[data-testid=custom-result]')).toContainText('undefined undefined undefined');
});

test('cinematic export acceptance: vertical video with audio, progress, valid file', async ({ page }) => {
  await page.goto('/#/studio');
  await page.click('[data-preset="Neon Spiral"]');
  await page.click('.seg button:has-text("720p")');
  await page.click('.seg button:has-text("30")');
  await expect(page.locator('[data-testid=capabilities]')).toContainText('Encoder:', { timeout: 20000 });
  const dl = page.waitForEvent('download', { timeout: 240000 });
  await page.click('[data-testid=export]');
  await expect(page.locator('[data-testid=export-progress]')).toBeVisible();
  const file = await (await dl).path();
  const buf = await readFile(file!);
  expect(buf.length).toBeGreaterThan(100_000);
  const head = buf.subarray(0, 64).toString('latin1');
  expect(head.includes('ftyp') || buf.subarray(0, 4).toString('hex') === '1a45dfa3').toBe(true);
  await expect(page.locator('[data-testid=export-result]')).toContainText('720×1280');
  await expect(page.locator('[data-testid=export-result]')).toContainText('with audio');
});

test('benchmark runs and all pages load without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/benchmark');
  await page.click('[data-testid=run-bench]');
  await expect(page.locator('text=All results')).toBeVisible({ timeout: 120000 });
  for (const tab of ['visualizer', 'battle', 'lab', 'studio', 'settings']) {
    await page.click(`[data-tab=${tab}]`);
    await page.waitForTimeout(600);
  }
  expect(errors).toEqual([]);
});
