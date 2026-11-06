import { Store } from '../src/store.js';
import { parseTranscript, revise, type Project, type Content } from '../src/domain.js';
import { readFileSync } from 'node:fs';

const store = new Store();
const segments = parseTranscript(readFileSync('fixtures/original.srt', 'utf8'), 60);
const evidence = [
  { claim: 'Start by collecting source notes.', segments: [segments[0].id], quote: null },
];
const content: Content = {
  chapters: [
    { title: 'Collect your notes', start: 0, segments: [segments[0].id] },
    { title: 'Choose one idea', start: 20, segments: [segments[1].id] },
    { title: 'Review before sharing', start: 40, segments: [segments[2].id] },
  ],
  assets: {
    description: {
      id: 'fixture-description',
      content:
        'A small original writing exercise: collect notes, choose one idea, then review it.\n\n00:00 Collect your notes\n00:20 Choose one idea\n00:40 Review before sharing',
      evidence,
    },
    x: {
      id: 'fixture-x',
      content:
        'Collect your source notes.\n\nChoose one idea to explain.\n\nWrite a small first draft.\n\nCheck the draft against your notes.\n\nKeep the draft until you decide to share.',
      evidence,
    },
    linkedin: {
      id: 'fixture-linkedin',
      content:
        'This fixture demonstrates an editorial workflow: collect notes, select one idea, and review before sharing. It is intentionally short and will trigger a length warning.',
      evidence,
    },
    newsletter: {
      id: 'fixture-newsletter',
      content:
        'Collect your notes. Choose one idea. Review before sharing. This is original fixture content, not a transcript of an unrelated YouTube video.',
      evidence,
    },
  },
};
const p: Project = {
  id: 'fixture',
  title: 'A small writing ritual — original fixture',
  videoId: null,
  duration: 60,
  profile: 'Clear, practical, no inflated claims.',
  roomId: 'fixture-room',
  creatorId: 'fixture-human',
  segments,
  packs: [{ version: 1, createdAt: '2026-11-05T00:00:00Z', content, changed: ['all'] }],
  approvals: [],
  fixture: true,
};
p.packs.push(
  revise(p.packs[0], 'linkedin', {
    ...content.assets.linkedin,
    content:
      'Begin with one idea. This revised fixture keeps the source notes at the centre and leaves the other formats unchanged.',
  }),
);
if (!store.get('fixture')) store.save(p);
store.db.close();
console.log('Original fixture saved; no model or Slack calls, no unrelated video.');
