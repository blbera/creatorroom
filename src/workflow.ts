import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  Angles,
  Asset,
  AssetName,
  PackContent,
  Review,
  approve,
  revise,
  validatePack,
  classifyEvidenceQuotes,
  repairEvidence,
  reviseChapters,
  decideFinding,
  findingId,
  type Project,
  type Pack,
} from './domain.js';
import { Store, type Job } from './store.js';
import { model } from './model.js';
import { SwitchClient, type SwitchEvent } from './switch.js';
import { baseUrl } from './config.js';

export class Workflow {
  clients: Record<string, SwitchClient> = {};
  running = false;
  timer?: NodeJS.Timeout;

  constructor(
    public store: Store,
    public generate = model,
  ) {}

  enqueue = (name: string, event: SwitchEvent) => {
    this.store.enqueue(name, event.room_id, event);
  };

  tick = async () => {
    if (this.running) return;
    this.running = true;
    try {
      const job = this.store.db
        .prepare("SELECT * FROM jobs WHERE status='pending' AND next_at<=? ORDER BY rowid LIMIT 1")
        .get(Date.now()) as Job | undefined;
      if (!job) return;
      const client = this.clients[job.agent];
      if (!client?.connected) return;
      this.store.db
        .prepare("UPDATE jobs SET status='running',attempts=attempts+1 WHERE id=?")
        .run(job.id);
      try {
        await this.process(job, client);
        this.store.db.prepare("UPDATE jobs SET status='done',error=NULL WHERE id=?").run(job.id);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Workflow failed';
        const status = (
          error as {
            status?: number;
          }
        ).status;
        const terminal =
          job.attempts >= 2 ||
          message.includes('reconciliation') ||
          !!(status && status >= 400 && status < 500 && status !== 429);
        this.store.db
          .prepare('UPDATE jobs SET status=?,error=?,next_at=? WHERE id=?')
          .run(
            terminal ? 'failed' : 'pending',
            message.replace(/(?:sk-ant-|xoxb-|xapp-)[\w-]+/g, '[redacted]'),
            Date.now() + 2000 * 2 ** job.attempts,
            job.id,
          );
      }
    } finally {
      this.running = false;
    }
  };

  start = () => {
    this.timer = setInterval(() => void this.tick(), 500);
  };

  stop = () => {
    clearInterval(this.timer);
    for (const c of Object.values(this.clients)) c.stop();
  };

  process = async (job: Job, client: SwitchClient) => {
    const e = JSON.parse(job.event) as SwitchEvent;
    const text = e.payload.body.replace(/@(?:producer|reviewer)\b/gi, '').trim();

    const send = (body: string, suffix = 'reply') =>
      this.store.effect(job.id + ':' + suffix, () => client.op('post_message', { body }));

    const projectId = text.match(/\bproject\s+([\w-]+)/i)?.[1];
    const candidates = this.store.list().filter((p) => p.roomId === job.room && !p.fixture);
    const p = projectId
      ? this.store.get(projectId)
      : candidates.length === 1
        ? candidates[0]
        : undefined;
    if (/^ping\b/i.test(text)) {
      await send(
        `${client.name === 'producer' ? 'Producer' : 'Reviewer'} is connected through Switch.`,
      );
      if (job.agent === 'producer')
        await this.store.effect(job.id + ':handoff', () =>
          client.op('send_targeted_message', { body: 'ping', target_names: ['reviewer'] }),
        );
      return;
    }
    if (!p || p.roomId !== job.room) {
      await send(
        'Create a project in CreatorRoom, then include project <id> in your brief. No unique live project is associated with this room.',
      );
      return;
    }
    const link = `${baseUrl}/?project=${p.id}`;
    const source = {
      title: p.title,
      duration: p.duration,
      profile: p.profile,
      creatorRequest: p.creatorRequest,
      creatorConfirmedTerminology: p.glossary ?? [],
      segments: p.segments,
    };
    if (job.agent === 'reviewer') {
      // Only the Producer identity can trigger pack review; the backend never invokes this branch directly.
      const producer = this.clients.producer;
      const match = text.match(/\breview\s+project\s+[\w-]+\s+v(\d+)\b/i);
      const producerSender = this.store.state<string>('participant:producer');
      if (!match || !producer || !producerSender || e.payload.sender !== producerSender) {
        await send('Reviewer accepts a version-specific review handoff from Producer.');
        return;
      }
      const version = Number(match[1]),
        pack = p.packs.find((v) => v.version === version);
      if (!pack) throw Error('Requested pack version missing');
      const review = pack.review
        ? structuredClone(pack.review)
        : await this.cachedModel(
            job.id + ':review',
            Review,
            'Review the ORIGINAL transcript against this pack. Return zero findings when no issues exist. Check unsupported claims, exaggerated wording, contradictions, direct quotes, source references, and plausible chapter boundaries. Each finding needs assetId, severity, source segments, explanation, suggestion. Review ALL assets, including unchanged assets, so an earlier blocking issue cannot disappear when a different asset is revised. Chapter checks remain deterministic. Creator-confirmed terminology is an explicit correction layer; original transcript remains unchanged. Use only the supplied asset IDs or chapters for assetId.',
            {
              ...source,
              pack: pack.content,
              changed: pack.changed,
              originalFindingToRecheck: pack.fixesFinding,
            },
          );
      const validIds = new Set(p.segments.map((s) => s.id));
      if (review.findings.some((f) => f.segments.some((id) => !validIds.has(id))))
        throw Error('Reviewer returned unknown source IDs');
      const assetIds = new Set([
        'chapters',
        ...Object.values(pack.content.assets).map((a) => a.id),
      ]);
      for (const finding of review.findings) {
        const name = AssetName.safeParse(finding.assetId);
        if (name.success) finding.assetId = pack.content.assets[name.data].id;
        if (!assetIds.has(finding.assetId)) throw Error('Reviewer returned unknown asset ID');
      }
      // An unresolved error on unchanged content must not vanish because a new model pass omitted it.
      if (!pack.review) {
        const previous = p.packs.find((item) => item.version === version - 1);
        const unchanged = new Map<string, string>();
        if (previous) {
          for (const name of Object.keys(pack.content.assets) as AssetName[])
            if (
              JSON.stringify(previous.content.assets[name]) ===
                JSON.stringify(pack.content.assets[name]) ||
              (pack.evidenceRepair &&
                previous.content.assets[name].content === pack.content.assets[name].content)
            )
              unchanged.set(previous.content.assets[name].id, pack.content.assets[name].id);
          if (JSON.stringify(previous.content.chapters) === JSON.stringify(pack.content.chapters))
            unchanged.set('chapters', 'chapters');
          for (const finding of previous.review?.findings ?? [])
            if (
              finding.severity === 'error' &&
              unchanged.has(finding.assetId) &&
              !review.findings.some(
                (item) =>
                  item.assetId === unchanged.get(finding.assetId) &&
                  item.explanation === finding.explanation,
              )
            )
              review.findings.push({
                ...structuredClone(finding),
                assetId: unchanged.get(finding.assetId)!,
              });
        }
      }
      const fresh = this.store.get(p.id)!;
      const target = fresh.packs.find((v) => v.version === version)!;
      target.review ??= review;
      target.checks = validatePack(fresh, target.content);
      this.record(
        fresh,
        job,
        'review',
        'Reviewer',
        `Reviewed v${version}: ${target.review.findings.length} finding(s), ${target.checks.length} validation issue(s)`,
        version,
      );
      await this.document(
        client,
        p,
        JSON.stringify({ version, review: target.review, checks: target.checks }),
        'review',
      );
      await send(
        `Reviewed ${p.title} v${version}: ${target.review.findings.length} model finding(s), ${target.checks.length} deterministic finding(s). Supported by transcript; not independently fact-checked. ${link}` +
          target.review.findings
            .map(
              (finding, index) =>
                `\n${findingId(index)} · ${finding.severity}: ${finding.explanation}\nSuggested: ${finding.suggestion}`,
            )
            .join('') +
          (target.review.findings.length
            ? `\nFix: @producer project ${p.id} fix F1 v${version}. Explicit creator decision: @producer project ${p.id} accept F1 v${version} <reason>.`
            : ''),
      );
      return;
    }
    const evidenceRepair = text.match(/^repair-evidence project [\w-]+ v([1-9]\d*)$/i);
    if (evidenceRepair && e.payload.sender === this.store.state<string>('participant:reviewer')) {
      const version = Number(evidenceRepair[1]);
      const previous = p.packs.at(-1);
      const authorization = 'repair-authorized:' + p.id + ':' + version;
      if (!previous || previous.version !== version || !this.store.state<boolean>(authorization)) {
        await send('Evidence repair requires current-version creator authorization.');
        return;
      }
      const asset = classifyEvidenceQuotes(previous.content.assets.description);
      const pack = revise(previous, 'description', asset);
      pack.evidenceRepair = true;
      pack.checks = validatePack(p, pack.content);
      p.packs.push(pack);
      this.store.save(p);
      this.store.set(authorization, false);
      await this.document(
        client,
        p,
        JSON.stringify({ brief: p.brief, version: pack.version, pack: pack.content }),
        'brief',
      );
      await send(
        `Saved v${pack.version}: description evidence now distinguishes paraphrases from direct quotes. Other assets and chapter navigation are unchanged. ${link}`,
      );
      await this.store.effect(job.id + ':handoff', () =>
        client.op('send_targeted_message', {
          body: `review project ${p.id} v${pack.version}`,
          target_names: ['reviewer'],
        }),
      );
      return;
    }

    const repair = text.match(/^repair project [\w-]+ v([1-9]\d*)$/i);
    if (repair && e.payload.sender === this.store.state<string>('participant:reviewer')) {
      const version = Number(repair[1]);
      const previous = p.packs.at(-1);
      const authorization = 'repair-authorized:' + p.id + ':' + version;
      if (!previous || previous.version !== version || !this.store.state<boolean>(authorization)) {
        await send('Repair requires a current-version local creator authorization.');
        return;
      }
      const assetsSchema = PackContent.pick({ assets: true });
      const replacement = await this.cachedModel(
        job.id + ':repair',
        assetsSchema,
        'Repair the four affected content assets using ONLY transcript evidence. Keep the chosen angle. Remove unsupported claims about scalability, production readiness, lack of context windows, and universal architecture conclusions. Do not invent or silently correct proper names from outside the transcript. Use quote:null for paraphrased evidence; quote is ONLY a verbatim direct quote actually present in the output asset and exactly matching cited source text. Supporting excerpts need not be quoted: provide the substantive claim and accurate source segment IDs. Source is rolling captions, so phrases may repeat across segments; never fabricate stitched verbatim quotes. Correct all citation mismatches, including the review findings. Every substantive paragraph/post must have evidence. X: exactly 5 posts separated by blank lines, each at most 240 Unicode characters to leave headroom. Description must include summary and the provided chapter text. LinkedIn 150–250 words, newsletter 250–400 words. Supply temporary asset IDs.',
        {
          ...source,
          brief: p.brief,
          previous: previous.content,
          review: previous.review,
          checks: previous.checks,
          chapterText: previous.content.chapters
            .map(
              (c) =>
                `${Math.floor(c.start / 60)
                  .toString()
                  .padStart(2, '0')}:${Math.floor(c.start % 60)
                  .toString()
                  .padStart(2, '0')} ${c.title}`,
            )
            .join('\n'),
        },
      );
      const pack: Pack = {
        version: version + 1,
        createdAt: new Date().toISOString(),
        changed: ['description', 'x', 'linkedin', 'newsletter'],
        content: {
          chapters: structuredClone(previous.content.chapters),
          assets: replacement.assets,
        },
      };
      for (const name of AssetName.options) {
        pack.content.assets[name] = classifyEvidenceQuotes(pack.content.assets[name]);
        pack.content.assets[name].id = randomUUID();
      }
      pack.checks = validatePack(p, pack.content);
      p.packs.push(pack);
      this.store.save(p);
      this.store.set(authorization, false);
      await this.document(
        client,
        p,
        JSON.stringify({ brief: p.brief, version: pack.version, pack: pack.content }),
        'brief',
      );
      await send(
        `Saved repaired v${pack.version}; preserved v${version} and unchanged section navigation. Requested by the creator in local setup, routed through Switch. Review follows. ${link}`,
      );
      await this.store.effect(job.id + ':handoff', () =>
        client.op('send_targeted_message', {
          body: `review project ${p.id} v${pack.version}`,
          target_names: ['reviewer'],
        }),
      );
      return;
    }
    if (e.payload.sender !== p.creatorId) {
      await send(
        'Only the linked creator can brief, choose angles, revise, or approve this project.',
      );
      return;
    }
    const command = text.replace(/^project\s+[\w-]+\s+/i, '');
    const savedVersion = this.store.state<number>(job.id + ':saved-version');
    if (savedVersion) {
      const saved = p.packs.find((v) => v.version === savedVersion);
      if (!saved) throw Error('Saved workflow version missing; reconciliation required');
      await this.finishPack(job, client, p, saved);
      return;
    }
    if (/^help$/i.test(command)) {
      await send(
        'Commands: brief <direction>; angle 1|2; revise <description|x|linkedin|newsletter> <request>; revise chapters <request>; repair evidence; fix F1 v<number>; accept F1 v<number> <reason>; glossary "original" => "preferred"; approve v<number>. For multiple projects prefix project <id>.',
      );
      return;
    }
    if (/^repair evidence$/i.test(command)) {
      const previous = p.packs.at(-1);
      if (!previous?.review) {
        await send('Generate a pack and wait for review first.');
        return;
      }
      const next = repairEvidence(previous);
      if (!next) {
        await send(
          'No paraphrase quote metadata needs correction. Actual quotation mismatches and other validation errors still require a content revision.',
        );
        return;
      }
      await this.finishPack(
        job,
        client,
        p,
        next,
        'Correct paraphrase quote metadata across the pack; preserve all wording, chapters, claims and source references.',
      );
      return;
    }
    const glossary = command.match(/^glossary "([^"\n]{1,100})"\s*=>\s*"([^"\n]{1,100})"$/i);
    if (glossary) {
      if (p.glossary?.some((g) => g.from === glossary[1] && g.to === glossary[2])) {
        await send('That creator-confirmed terminology is already saved.');
        return;
      }
      p.glossary = (p.glossary ?? []).filter((g) => g.from !== glossary[1]);
      p.glossary.push({
        from: glossary[1],
        to: glossary[2],
        creatorId: e.payload.sender,
        at: new Date().toISOString(),
      });
      this.record(
        p,
        job,
        'glossary',
        'Creator',
        `Confirmed terminology: ${glossary[1]} → ${glossary[2]}`,
      );
      await send(
        'Terminology saved for this project. Original transcript and existing packs are unchanged. Request an asset revision to apply it; direct quotes must still match the original source.',
      );
      return;
    }
    const decision = command.match(/^accept (F[1-9]\d*) v([1-9]\d*)\s+(.+)$/is);
    if (decision) {
      try {
        decideFinding(
          p,
          Number(decision[2]),
          decision[1].toUpperCase(),
          decision[3],
          e.payload.sender,
          job.room,
        );
        this.record(
          p,
          job,
          'decision',
          'Creator',
          `Accepted ${decision[1].toUpperCase()} with reason: ${decision[3]}`,
          Number(decision[2]),
        );
        await send(
          `Decision recorded for ${decision[1].toUpperCase()} v${decision[2]}. This does not approve the pack or waive deterministic errors. ${link}`,
        );
      } catch (error) {
        await send((error as Error).message);
      }
      return;
    }
    const fix = command.match(/^fix (F[1-9]\d*) v([1-9]\d*)(?:\s+(.+))?$/is);
    const chapterRequest = command.match(/^revise chapters\s+(.+)$/is);
    if (fix || chapterRequest) {
      const previous = p.packs.at(-1);
      if (!previous || !previous.review) {
        await send('Generate a pack and wait for review first.');
        return;
      }
      let request = chapterRequest?.[1] ?? '';
      let assetName: AssetName | 'chapters' = 'chapters';
      let finding: z.infer<typeof Review>['findings'][number] | undefined;
      if (fix) {
        if (previous.version !== Number(fix[2])) {
          await send('Finding fixes must name the current reviewed version.');
          return;
        }
        finding = previous.review.findings[Number(fix[1].slice(1)) - 1];
        if (!finding) {
          await send('Unknown finding for this version.');
          return;
        }
        const entry = Object.entries(previous.content.assets).find(
          ([, a]) => a.id === finding!.assetId,
        );
        if (finding.assetId !== 'chapters' && !entry) {
          await send('Finding does not identify a revisable asset.');
          return;
        }
        assetName = entry ? AssetName.parse(entry[0]) : 'chapters';
        request = `Resolve this finding: ${finding.explanation}. Suggested correction: ${finding.suggestion}. Creator direction: ${fix[3] ?? 'Keep unrelated content unchanged.'}`;
      }
      let next: Pack;
      if (assetName === 'chapters') {
        const result = await this.cachedModel(
          job.id + ':chapters',
          PackContent.pick({ chapters: true }),
          'Revise ONLY navigation chapters according to creator direction. Cite real segment IDs. Preserve unaffected sections where possible. First start 0, starts ascending, at least three sections and each at least ten seconds including last. Use original timing. Creator-confirmed terminology may be used in titles.',
          { ...source, brief: p.brief, chapters: previous.content.chapters, request },
        );
        next = reviseChapters(previous, result.chapters);
        const errors = validatePack(p, next.content).filter(
          (issue) => issue.assetId === 'chapters' && issue.severity === 'error',
        );
        if (errors.length) {
          await send(
            'Chapter edit was not saved: ' +
              errors.map((i) => i.explanation).join('; ') +
              '. Try a different boundary.',
          );
          return;
        }
      } else {
        const asset = await this.cachedModel(
          job.id + ':finding-fix',
          Asset,
          'Fix ONLY the named asset using the original transcript and specific review finding. Preserve unrelated content within that asset where possible. Direct quotes must remain verbatim; use quote:null for paraphrases. Obey format limits (X 5–7 posts <=270 characters, LinkedIn 150–250 words, newsletter 250–400). Apply creator-confirmed terminology outside verbatim quotes.',
          {
            ...source,
            brief: p.brief,
            asset: assetName,
            previous: previous.content.assets[assetName],
            finding,
            request,
          },
        );
        next = revise(previous, assetName, asset);
      }
      if (fix && finding)
        next.fixesFinding = {
          version: previous.version,
          findingId: fix[1].toUpperCase(),
          explanation: finding.explanation,
        };
      await this.finishPack(job, client, p, next, request);
      return;
    }
    if (/^(?:fix|accept|glossary|revise chapters)\b/i.test(command)) {
      await send(
        'Use: fix F1 v<number>; accept F1 v<number> <reason>; glossary "original" => "preferred"; revise chapters <request>.',
      );
      return;
    }
    if (/^approve\b/i.test(command)) {
      const exact = text.match(/^(?:project\s+[\w-]+\s+)?approve v([1-9]\d*)$/i);
      if (!exact) {
        await send(
          'Use the exact command: @producer approve v<number>. Approval must name the current version.',
        );
        return;
      }
      try {
        approve(p, Number(exact[1]), e.payload.sender, job.room, e.payload.message_id);
        this.record(
          p,
          job,
          'approval',
          'Creator',
          `Approved exact version v${exact[1]}`,
          Number(exact[1]),
        );
        await send(
          `Creator approved v${exact[1]}. Approval applies only to that immutable version. ${link}`,
        );
      } catch (err) {
        await send((err as Error).message);
      }
      return;
    }
    const revision = text.match(
      /^(?:project\s+[\w-]+\s+)?revise\s+(description|x|linkedin|newsletter)\s+(.+)$/is,
    );
    let pack: Pack | undefined;
    if (revision) {
      const previous = p.packs.at(-1);
      if (!previous) {
        await send('Choose an angle and generate a pack first.');
        return;
      }
      const name = AssetName.parse(revision[1]);
      const replacement = await this.cachedModel(
        job.id + ':revision',
        Asset,
        'Revise only the requested asset using source evidence. Preserve the creative brief; obey creator revision, avoid prohibited phrases. For paraphrased evidence use quote:null. Only put text in quote if it is a verbatim direct quote present in the asset and exactly matching the cited source. Remove unsupported hype. Apply creator-confirmed terminology outside verbatim quotes. Supply a temporary id, content, evidence. X: 5–7 posts separated by blank lines, each <=270 characters. LinkedIn:150–250 words. Newsletter:250–400 words.',
        {
          ...source,
          brief: p.brief,
          asset: name,
          previous: previous.content.assets[name],
          request: revision[2],
        },
      );
      pack = revise(previous, name, replacement);
    } else if (/^(?:project\s+[\w-]+\s+)?angle\s+[12]$/i.test(text)) {
      if (!p.angles) {
        await send('Ask Producer to brief the project first.');
        return;
      }
      if (p.packs.length) {
        await send('A pack already exists. Use revise <asset> <request> for selective revisions.');
        return;
      }
      const n = Number(text.match(/angle\s+([12])/i)![1]) - 1;
      p.brief = JSON.stringify(p.angles[n]);
      this.record(p, job, 'angle', 'Creator', `Chose angle ${n + 1}: ${p.angles[n].title}`);
      const content = await this.cachedModel(
        job.id + ':pack',
        PackContent,
        'Generate a content pack for the chosen brief. Chapters start at 0, ascending, >=10 seconds each including final chapter, >=3 if video allows. Each chapter cites source segments. Description contains summary and chapter text. X:5–7 posts separated by blank lines, each <=270 characters. LinkedIn:150–250 words. Newsletter:250–400 words. Every asset includes evidence mapping substantive claims and any quotes to original segment IDs. Use quote:null for paraphrases. Only populate quote for an exact direct quote also present in the asset; source excerpts alone are not direct quotes. Apply creator-confirmed terminology outside verbatim quotes. Respect the creatorRequest as editorial direction while retaining source grounding. Avoid unsupported scalability or production-readiness claims. Do not fabricate native chapter eligibility. Give each asset a distinct id.',
        { ...source, brief: p.brief },
      );
      for (const a of Object.values(content.assets)) a.id = randomUUID();
      pack = { version: 1, createdAt: new Date().toISOString(), content, changed: ['all'] };
    } else {
      if (p.packs.length) {
        await send(
          `Current pack v${p.packs.at(-1)!.version}. Use revise <asset> <request> or approve v<number>. ${link}`,
        );
        return;
      }
      const direction = command.replace(/^brief\b\s*/i, '').trim();
      if (direction) p.creatorRequest = direction;
      this.record(
        p,
        job,
        'brief',
        'Creator',
        p.creatorRequest
          ? `Brief: ${p.creatorRequest}`
          : 'Requested creative angles using the saved creator profile',
      );
      const angles = await this.cachedModel(
        job.id + ':angles',
        Angles,
        'Propose exactly two distinct evidence-grounded creative angles for this creator. Cite original segment IDs. Use creatorRequest to shape the proposed angles. Apply creator-confirmed terminology. Do not generate the pack yet.',
        { ...source, creatorRequest: p.creatorRequest },
      );
      const ids = new Set(p.segments.map((s) => s.id));
      if (angles.angles.some((a) => a.segments.some((id) => !ids.has(id))))
        throw Error('Angle cites unknown source');
      p.angles = angles.angles;
      this.record(
        p,
        job,
        'angles-proposed',
        'Producer',
        'Proposed two source-grounded creative angles',
      );
      await this.document(
        client,
        p,
        JSON.stringify({ creatorRequest: p.creatorRequest, angles: p.angles }),
        'brief',
      );
      await send(
        angles.angles
          .map((a, i) => `${i + 1}. ${a.title}\n${a.rationale}\nSources: ${a.segments.join(', ')}`)
          .join('\n\n') + '\nChoose: @producer angle 1 or @producer angle 2.',
      );
      return;
    }
    await this.finishPack(job, client, p, pack, revision?.[2]);
  };

  record = (
    p: Project,
    job: Job,
    kind: string,
    actor: 'Creator' | 'Producer' | 'Reviewer',
    label: string,
    version?: number,
  ) => {
    const id = job.id + ':' + kind;
    if (!(p.history ??= []).some((event) => event.id === id))
      p.history.push({
        id,
        actor,
        label,
        version,
        at: new Date().toISOString(),
        messageId: (JSON.parse(job.event) as SwitchEvent).payload.message_id,
      });
    this.store.save(p);
  };

  finishPack = async (job: Job, client: SwitchClient, p: Project, pack: Pack, request?: string) => {
    const fresh = this.store.get(p.id)!;
    this.store.db.transaction(() => {
      if (!fresh.packs.some((v) => v.version === pack.version)) {
        const changed = new Set<string>(pack.changed);
        for (const name of AssetName.options)
          if (changed.has('all') || changed.has(name))
            pack.content.assets[name] = classifyEvidenceQuotes(pack.content.assets[name]);
        pack.creatorRequest = p.creatorRequest;
        pack.brief = p.brief;
        pack.checks = validatePack(fresh, pack.content);
        fresh.packs.push(pack);
      }
      this.store.set(job.id + ':saved-version', pack.version);
      if (request) this.record(fresh, job, 'revision-request', 'Creator', request, pack.version);
      this.record(
        fresh,
        job,
        'saved',
        'Producer',
        `Saved v${pack.version} · changed ${pack.changed.join(', ')}`,
        pack.version,
      );
    })();
    await this.document(
      client,
      fresh,
      JSON.stringify({
        creatorRequest: p.creatorRequest,
        brief: p.brief,
        version: pack.version,
        pack: pack.content,
      }),
      'brief',
    );
    await this.store.effect(job.id + ':reply', () =>
      client.op('post_message', {
        body: `Saved ${fresh.title} v${pack.version}. Changed: ${pack.changed.join(', ')}. Review requested through Switch. ${baseUrl}/?project=${p.id}`,
      }),
    );
    await this.store.effect(job.id + ':handoff', () =>
      client.op('send_targeted_message', {
        body: `review project ${p.id} v${pack.version}`,
        target_names: ['reviewer'],
      }),
    );
    this.record(
      fresh,
      job,
      'handoff',
      'Producer',
      `Sent v${pack.version} to Reviewer through Switch`,
      pack.version,
    );
  };

  cachedModel = async <T extends z.ZodType>(
    key: string,
    schema: T,
    task: string,
    data: unknown,
  ): Promise<z.infer<T>> => {
    const prior = this.store.state<unknown>(key);
    if (prior) return schema.parse(prior);
    const value = await this.generate(schema, task, data);
    this.store.set(key, value);
    return value;
  };

  document = async (client: SwitchClient, p: Project, content: string, kind: string) => {
    const key = `document:${client.name}:${p.id}:${kind}`;
    let id = this.store.state<string>(key);
    if (!id) {
      const result = await client.op<{
        document_id: string;
      }>('create_room_document', {
        name: `creatorroom-${p.id}-${kind}`,
        description: 'CreatorRoom ' + kind,
        instructions:
          'Source artifacts are available to both local workers through the application store. These are transcript-supported drafts. See the separate human-readable app link in Slack.',
        content,
      });
      id = result.document_id;
      this.store.set(key, id);
    } else await client.op('update_room_document', { document_id: id, content });
  };
}
