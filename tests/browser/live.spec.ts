import { test, expect } from '@playwright/test';

test('live YouTube: actual playback and chapter seeking', async ({ page, request }) => {
  test.skip(
    !process.env.LIVE_PROJECT_ID,
    'Set LIVE_PROJECT_ID to your local creator-owned video project.',
  );
  const id = process.env.LIVE_PROJECT_ID!;
  const project = await (await request.get(`/api/projects/${id}`)).json();
  const pack = project.packs.at(-1);
  const chapter = pack.content.chapters.find((c: any) => c.start > 0);
  await page.goto(`/?project=${id}`);
  await expect(page.getByText('Player ready · section seeking available')).toBeVisible({
    timeout: 30000,
  });
  const frame = page.frames().find((frame) => frame.url().includes('youtube.com/embed/'));
  expect(frame, 'Official YouTube iframe must exist').toBeTruthy();
  await frame!.getByRole('button', { name: 'Play video', exact: true }).click({ timeout: 15000 });
  await expect
    .poll(() => frame!.locator('video').evaluate((video: any) => video.currentTime), {
      timeout: 20000,
    })
    .toBeGreaterThan(0);
  await page.locator('.chapters button').filter({ hasText: chapter.title }).click();
  await expect
    .poll(
      async () =>
        Math.abs(
          (await frame!.locator('video').evaluate((video: any) => video.currentTime)) -
            chapter.start,
        ),
      { timeout: 15000 },
    )
    .toBeLessThan(4);
  const duration = await frame!.locator('video').evaluate((video: any) => video.duration);
  console.log(
    JSON.stringify({
      liveVideoDuration: duration,
      projectDuration: project.duration,
      seekTarget: chapter.start,
    }),
  );
  await page
    .getByRole('searchbox', { name: 'Search transcript' })
    .fill(project.segments[0].text.split(' ')[0]);
  await expect(page.locator('.cue').first()).toBeVisible();
  const evidence = page.locator('.evidence-source').first();
  await evidence.click();
  await page.getByRole('tab', { name: 'LinkedIn', exact: true }).click();
  await page.getByRole('button', { name: 'Compare previous' }).click();
  await expect(page.locator('.diff')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'JSON ↓' }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe(`creatorroom-v${pack.version}.json`);
  const stream = await exported.createReadStream();
  let body = '';
  for await (const chunk of stream!) body += chunk.toString();
  expect(JSON.parse(body).pack.version).toBe(pack.version);
  expect(JSON.parse(body).approved).toBe(true);
  await page.screenshot({ path: '.local/verification-live-desktop.png', fullPage: true });
});
