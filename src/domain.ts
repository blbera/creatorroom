import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';

export const AssetName = z.enum(['description', 'x', 'linkedin', 'newsletter']);
export type AssetName = z.infer<typeof AssetName>;
export const Evidence = z.object({
  claim: z.string().min(1),
  segments: z.array(z.string()).min(1),
  quote: z.string().nullable(),
});
export const Asset = z.object({
  id: z.string(),
  content: z.string().min(1),
  evidence: z.array(Evidence).min(1),
});
export const Chapter = z.object({
  title: z.string().min(1),
  start: z.number().nonnegative(),
  segments: z.array(z.string()).min(1),
});
export const PackContent = z.object({
  chapters: z.array(Chapter),
  assets: z.object({ description: Asset, x: Asset, linkedin: Asset, newsletter: Asset }),
});
export const Angles = z.object({
  angles: z
    .array(
      z.object({ title: z.string(), rationale: z.string(), segments: z.array(z.string()).min(1) }),
    )
    .length(2),
});
export const Finding = z.object({
  assetId: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
  segments: z.array(z.string()),
  explanation: z.string(),
  suggestion: z.string(),
});
export const Review = z.object({ findings: z.array(Finding) });
export type Segment = {
  id: string;
  start: number;
  end: number;
  text: string;
  originalEnd?: number;
};
export type Content = z.infer<typeof PackContent>;
export type Pack = {
  version: number;
  createdAt: string;
  content: Content;
  changed: (AssetName | 'chapters')[] | ['all'];
  creatorRequest?: string;
  brief?: string;
  findingDecisions?: { findingId: string; reason: string; creatorId: string; at: string }[];
  fixesFinding?: { version: number; findingId: string; explanation: string };
  evidenceRepair?: boolean;
  review?: z.infer<typeof Review>;
  checks?: Issue[];
};
export type Project = {
  id: string;
  title: string;
  videoId: string | null;
  duration: number;
  profile: string;
  roomId: string;
  creatorId: string;
  segments: Segment[];
  angles?: z.infer<typeof Angles>['angles'];
  brief?: string;
  creatorRequest?: string;
  glossary?: { from: string; to: string; creatorId: string; at: string }[];
  history?: EditorialEvent[];
  packs: Pack[];
  approvals: {
    version: number;
    creatorId: string;
    messageId: string;
    at: string;
  }[];
  fixture: boolean;
};
export type EditorialEvent = {
  id: string;
  at: string;
  actor: 'Creator' | 'Producer' | 'Reviewer';
  label: string;
  version?: number;
  messageId: string;
};
export type Issue = {
  assetId: string;
  severity: 'error' | 'warning' | 'info';
  segments: string[];
  explanation: string;
  suggestion: string;
};

export const timestamp = (n: number) => {
  const h = Math.floor(n / 3600),
    m = Math.floor((n % 3600) / 60),
    s = Math.floor(n % 60);
  return (
    (h ? String(h).padStart(2, '0') + ':' : '') +
    String(m).padStart(2, '0') +
    ':' +
    String(s).padStart(2, '0')
  );
};

const seconds = (value: string) => {
  const parts = value.replace(',', '.').split(':').map(Number);
  if (
    parts.length < 2 ||
    parts.length > 3 ||
    parts.some((x) => !Number.isFinite(x) || x < 0) ||
    parts.at(-1)! >= 60 ||
    parts.at(-2)! >= 60
  )
    throw Error('Invalid timestamp');
  return parts.reduce((a, b) => a * 60 + b, 0);
};

export const parseTranscript = (input: string, duration: number): Segment[] => {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 86400)
    throw Error('Duration must be 1–86400 seconds');
  if (Buffer.byteLength(input) > 2 * 1024 * 1024) throw Error('Transcript exceeds 2 MiB');
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const result: Segment[] = [];
  const lines = text.split('\n');
  const starts = lines.map((l, i) => (l.includes('-->') ? i : -1)).filter((i) => i >= 0);
  if (!starts.length) throw Error('Malformed subtitle block');
  const header = lines.slice(0, starts[0]).join('\n').trim();
  if (header && !header.startsWith('WEBVTT') && !/^\d+$/.test(header))
    throw Error('Malformed subtitle header');
  for (let cue = 0; cue < starts.length; cue++) {
    const i = starts[cue];
    const match = lines[i].match(
      /^\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+((?:\d+:)?\d{2}:\d{2}[.,]\d{3})(?:\s+.*)?$/,
    );
    if (!match) throw Error('Malformed cue timestamps');
    const content = lines.slice(i + 1, starts[cue + 1] ?? lines.length);
    while (content.length && !content.at(-1)!.trim()) content.pop();
    if (cue < starts.length - 1 && /^\d+$/.test(content.at(-1)?.trim() ?? '')) content.pop();
    const start = seconds(match[1]),
      end = seconds(match[2]);
    const body = content
      .join('\n')
      .replace(/<(?:\d+:)?\d{2}:\d{2}[.]\d{3}>/g, '')
      .replace(/<\/?(?:b|i|u|c(?:\.[\w-]+)?|v(?: [^>]*)?|lang(?: [^>]*)?)>/g, '')
      .replace(
        /&(?:amp|lt|gt|quot|apos|nbsp);/g,
        (x) =>
          ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' })[
            x
          ]!,
      )
      .trim();
    if (!body && text.startsWith('WEBVTT') && end > start && end <= duration + 0.05) continue;
    if (end <= start) throw Error(`Transcript cue ${cue + 1} must end after it starts.`);
    if (end > duration + 0.05)
      throw Error(
        `Transcript cue ${cue + 1} ends at ${end} seconds, beyond the confirmed ${duration}-second video duration. Check the duration or use captions trimmed to the video.`,
      );
    if (start < (result.at(-1)?.start ?? 0))
      throw Error(`Transcript cue ${cue + 1} starts before the preceding cue.`);
    if (!body) throw Error(`Transcript cue ${cue + 1} has no text.`);
    result.push({
      id: 's-' + createHash('sha256').update(`${start}|${end}|${body}`).digest('hex').slice(0, 16),
      start,
      end,
      text: body,
    });
  }
  if (!result.length || result.length > 20000) throw Error('Expected 1–20000 transcript cues');
  return result;
};

export const youtubeId = (value: string) => {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw Error('Invalid YouTube URL');
  }
  if (u.protocol !== 'https:') throw Error('Use an HTTPS YouTube URL');
  let id: string | null = null;
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(u.hostname))
    id =
      u.pathname === '/watch'
        ? u.searchParams.get('v')
        : (u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)$/)?.[1] ?? null);
  else if (u.hostname === 'youtu.be') id = u.pathname.slice(1);
  if (!id || !/^[\w-]{11}$/.test(id)) throw Error('Unsupported YouTube URL');
  return id;
};

const normal = (s: string) => s.normalize('NFKC').replace(/\s+/g, ' ').trim();

export const validatePack = (project: Project, content: Content): Issue[] => {
  const issues: Issue[] = [];
  const ids = new Map(project.segments.map((s) => [s.id, s]));

  const add = (
    assetId: string,
    explanation: string,
    segments: string[] = [],
    severity: Issue['severity'] = 'error',
  ) =>
    issues.push({
      assetId,
      severity,
      segments,
      explanation,
      suggestion: 'Revise using the original timestamped transcript.',
    });

  const refs = (assetId: string, ss: string[]) => {
    for (const id of ss) if (!ids.has(id)) add(assetId, `Unknown source segment ${id}`);
  };

  if (content.chapters.length < 3)
    add('chapters', 'Native chapter text requires at least three sections');
  if (content.chapters[0]?.start !== 0) add('chapters', 'First chapter must start at 00:00');
  content.chapters.forEach((c, i) => {
    refs('chapters', c.segments);
    const end = content.chapters[i + 1]?.start ?? project.duration;
    if (c.start < 0 || c.start >= project.duration || end - c.start < 10)
      add(
        'chapters',
        'Each chapter, including the final one, must last at least 10 seconds',
        c.segments,
      );
  });
  for (const [name, asset] of Object.entries(content.assets)) {
    for (const e of asset.evidence) {
      refs(asset.id, e.segments);
      if (e.quote) {
        const source = e.segments.map((id) => ids.get(id)?.text ?? '').join(' ');
        if (!normal(source).includes(normal(e.quote)))
          add(asset.id, 'Quote does not match NFKC/whitespace-normalised source', e.segments);
        if (!normal(asset.content).includes(normal(e.quote)))
          add(asset.id, 'Mapped quote is absent from asset', e.segments);
      }
    }
    const words = asset.content.trim().split(/\s+/).length;
    if (name === 'x') {
      const posts = asset.content.split(/\n\s*\n/);
      if (posts.length < 5 || posts.length > 7) add(asset.id, 'X thread needs 5–7 posts');
      if (posts.some((p) => Array.from(p).length > 270))
        add(
          asset.id,
          'X post exceeds conservative 270-character budget (not platform-weighted validation)',
        );
    }
    if (name === 'linkedin' && (words < 150 || words > 250))
      add(asset.id, 'LinkedIn target is 150–250 words', [], 'warning');
    if (name === 'newsletter' && (words < 250 || words > 400))
      add(asset.id, 'Newsletter target is 250–400 words', [], 'warning');
  }
  return issues;
};

export const classifyEvidenceQuotes = (asset: z.infer<typeof Asset>): z.infer<typeof Asset> => ({
  ...structuredClone(asset),
  evidence: asset.evidence.map((entry) => ({
    ...structuredClone(entry),
    quote: entry.quote && normal(asset.content).includes(normal(entry.quote)) ? entry.quote : null,
  })),
});

// Existing versions stay immutable. Correct only excerpt metadata that was
// mistaken for a direct quotation; actual quotations still face source checks.
export const repairEvidence = (previous: Pack): Pack | undefined => {
  const content = structuredClone(previous.content);
  const changed: AssetName[] = [];
  for (const name of AssetName.options) {
    const original = previous.content.assets[name];
    const corrected = classifyEvidenceQuotes(original);
    if (JSON.stringify(corrected.evidence) !== JSON.stringify(original.evidence)) {
      content.assets[name] = { ...corrected, id: randomUUID() };
      changed.push(name);
    }
  }
  if (!changed.length) return;
  return {
    version: previous.version + 1,
    createdAt: new Date().toISOString(),
    content,
    changed,
    evidenceRepair: true,
    creatorRequest: previous.creatorRequest,
    brief: previous.brief,
  };
};

export const revise = (
  previous: Pack,
  name: AssetName,
  replacement: z.infer<typeof Asset>,
): Pack => {
  const content = structuredClone(previous.content);
  content.assets[name] = { ...replacement, id: randomUUID() };
  return {
    version: previous.version + 1,
    createdAt: new Date().toISOString(),
    content,
    changed: [name],
    creatorRequest: previous.creatorRequest,
    brief: previous.brief,
  };
};

export const findingId = (index: number) => `F${index + 1}`;

export const unresolvedFindings = (pack: Pack) =>
  (pack.review?.findings ?? []).filter(
    (finding, index) =>
      finding.severity === 'error' &&
      !pack.findingDecisions?.some((decision) => decision.findingId === findingId(index)),
  );

export const decideFinding = (
  project: Project,
  version: number,
  id: string,
  reason: string,
  sender: string,
  room: string,
) => {
  const pack = project.packs.at(-1);
  if (sender !== project.creatorId || room !== project.roomId || pack?.version !== version)
    throw Error('Finding decisions require the linked creator, correct room, and current version');
  if (project.approvals.some((a) => a.version === version))
    throw Error('An approved version cannot receive new review decisions');
  const index = Number(id.slice(1)) - 1;
  if (!/^F[1-9]\d*$/.test(id) || !pack.review?.findings[index])
    throw Error('Unknown review finding for this version');
  if (reason.trim().length < 8) throw Error('Explain the decision in at least 8 characters');
  if (!pack.findingDecisions?.some((d) => d.findingId === id))
    (pack.findingDecisions ??= []).push({
      findingId: id,
      reason: reason.trim(),
      creatorId: sender,
      at: new Date().toISOString(),
    });
};

// Replace only the timestamp block; never regenerate unrelated description prose.
export const reviseChapters = (previous: Pack, chapters: Content['chapters']): Pack => {
  const content = structuredClone(previous.content);
  content.chapters = structuredClone(chapters);
  const text = chapters.map((c) => `${timestamp(c.start)} ${c.title}`).join('\n');
  const old = content.assets.description;
  const block = /^(?:\d+:)?\d{1,2}:\d{2}[ \t]+[^\n]+(?:\n(?:\d+:)?\d{1,2}:\d{2}[ \t]+[^\n]+)*/m;
  const description = block.test(old.content)
    ? old.content.replace(block, () => text)
    : `${old.content.trimEnd()}\n\nChapters\n${text}`;
  content.assets.description = { ...old, id: randomUUID(), content: description };
  return {
    version: previous.version + 1,
    createdAt: new Date().toISOString(),
    content,
    changed: ['chapters', 'description'],
    creatorRequest: previous.creatorRequest,
    brief: previous.brief,
  };
};

export const approve = (
  project: Project,
  version: number,
  sender: string,
  room: string,
  messageId: string,
) => {
  const pack = project.packs.at(-1);
  if (sender !== project.creatorId || room !== project.roomId || !pack || pack.version !== version)
    throw Error('Approval requires linked creator, correct room, and current exact version');
  if (!pack.review || pack.checks?.some((x) => x.severity === 'error'))
    throw Error('Review and passing deterministic checks required');
  if (unresolvedFindings(pack).length)
    throw Error(
      'Resolve blocking reviewer findings before approval: fix F<number> v<number> or explicitly accept F<number> v<number> <reason>',
    );
  if (!project.approvals.some((a) => a.version === version))
    project.approvals.push({ version, creatorId: sender, messageId, at: new Date().toISOString() });
};

export const chapterText = (pack: Pack) => {
  return pack.content.chapters.map((c) => `${timestamp(c.start)} ${c.title}`).join('\n');
};

export const exportPack = (project: Project, version: number, format: string) => {
  const pack = project.packs.find((p) => p.version === version);
  if (!pack) throw Error('Version not found');
  const approved = project.approvals.some((a) => a.version === version);
  if (format === 'json')
    return JSON.stringify(
      { project: project.title, pack, approved, claimStatus: 'supported by transcript' },
      null,
      2,
    );
  if (format === 'chapters') {
    if (
      validatePack(project, pack.content).some(
        (i) => i.assetId === 'chapters' && i.severity === 'error',
      )
    )
      throw Error('Valid native chapter text unavailable for this video');
    return chapterText(pack);
  }
  return (
    `# ${project.title}\n\nVersion ${version} · ${approved ? 'Approved' : 'Draft'} · Supported by transcript\n\n## CreatorRoom navigation sections\n\n${chapterText(pack)}\n\n` +
    Object.entries(pack.content.assets)
      .map(
        ([name, a]) =>
          `## ${name}\n\n${a.content}\n\n### Evidence\n\n` +
          a.evidence
            .map(
              (e) =>
                `- ${e.claim}: ${e.segments
                  .map((id) => {
                    const s = project.segments.find((s) => s.id === id);
                    return project.videoId
                      ? `[${id}](https://www.youtube.com/watch?v=${project.videoId}&t=${Math.floor(s?.start ?? 0)}s)`
                      : id;
                  })
                  .join(', ')}`,
            )
            .join('\n'),
      )
      .join('\n\n')
  );
};
