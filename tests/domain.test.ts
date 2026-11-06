import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  parseTranscript,
  validatePack,
  revise,
  approve,
  exportPack,
  youtubeId,
  type Project,
  type Content,
} from '../src/domain.js';
import { Store } from '../src/store.js';

const source = readFileSync('fixtures/original.srt', 'utf8');
const segments = parseTranscript(source, 60);

const project = (): Project => {
  const evidence = [
    {
      claim: 'Collect source notes',
      segments: [segments[0].id],
      quote: 'I collect my source notes in one place.',
    },
  ];
  const a = { id: 'description-id', content: 'I collect my source notes in one place.', evidence };
  const c: Content = {
    chapters: [
      { title: 'Notes', start: 0, segments: [segments[0].id] },
      { title: 'Idea', start: 20, segments: [segments[1].id] },
      { title: 'Review', start: 40, segments: [segments[2].id] },
    ],
    assets: {
      description: a,
      x: {
        ...a,
        id: 'x',
        content: 'One\n\nTwo\n\nThree\n\nFour\n\nFive',
        evidence: [{ ...evidence[0], quote: null }],
      },
      linkedin: { ...a, id: 'li' },
      newsletter: { ...a, id: 'news' },
    },
  };
  return {
    id: 'test',
    title: '<script>alert(1)</script>',
    videoId: 'abcdefghijk',
    duration: 60,
    profile: '',
    roomId: 'room',
    creatorId: 'human',
    segments,
    packs: [
      {
        version: 1,
        content: c,
        createdAt: 'now',
        changed: ['all'],
        review: { findings: [] },
        checks: [],
      },
    ],
    approvals: [],
    fixture: false,
  };
};

test('SRT/VTT stable IDs, Unicode, hour timestamps and malformed input', () => {
  assert.equal(segments.length, 3);
  assert.deepEqual(parseTranscript(source, 60), segments);
  assert.equal(
    parseTranscript('WEBVTT\n\n00:00.000 --> 00:10.000\nCafé 👋', 10)[0].text,
    'Café 👋',
  );
  assert.throws(() => parseTranscript('1\n00:00:00,000 --> 00:00:70,000\nx', 80));
  assert.throws(() => parseTranscript(source, 30));
  assert.throws(() => parseTranscript('broken', 60));
  assert.throws(() => parseTranscript('x'.repeat(2100000), 60));
});
test('chapter checks include final duration, order, first chapter and count', () => {
  const p = project();
  assert.equal(
    validatePack(p, p.packs[0].content).filter((i) => i.assetId === 'chapters').length,
    0,
  );
  p.packs[0].content.chapters[2].start = 55;
  assert.ok(validatePack(p, p.packs[0].content).some((i) => i.assetId === 'chapters'));
  p.packs[0].content.chapters[0].start = 1;
  assert.ok(validatePack(p, p.packs[0].content).some((i) => i.explanation.includes('00:00')));
});
test('evidence and normalised exact quotes', () => {
  const p = project();
  assert.ok(!validatePack(p, p.packs[0].content).some((i) => i.explanation.includes('Quote')));
  p.packs[0].content.assets.description.evidence[0].quote = 'This was never said';
  assert.ok(validatePack(p, p.packs[0].content).some((i) => i.explanation.includes('Quote')));
  p.packs[0].content.chapters[0].segments = ['invented'];
  assert.ok(validatePack(p, p.packs[0].content).some((i) => i.explanation.includes('Unknown')));
});
test('selective revision preserves all other content and IDs; approval does not transfer', () => {
  const p = project();
  approve(p, 1, 'human', 'room', 'm1');
  const prev = structuredClone(p.packs[0]);
  const next = revise(prev, 'linkedin', { ...prev.content.assets.linkedin, content: 'Updated' });
  assert.deepEqual(next.content.assets.description, prev.content.assets.description);
  assert.deepEqual(next.content.chapters, prev.content.chapters);
  assert.notEqual(next.content.assets.linkedin.id, prev.content.assets.linkedin.id);
  assert.equal(prev.content.assets.linkedin.content, p.packs[0].content.assets.linkedin.content);
  p.packs.push(next);
  assert.equal(
    p.approvals.some((a) => a.version === 2),
    false,
  );
  assert.throws(() => approve(p, 1, 'human', 'room', 'm2'));
  assert.throws(() => approve(p, 2, 'human', 'room', 'm3'));
});
test('approval rejects agents, wrong rooms and stale versions; exports reflect version', () => {
  const p = project();
  assert.throws(() => approve(p, 1, 'agent', 'room', 'm'));
  assert.throws(() => approve(p, 1, 'human', 'other', 'm'));
  assert.throws(() => approve(p, 2, 'human', 'room', 'm'));
  approve(p, 1, 'human', 'room', 'm');
  assert.equal(JSON.parse(exportPack(p, 1, 'json')).approved, true);
  assert.match(exportPack(p, 1, 'markdown'), /youtube.com/);
  assert.equal(exportPack(p, 1, 'chapters').split('\n').length, 3);
  p.packs[0].content.chapters[2].start = 59;
  assert.throws(() => exportPack(p, 1, 'chapters'));
});
test('YouTube URLs are allowlisted, never arbitrary script URLs', () => {
  assert.equal(youtubeId('https://youtu.be/abcdefghijk'), 'abcdefghijk');
  assert.throws(() => youtubeId('javascript:alert(1)'));
  assert.throws(() => youtubeId('https://youtube.com.evil.test/watch?v=abcdefghijk'));
});
test('deduplication, immutable persistence and ambiguous sends survive restart', async () => {
  const dir = mkdtempSync(tmpdir() + '/creatorroom-test-');
  const file = dir + '/test.sqlite';
  let s = new Store(file);
  const event = { payload: { message_id: 'same' } };
  assert.equal(s.enqueue('producer', 'room', event), true);
  assert.equal(s.enqueue('producer', 'room', event), false);
  s.save(project());
  let calls = 0;
  await s.effect('sent', async () => {
    calls++;
    return { ok: true };
  });
  await s.effect('sent', async () => {
    calls++;
    return {};
  });
  assert.equal(calls, 1);
  await assert.rejects(
    s.effect('ambiguous', async () => {
      throw Error('Network lost after send');
    }),
  );
  s.db.close();
  s = new Store(file);
  assert.equal(s.get('test')?.title, '<script>alert(1)</script>');
  assert.equal(s.enqueue('producer', 'room', event), false);
  await assert.rejects(
    s.effect('ambiguous', async () => ({})),
    /reconciliation/,
  );
  s.db.close();
  rmSync(dir, { recursive: true });
});
test('YouTube rolling VTT preserves cue times and strips word timing markup', () => {
  const input =
    'WEBVTT\nKind: captions\nLanguage: en\n\n00:00:03.040 --> 00:00:05.269 align:start position:0%\n \nHello<00:00:03.280><c> world</c> &amp; friends\n\n00:00:05.269 --> 00:00:05.279 align:start position:0%\nHello world &amp; friends\n ';
  const cues = parseTranscript(input, 10);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, 'Hello world & friends');
  assert.equal(cues[0].start, 3.04);
  assert.equal(cues[1].end, 5.279);
  assert.notEqual(cues[0].id, cues[1].id);
});
test('VTT display-clearing cues do not become fabricated text segments', () => {
  const cues = parseTranscript(
    'WEBVTT\n\n00:00.000 --> 00:01.000\nHello\n\n00:01.000 --> 00:01.010\n \n\n00:01.010 --> 00:02.000\nWorld',
    2,
  );
  assert.equal(cues.length, 2);
  assert.equal(cues[1].start, 1.01);
});
test('Anthropic schema conversion removes unsupported constraints; local validation stays strict', async () => {
  const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod');
  const { Angles } = await import('../src/domain.js');
  const format = zodOutputFormat(Angles);
  assert.equal((format.schema.properties as any).angles.minItems, undefined);
  assert.equal(Angles.safeParse({ angles: [] }).success, false);
});

test('evidence classification preserves actual direct quotes and corrects paraphrase metadata', async () => {
  const { classifyEvidenceQuotes } = await import('../src/domain.js');
  const p = project();
  const asset = p.packs[0].content.assets.description;
  const classified = classifyEvidenceQuotes(asset);
  assert.equal(classified.evidence[0].quote, asset.evidence[0].quote);
  const paraphrase = { ...asset, content: 'Collect your notes before writing.' };
  const corrected = classifyEvidenceQuotes(paraphrase);
  assert.equal(corrected.evidence[0].quote, null);
  assert.deepEqual(corrected.evidence[0].segments, paraphrase.evidence[0].segments);
  assert.equal(paraphrase.evidence[0].quote, asset.evidence[0].quote);
  const invented = {
    ...asset,
    content: 'Invented quote',
    evidence: [{ ...asset.evidence[0], quote: 'Invented quote' }],
  };
  p.packs[0].content.assets.description = classifyEvidenceQuotes(invented);
  assert.ok(
    validatePack(p, p.packs[0].content).some((i) => i.explanation.includes('Quote does not match')),
  );
});
