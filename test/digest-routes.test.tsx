import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error !== undefined && { error }) });

// Jobs are written out of order so the sort by job is exercised.
const FULL = [
  line('2026-10-28T01:00:00+01:00', 'zeta-ok', 'ok', 'ana'),
  line('2026-10-28T01:05:00+01:00', 'alpha-flaky', 'retry', 'ben', 'timeout'),
  line('2026-10-28T01:10:00+01:00', 'alpha-flaky', 'retry', 'ben'),
  line('2026-10-28T01:15:00+01:00', 'alpha-flaky', 'retry', 'ben'),
  line('2026-10-28T01:20:00+01:00', 'alpha-flaky', 'ok', 'ben'),
  line('2026-10-28T02:00:00+01:00', 'mid-broken', 'fail', null),
].join('\n');

const NIGHTS = {
  '2026-01-01': `${FULL}\n`,
  '2026-01-02': '',
  '2026-01-03': `${FULL}\nnot json\n`,
  '2026-01-04': [
    line('2026-10-28T03:00:00+01:00', 'recovered', 'fail', 'cy', 'disk full'),
    line('2026-10-28T03:05:00+01:00', 'recovered', 'ok', 'cy'),
  ].join('\n'),
};

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  for (const [night, text] of Object.entries(NIGHTS)) writeFileSync(join(runsDir, `${night}.jsonl`), text);
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
});

afterAll(() => rmSync(runsDir, { recursive: true, force: true }));

// The chunk of the page's HTML that starts at the <tr> holding `job`.
function rowOf(html: string, job: string): string {
  const chunk = html.split('<tr').find((c) => c.includes(job));
  if (chunk === undefined) throw new Error(`no row for ${job}`);
  return chunk;
}

describe('GET /digest/:night', () => {
  it('renders the rows sorted by job, marking retries >= 3 and fails', async () => {
    const res = await app.request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html.indexOf('alpha-flaky')).toBeLessThan(html.indexOf('mid-broken'));
    expect(html.indexOf('mid-broken')).toBeLessThan(html.indexOf('zeta-ok'));
    expect(rowOf(html, 'alpha-flaky')).toMatch(/class="[^"]*\bwarn\b/);
    expect(rowOf(html, 'mid-broken')).toMatch(/class="[^"]*\bwarn\b/);
    expect(rowOf(html, 'zeta-ok')).not.toMatch(/\bwarn\b/);
    expect(html).not.toMatch(/could not be read/);
  });

  it('marks a job that failed even when its last run was ok', async () => {
    const html = await (await app.request('/digest/2026-01-04')).text();
    expect(rowOf(html, 'recovered')).toMatch(/class="[^"]*\bwarn\b/);
  });

  it('renders a missing owner and last error as —', async () => {
    const html = await (await app.request('/digest/2026-01-01')).text();
    expect(rowOf(html, 'mid-broken').match(/—/g)).toHaveLength(2);
  });

  it('notes a line that could not be read', async () => {
    const res = await app.request('/digest/2026-01-03');
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/could not be read/);
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-01-09');
    expect(res.status).toBe(404);
  });

  it('says nothing ran for an empty file', async () => {
    const res = await app.request('/digest/2026-01-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the Night from readNight', async () => {
    const res = await app.request('/api/digest/2026-01-01');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(readNight(runsDir, '2026-01-01'));
  });

  it('counts a bad line instead of failing', async () => {
    const res = await app.request('/api/digest/2026-01-03');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ night: '2026-01-03', badLines: 1 });
  });

  it('answers 404 with the night for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-01-09');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: '2026-01-09' });
  });

  it('returns no rows for an empty file', async () => {
    const res = await app.request('/api/digest/2026-01-02');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ rows: [] });
  });
});

describe('page and JSON', () => {
  it('list the same jobs in the same order', async () => {
    const html = await (await app.request('/digest/2026-01-01')).text();
    const { rows } = (await (await app.request('/api/digest/2026-01-01')).json()) as {
      rows: { job: string }[];
    };
    const jobs = rows.map((r) => r.job);
    expect(jobs).toHaveLength(3);
    const inPage = [...jobs].sort((a, b) => html.indexOf(a) - html.indexOf(b));
    expect(inPage).toEqual(jobs);
  });
});
