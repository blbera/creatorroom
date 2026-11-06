import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  parseTranscript,
  approve,
  decideFinding,
  reviseChapters,
  validatePack,
  type Project,
  type Content,
} from '../src/domain.js';
import { Store, type Job } from '../src/store.js';
import { Workflow } from '../src/workflow.js';
import type { SwitchClient } from '../src/switch.js';

const project = (): Project => {
  const segments = parseTranscript(readFileSync('fixtures/original.srt', 'utf8'), 60);
  const evidence = [{ claim: 'Collect notes', segments: [segments[0].id], quote: null }];
  const asset = (id: string, content: string) => ({ id, content, evidence });
  const content: Content = {
    chapters: segments.map((s, i) => ({
      title: ['Notes', 'Idea', 'Review'][i],
      start: i * 20,
      segments: [s.id],
    })),
    assets: {
      description: asset(
        'desc',
        'Keep this introduction.\n\nChapters\n00:00 Notes\n00:20 Idea\n00:40 Review\n\nKeep this closing.',
      ),
      x: asset('x', 'One\n\nTwo\n\nThree\n\nFour\n\nFive'),
      linkedin: asset('linkedin', 'Practical '.repeat(150).trim()),
      newsletter: asset('newsletter', 'Source '.repeat(250).trim()),
    },
  };
  return {
    id: 'editorial-test',
    title: 'Editorial source',
    videoId: null,
    duration: 60,
    profile: 'Practical',
    roomId: 'room',
    creatorId: 'human',
    segments,
    packs: [
      {
        version: 1,
        createdAt: new Date().toISOString(),
        changed: ['all'],
        content,
        review: { findings: [] },
        checks: [],
      },
    ],
    approvals: [],
    fixture: false,
  };
};
const harness = (p = project(), output?: (task: string, data: any) => unknown) => {
  const store = new Store(':memory:');
  store.save(p);
  store.set('participant:producer', 'producer-id');
  store.set('participant:reviewer', 'reviewer-id');
  const calls: { name: string; args: any }[] = [];
  const generations: { task: string; data: any }[] = [];
  const generate = async <T extends z.ZodType>(
    schema: T,
    task: string,
    data: unknown,
  ): Promise<z.infer<T>> => {
    generations.push({ task, data });
    if (!output) throw Error('Unexpected model call');
    return schema.parse(output(task, data));
  };
  const workflow = new Workflow(store, generate);
  const client = (name: string) =>
    ({
      name,
      connected: true,
      op: async (operation: string, args: any) => {
        calls.push({ name: operation, args });
        return { document_id: name + '-document', event_id: 'sent' };
      },
    }) as unknown as SwitchClient;
  workflow.clients = { producer: client('producer'), reviewer: client('reviewer') };
  const run = async (body: string, sender = 'human', agent = 'producer', messageId = body) => {
    const job: Job = {
      id: agent + ':' + messageId,
      agent,
      room: 'room',
      attempts: 0,
      event: JSON.stringify({
        type: 'message',
        room_id: 'room',
        payload: { message_id: messageId, sender, body },
      }),
    };
    await workflow.process(job, workflow.clients[agent]);
  };
  return { store, workflow, calls, generations, run };
};

test('blocking model findings require explicit creator decisions, which do not waive deterministic checks', () => {
  const p = project();
  p.packs[0].review!.findings = [
    {
      assetId: 'desc',
      severity: 'error',
      segments: [],
      explanation: 'Unsupported claim',
      suggestion: 'Remove it',
    },
  ];
  assert.throws(() => approve(p, 1, 'human', 'room', 'a'), /Resolve blocking/);
  assert.throws(() => decideFinding(p, 1, 'F1', 'I accept this wording', 'agent', 'room'));
  assert.throws(() => decideFinding(p, 2, 'F1', 'I accept this wording', 'human', 'room'));
  assert.throws(() => decideFinding(p, 1, 'F2', 'I accept this wording', 'human', 'room'));
  assert.throws(() => decideFinding(p, 1, 'F1', 'ok', 'human', 'room'));
  decideFinding(p, 1, 'F1', 'This is explicitly labelled my opinion', 'human', 'room');
  p.packs[0].checks = [
    {
      assetId: 'chapters',
      severity: 'error',
      segments: [],
      explanation: 'Bad timing',
      suggestion: 'Fix',
    },
  ];
  assert.throws(() => approve(p, 1, 'human', 'room', 'a'), /deterministic/);
  p.packs[0].checks = [];
  approve(p, 1, 'human', 'room', 'a');
  assert.equal(p.approvals[0].version, 1);
  assert.throws(() => decideFinding(p, 1, 'F1', 'Another reason', 'human', 'room'), /approved/);
});

test('chapter edits synchronise only description timestamp block and preserve historical approval/content', () => {
  const p = project(),
    original = structuredClone(p.packs[0]);
  approve(p, 1, 'human', 'room', 'approved');
  const chapters = structuredClone(original.content.chapters);
  chapters[1].start = 15;
  chapters[1].title = 'New angle';
  const next = reviseChapters(original, chapters);
  assert.deepEqual(original, p.packs[0]);
  for (const name of ['x', 'linkedin', 'newsletter'] as const)
    assert.deepEqual(next.content.assets[name], original.content.assets[name]);
  assert.match(next.content.assets.description.content, /00:15 New angle/);
  assert.match(next.content.assets.description.content, /^Keep this introduction/);
  assert.match(next.content.assets.description.content, /Keep this closing\.$/);
  assert.equal(next.review, undefined);
  assert.equal(next.findingDecisions, undefined);
  assert.equal(validatePack(p, next.content).filter((i) => i.assetId === 'chapters').length, 0);
  assert.equal(
    p.approvals.some((a) => a.version === next.version),
    false,
  );
});

test('creator Slack direction reaches angle generation and is recorded without reconstructing legacy history', async () => {
  const p = project();
  p.packs = [];
  const h = harness(p, () => ({
    angles: [
      { title: 'Trust', rationale: 'Practical', segments: [p.segments[0].id] },
      { title: 'Memory', rationale: 'Specific', segments: [p.segments[1].id] },
    ],
  }));
  await h.run('@producer brief Focus on trust relationships, not implementation.');
  assert.equal(
    h.generations[0].data.creatorRequest,
    'Focus on trust relationships, not implementation.',
  );
  assert.equal(h.store.get(p.id)?.creatorRequest, h.generations[0].data.creatorRequest);
  assert.equal(h.store.get(p.id)?.history?.length, 2);
  assert.equal(h.store.get(p.id)?.history?.[0].actor, 'Creator');
  h.store.db.close();
});

test('chapter request saves one immutable version, sends a real handoff, and retry does not regenerate or duplicate history', async () => {
  const p = project();
  const chapters = structuredClone(p.packs[0].content.chapters);
  chapters[1].start = 15;
  const h = harness(p, () => ({ chapters }));
  const body = '@producer revise chapters Move the second section to 00:15';
  await h.run(body);
  await h.run(body);
  const saved = h.store.get(p.id)!;
  assert.equal(saved.packs.length, 2);
  assert.equal(h.generations.length, 1);
  assert.equal(h.calls.filter((c) => c.name === 'send_targeted_message').length, 1);
  assert.equal(saved.history?.filter((e) => e.label.startsWith('Saved')).length, 1);
  assert.equal(saved.packs[1].review, undefined);
  assert.deepEqual(saved.packs[1].content.assets.x, p.packs[0].content.assets.x);
  h.store.db.close();
});

test('invalid chapter boundaries are rejected before a version or handoff is saved', async () => {
  const p = project();
  const chapters = structuredClone(p.packs[0].content.chapters);
  chapters[2].start = 59;
  const h = harness(p, () => ({ chapters }));
  await h.run('@producer revise chapters Put last section at 00:59');
  assert.equal(h.store.get(p.id)?.packs.length, 1);
  assert.equal(h.calls.filter((c) => c.name === 'send_targeted_message').length, 0);
  assert.match(h.calls.find((c) => c.name === 'post_message')?.args.body, /not saved/);
  h.store.db.close();
});

test('fixing an exact-version finding changes only its asset and asks Reviewer through Switch', async () => {
  const p = project();
  p.packs[0].review!.findings = [
    {
      assetId: 'linkedin',
      severity: 'error',
      segments: [p.segments[0].id],
      explanation: 'Unsupported opening',
      suggestion: 'Use notes from source',
    },
  ];
  const h = harness(p, () => ({
    ...p.packs[0].content.assets.linkedin,
    content: 'Corrected '.repeat(150).trim(),
  }));
  await h.run('@producer fix F1 v1');
  const next = h.store.get(p.id)!.packs[1];
  assert.equal(next.fixesFinding?.findingId, 'F1');
  assert.deepEqual(next.content.assets.description, p.packs[0].content.assets.description);
  assert.equal(next.review, undefined);
  assert.match(
    h.calls.find((c) => c.name === 'send_targeted_message')!.args.body,
    /review project editorial-test v2/,
  );
  await h.run('@producer fix F1 v1', 'human', 'producer', 'stale');
  assert.equal(h.store.get(p.id)!.packs.length, 2);
  h.store.db.close();
});

test('creator terminology preserves original transcript and is supplied to later revisions', async () => {
  const p = project();
  const h = harness(p, () => p.packs[0].content.assets.linkedin);
  await h.run('@producer glossary "Falco DB" => "FalkorDB"');
  await h.run('@producer revise linkedin Use the confirmed database spelling.');
  assert.deepEqual(h.store.get(p.id)!.segments, p.segments);
  assert.equal(h.generations[0].data.creatorConfirmedTerminology[0].to, 'FalkorDB');
  assert.equal(h.store.get(p.id)!.history?.[0].actor, 'Creator');
  h.store.db.close();
});

test('Reviewer checks all assets and only a Producer handoff can attach the report', async () => {
  const p = project();
  p.packs[0].review = undefined;
  const h = harness(p, () => ({
    findings: [
      {
        assetId: 'description',
        severity: 'error',
        segments: [p.segments[0].id],
        explanation: 'Unsupported claim',
        suggestion: 'Remove',
      },
    ],
  }));
  await h.run('review project editorial-test v1', 'human', 'reviewer', 'wrong-sender');
  assert.equal(h.generations.length, 0);
  await h.run('review project editorial-test v1', 'producer-id', 'reviewer');
  assert.match(h.generations[0].task, /Review ALL assets/);
  assert.equal(h.store.get(p.id)!.packs[0].review!.findings.length, 1);
  assert.equal(h.store.get(p.id)!.packs[0].review!.findings[0].assetId, 'desc');
  await h.run('@producer approve v1');
  assert.equal(h.store.get(p.id)!.approvals.length, 0);
  assert.ok(h.calls.some((c) => /Reviewed/.test(c.args.body ?? '')));
  h.store.db.close();
});

test('unresolved errors on unchanged assets survive a selective revision even when the next model review omits them', async () => {
  const p = project();
  p.packs[0].review!.findings = [
    {
      assetId: 'desc',
      severity: 'error',
      segments: [p.segments[0].id],
      explanation: 'Original unresolved claim',
      suggestion: 'Remove it',
    },
  ];
  const h = harness(p, (task) =>
    task.startsWith('Review the ORIGINAL')
      ? { findings: [] }
      : { ...p.packs[0].content.assets.linkedin, content: 'Revised '.repeat(150).trim() },
  );
  await h.run('@producer revise linkedin Change only the opening.');
  await h.run('review project editorial-test v2', 'producer-id', 'reviewer');
  const saved = h.store.get(p.id)!;
  assert.equal(saved.packs[1].review!.findings[0].explanation, 'Original unresolved claim');
  assert.throws(() => approve(saved, 2, 'human', 'room', 'approval'), /Resolve blocking/);
  assert.equal(saved.packs[1].findingDecisions, undefined);
  h.store.db.close();
});

test('a named fix can complete re-review and creator approval without touching the original version', async () => {
  const p = project();
  p.packs[0].review!.findings = [
    {
      assetId: 'desc',
      severity: 'error',
      segments: [p.segments[0].id],
      explanation: 'Original unsupported claim',
      suggestion: 'Use source notes',
    },
  ];
  const before = structuredClone(p.packs[0]);
  const h = harness(p, (task) =>
    task.startsWith('Review the ORIGINAL')
      ? { findings: [] }
      : {
          ...p.packs[0].content.assets.description,
          content: 'I collect source notes before writing.',
        },
  );
  await h.run('@producer fix F1 v1');
  await h.run('review project editorial-test v2', 'producer-id', 'reviewer');
  await h.run('@producer approve v2');
  const saved = h.store.get(p.id)!;
  assert.deepEqual(saved.packs[0], before);
  assert.equal(saved.packs[1].review!.findings.length, 0);
  assert.equal(saved.approvals[0].version, 2);
  assert.ok(saved.history!.some((event) => event.actor === 'Reviewer'));
  assert.ok(saved.history!.some((event) => event.label === 'Approved exact version v2'));
  h.store.db.close();
});
