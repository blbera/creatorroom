import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

test('real multipart imports return actionable errors and save only valid projects', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'creatorroom-import-'));
  const db = new Database(path.join(directory, 'creatorroom.sqlite'));
  db.exec('CREATE TABLE state(key TEXT PRIMARY KEY, body TEXT NOT NULL)');
  const insert = db.prepare('INSERT INTO state VALUES(?,?)');
  insert.run('demo:room', JSON.stringify('isolated-room'));
  insert.run('demo:creator', JSON.stringify('isolated-creator'));
  db.close();

  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: directory,
      APP_HOST: '127.0.0.1',
      APP_PORT: String(port),
      APP_BASE_URL: base,
      ANTHROPIC_API_KEY: 'isolated-test-no-model-calls',
      AGENT_IDENTITIES_FILE: path.join(directory, 'no-agents.json'),
      ROOM_CONFIG_FILE: path.join(directory, 'no-room.json'),
    },
    stdio: 'ignore',
  });

  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw Error('Isolated import server exited before startup');
      try {
        ready = (await fetch(base + '/api/health')).ok;
      } catch {}
      if (ready) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'Isolated import server should start');
    const upload = async (transcript: string, duration: number, filename: string) => {
      const form = new FormData();
      form.set('title', 'Original import test');
      form.set('url', 'https://www.youtube.com/watch?v=abcdefghijk');
      form.set('duration', String(duration));
      form.set('profile', 'Clear and practical.');
      form.set('transcript', new Blob([transcript]), filename);
      return fetch(base + '/api/projects', { method: 'POST', body: form });
    };

    const rejected = await upload(
      'WEBVTT\n\n00:03:06.640 --> 00:03:09.280\nAn original closing line.',
      187,
      'original.vtt',
    );
    assert.equal(rejected.status, 400);
    assert.match((await rejected.json()).error, /189\.28 seconds.*187-second/);
    assert.deepEqual(await (await fetch(base + '/api/projects')).json(), []);

    const original = readFileSync('fixtures/original.srt', 'utf8');
    const saved = await upload(original, 60, 'original.srt');
    assert.equal(saved.status, 201);
    const project = await saved.json();
    assert.equal(project.segments.length, 3);
    assert.deepEqual(project.packs, []);
    assert.equal(project.roomId, 'isolated-room');
    assert.equal(
      readFileSync(path.join(directory, 'uploads', project.id + '.txt'), 'utf8'),
      original,
    );
    const listed = await (await fetch(base + '/api/projects')).json();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, project.id);
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      const exited = once(server, 'exit');
      server.kill('SIGTERM');
      await exited;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
