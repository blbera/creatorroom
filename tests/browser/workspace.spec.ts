import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { parseTranscript, exportPack, revise, type Project } from '../../src/domain';

const segments = parseTranscript(readFileSync('fixtures/original.srt', 'utf8'), 60);
const evidence = [{ claim: 'Collect notes first.', segments: [segments[0].id], quote: null }];
const asset = { id: 'fixture-asset', content: 'An original fixture draft.', evidence };
const fixture: Project = {
  id: 'browser-fixture',
  title: 'Original browser fixture',
  videoId: 'abcdefghijk',
  duration: 60,
  profile: '',
  roomId: 'fixture-room',
  creatorId: 'fixture-creator',
  segments,
  fixture: true,
  approvals: [],
  packs: [
    {
      version: 1,
      createdAt: '2026-11-05T00:00:00Z',
      changed: ['all'],
      content: {
        chapters: [
          { title: 'Collect notes', start: 0, segments: [segments[0].id] },
          { title: 'Choose an idea', start: 20, segments: [segments[1].id] },
          { title: 'Review', start: 40, segments: [segments[2].id] },
        ],
        assets: {
          description: { ...asset, id: 'description' },
          x: { ...asset, id: 'x' },
          linkedin: { ...asset, id: 'linkedin' },
          newsletter: { ...asset, id: 'newsletter' },
        },
      },
    },
  ],
};
fixture.packs.push(
  revise(fixture.packs[0], 'linkedin', { ...asset, content: 'Revised original fixture.' }),
);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__seekCalls = [];
    (window as any).YT = {
      Player: class {
        constructor(element: HTMLElement, options: any) {
          const placeholder = document.createElement('div');
          placeholder.textContent = 'MOCKED PLAYER — no real video loaded';
          element.replaceWith(placeholder);
          queueMicrotask(() => options.events.onReady());
        }

        seekTo = (time: number) => {
          (window as any).__seekCalls.push(time);
        };

        destroy = () => {};
      },
    };
  });
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/projects')
      return route.fulfill({ json: [{ id: fixture.id, title: fixture.title, fixture: true }] });
    if (path === '/api/status')
      return route.fulfill({ json: { switchHealthy: false, modelConfigured: false, workers: {} } });
    if (path.includes('/exports/')) {
      const parts = path.split('/');
      const version = Number(parts.at(-2));
      const format = parts.at(-1)!;
      return route.fulfill({
        body: exportPack(fixture, version, format),
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="fixture-v${version}.json"`,
        },
      });
    }
    return route.fulfill({ json: fixture });
  });
});

test('mocked player: search, section, evidence, revision and exact-version download', async ({
  page,
}) => {
  await page.goto('/?project=browser-fixture');
  await expect(page.getByRole('heading', { name: fixture.title })).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search transcript' }).fill('another day');
  await expect(page.locator('.cue')).toHaveCount(1);
  await page.getByRole('button', { name: '00:20 Choose an idea' }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__seekCalls.at(-1))).toBe(20);
  await page.locator('.evidence-source').first().click();
  await expect.poll(() => page.evaluate(() => (window as any).__seekCalls.at(-1))).toBe(0);
  await page.getByRole('tab', { name: 'LinkedIn', exact: true }).click();
  await page.getByRole('button', { name: 'Compare previous' }).click();
  await expect(page.locator('.diff del')).toContainText('An original fixture draft.');
  await expect(page.locator('.diff ins')).toContainText('Revised original fixture.');
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'JSON ↓' }).click();
  const result = await download;
  expect(result.suggestedFilename()).toBe('fixture-v2.json');
  const stream = await result.createReadStream();
  let body = '';
  for await (const chunk of stream!) body += chunk.toString();
  expect(JSON.parse(body).pack.version).toBe(2);
});

test('mocked API: transcript and generated input render as text, never HTML', async ({ page }) => {
  const unsafe = structuredClone(fixture);
  unsafe.title = '<img src=x onerror="window.__executed=true">';
  unsafe.segments[0].text = '<script>window.__executed=true</script>';
  unsafe.packs[1].content.assets.description.content =
    '<img src=x onerror="window.__executed=true">';
  await page.route('**/api/projects/browser-fixture', (route) => route.fulfill({ json: unsafe }));
  await page.goto('/?project=browser-fixture');
  await expect(page.getByRole('heading', { name: unsafe.title })).toBeVisible();
  await expect(page.locator('.asset-content')).toContainText('<img');
  await expect(page.locator('.asset-content img')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__executed)).toBeUndefined();
});

test('mocked API: project selection survives background refresh', async ({ page }) => {
  const second = {
    ...structuredClone(fixture),
    id: 'second-fixture',
    title: 'Second original fixture',
  };
  await page.route('**/api/projects', (route) =>
    route.fulfill({
      json: [
        { id: fixture.id, title: fixture.title },
        { id: second.id, title: second.title },
      ],
    }),
  );
  await page.route('**/api/projects/second-fixture', (route) => route.fulfill({ json: second }));
  await page.goto('/?project=browser-fixture');
  await page.getByRole('combobox', { name: 'Select project' }).selectOption(second.id);
  await expect(page.getByRole('heading', { name: second.title })).toBeVisible();
  await page.waitForTimeout(5500);
  await expect(page.getByRole('heading', { name: second.title })).toBeVisible();
});

test('mocked player: mobile layout has no horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?project=browser-fixture');
  await expect(page.getByRole('heading', { name: fixture.title })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '.local/verification-mobile-fixture.png', fullPage: true });
});

test('mocked player: reduced-motion preference disables decorative animations', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?project=browser-fixture');
  await expect(page.getByRole('heading', { name: fixture.title })).toBeVisible();
  const animation = await page
    .locator('.pack-column')
    .evaluate((node) => getComputedStyle(node).animationName);
  expect(animation).toBe('none');
});

test('mocked editorial state: brief, history, glossary and exact-version finding commands', async ({
  page,
}) => {
  const editorial = structuredClone(fixture);
  const pack = editorial.packs.at(-1)!;
  pack.creatorRequest = 'Focus on one practical lesson.';
  pack.brief = JSON.stringify({ title: 'A source-grounded practical angle' });
  pack.review = {
    findings: [
      {
        assetId: pack.content.assets.description.id,
        severity: 'error',
        segments: [segments[0].id],
        explanation: 'Fixture unsupported opening.',
        suggestion: 'Use the source notes.',
      },
    ],
  };
  editorial.history = [
    {
      id: 'fixture-history',
      actor: 'Creator',
      label: 'Fixture: chose the practical angle',
      at: '2026-11-06T10:00:00Z',
      messageId: 'fixture-message',
    },
  ];
  editorial.glossary = [
    {
      from: 'Original term',
      to: 'Creator term',
      creatorId: 'fixture-creator',
      at: '2026-11-06T10:00:00Z',
    },
  ];
  await page.route('**/api/projects/browser-fixture', (route) =>
    route.fulfill({ json: editorial }),
  );
  await page.goto('/?project=browser-fixture');
  await expect(page.getByText('Focus on one practical lesson.', { exact: true })).toBeVisible();
  await expect(page.getByText('A source-grounded practical angle', { exact: true })).toBeVisible();
  await page.getByText('Editorial history · 1 recorded events', { exact: true }).click();
  await expect(page.getByText('Fixture: chose the practical angle')).toBeVisible();
  await page.getByText('Creator-confirmed terminology · 1', { exact: true }).click();
  await expect(page.getByText('Original term → Creator term', { exact: true })).toBeVisible();
  await expect(
    page.getByText('@producer project browser-fixture fix F1 v2', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('@producer project browser-fixture approve v2', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('status').filter({ hasText: 'Blocking review findings' }),
  ).toBeVisible();
});

test('legacy versions disclose unavailable brief/history instead of inventing earlier events', async ({
  page,
}) => {
  await page.goto('/?project=browser-fixture');
  await expect(
    page.getByText('No original Slack brief was recorded for this version.'),
  ).toBeVisible();
  await page.getByText('Editorial history · 0 recorded events', { exact: true }).click();
  await expect(
    page.getByText('History recording starts with new Slack actions.', { exact: false }),
  ).toBeVisible();
});
