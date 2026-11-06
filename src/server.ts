import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dataDir, baseUrl, switchUrl } from './config.js';
import { Store } from './store.js';
import { parseTranscript, youtubeId, exportPack, type Project } from './domain.js';
import { Workflow } from './workflow.js';
import { SwitchClient, type Identity } from './switch.js';

const store = new Store();
const workflow = new Workflow(store);
const app = Fastify({
  logger: { level: 'warn', redact: ['req.headers.authorization', 'req.headers.cookie'] },
  bodyLimit: 2 * 1024 * 1024,
});
await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 10 } });
app.addHook('onRequest', async (req, reply) => {
  const origin = req.headers.origin;
  const allowed = new URL(baseUrl).origin;
  if (
    origin &&
    origin !== allowed &&
    origin !== 'http://localhost:5173' &&
    origin !== 'http://127.0.0.1:5173'
  )
    return reply.code(403).send({ error: 'Origin not allowed' });
  const host = req.headers.host?.split(':')[0];
  if (!['localhost', '127.0.0.1', 'creatorroom'].includes(host ?? ''))
    return reply.code(403).send({ error: 'Host not allowed' });
  reply
    .header('X-Content-Type-Options', 'nosniff')
    .header('Referrer-Policy', 'strict-origin-when-cross-origin');
});
app.setErrorHandler((error, req, reply) => {
  const safe = error instanceof Error ? error.message : 'Request failed';
  reply
    .code((error as any).statusCode ?? 400)
    .send({ error: safe.replace(/(?:sk-ant-|xoxb-|xapp-)[\w-]+/g, '[redacted]') });
});
app.get('/api/health', () => ({
  status: 'ok',
  database: store.db.open,
  workers: Object.fromEntries(
    Object.entries(workflow.clients).map(([name, c]) => [
      name,
      { connected: c.connected, stopped: c.stopped },
    ]),
  ),
}));
app.get('/api/ready', async (_request, reply) => {
  const clients = Object.values(workflow.clients);
  const workersReady = clients.length === 2 && clients.every((client) => client.connected);
  let switchReady = false;
  try {
    switchReady = (await fetch(switchUrl + '/health', { signal: AbortSignal.timeout(2000) })).ok;
  } catch {}
  const ready = store.db.open && workersReady && switchReady;
  return reply
    .code(ready ? 200 : 503)
    .send({ ready, database: store.db.open, workersReady, switchReady });
});

app.get('/api/status', async () => {
  let switchHealthy = false;
  try {
    switchHealthy = (await fetch(switchUrl + '/health', { signal: AbortSignal.timeout(2000) })).ok;
  } catch {}
  return {
    switchHealthy,
    modelConfigured: !!process.env.ANTHROPIC_API_KEY && !!process.env.ANTHROPIC_MODEL,
    model: process.env.ANTHROPIC_MODEL || null,
    roomId: store.state('demo:room') ?? null,
    creatorId: store.state('demo:creator') ?? null,
    slackUrl:
      process.env.SLACK_TEAM_ID && process.env.SLACK_CHANNEL_ID
        ? `https://app.slack.com/client/${process.env.SLACK_TEAM_ID}/${process.env.SLACK_CHANNEL_ID}`
        : null,
    workers: Object.fromEntries(
      Object.entries(workflow.clients).map(([n, c]) => [
        n,
        { connected: c.connected, stopped: c.stopped },
      ]),
    ),
    failedJobs: store.db.prepare("SELECT agent,status,error FROM jobs WHERE status='failed'").all(),
  };
});
app.get('/api/projects', () =>
  store.list().map((p) => ({
    id: p.id,
    title: p.title,
    fixture: p.fixture,
    version: p.packs.at(-1)?.version ?? 0,
  })),
);
app.get<{
  Params: {
    id: string;
  };
}>('/api/projects/:id', (req, reply) => {
  const p = store.get(req.params.id);
  return p ?? reply.code(404).send({ error: 'Project not found' });
});
app.post('/api/projects', async (req, reply) => {
  const values: Record<string, string> = {};
  let transcript = '',
    original: Buffer | undefined;
  for await (const part of req.parts()) {
    if (part.type === 'file') {
      if (!/\.(srt|vtt)$/i.test(part.filename)) throw Error('Upload an SRT or VTT file');
      original = await part.toBuffer();
      transcript = original.toString('utf8');
    } else values[part.fieldname] = String(part.value);
  }
  const parsed = z
    .object({
      title: z.string().min(1).max(200),
      url: z.string(),
      duration: z.coerce.number().positive().max(86400),
      profile: z.string().max(8000),
    })
    .parse(values);
  const roomId = store.state<string>('demo:room'),
    creatorId = store.state<string>('demo:creator');
  if (!roomId || !creatorId)
    throw Error('Link the Slack demo room and creator before importing a live project');
  const p: Project = {
    id: randomUUID(),
    title: parsed.title,
    videoId: youtubeId(parsed.url),
    duration: parsed.duration,
    profile: parsed.profile,
    roomId,
    creatorId,
    segments: parseTranscript(transcript, parsed.duration),
    packs: [],
    approvals: [],
    fixture: false,
  };
  mkdirSync(dataDir + '/uploads', { recursive: true, mode: 0o700 });
  writeFileSync(dataDir + '/uploads/' + p.id + '.txt', original!, { mode: 0o600 });
  store.save(p);
  return reply.code(201).send(p);
});
app.get<{
  Params: {
    id: string;
    version: string;
    format: string;
  };
}>('/api/projects/:id/exports/:version/:format', (req, reply) => {
  const p = store.get(req.params.id);
  if (!p) return reply.code(404).send({ error: 'Project not found' });
  const format = z.enum(['markdown', 'chapters', 'json']).parse(req.params.format);
  const version = z.coerce.number().int().positive().parse(req.params.version);
  const body = exportPack(p, version, format);
  const ext = format === 'json' ? 'json' : format === 'chapters' ? 'txt' : 'md';
  return reply
    .header('Content-Disposition', `attachment; filename="creatorroom-v${version}.${ext}"`)
    .type(format === 'json' ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8')
    .send(body);
});
if (existsSync(path.resolve('dist')))
  await app.register(staticFiles, { root: path.resolve('dist'), index: 'index.html' });

const startWorkers = async () => {
  const filename = process.env.AGENT_IDENTITIES_FILE || '.local/agents.json';
  const setupFile = process.env.ROOM_CONFIG_FILE || '.local/room.json';
  if (!existsSync(filename) || !existsSync(setupFile)) return;
  const identities = JSON.parse(readFileSync(filename, 'utf8')) as Record<string, Identity>;
  const setup = JSON.parse(readFileSync(setupFile, 'utf8'));
  store.set('demo:room', setup.roomId);
  store.set('demo:creator', setup.creatorId);
  for (const name of ['producer', 'reviewer']) {
    store.set('participant:' + name, setup[name + 'ParticipantId'] || identities[name].id);
    const c = new SwitchClient(name, identities[name], store, setup.roomId, (e) =>
      workflow.enqueue(name, e),
    );
    workflow.clients[name] = c;
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        await c.start();
        break;
      } catch {
        if (attempt === 5) {
          store.set(
            'worker:error:' + name,
            'Startup failed after six attempts; check Switch readiness and persisted identity',
          );
        } else {
          await new Promise((resolve) => setTimeout(resolve, Math.min(8000, 500 * 2 ** attempt)));
        }
      }
    }
  }
  workflow.start();
};

await startWorkers();
await app.listen({
  port: Number(process.env.APP_PORT || 4173),
  host: process.env.APP_HOST || '127.0.0.1',
});

const shutdown = async () => {
  workflow.stop();
  await app.close();
  store.db.close();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
