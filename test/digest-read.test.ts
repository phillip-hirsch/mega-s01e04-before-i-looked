import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function night(name: string, lines: string[]): string {
  writeFileSync(join(tmp, `${name}.jsonl`), lines.join('\n'));
  return name;
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  const n = readNight('runs', '2026-10-28');

  it('has 5 jobs sorted by job, and 1 bad line', () => {
    expect(n?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(n?.badLines).toBe(1);
    expect(n?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(n?.night).toBe('2026-10-28');
  });

  it('counts runs and retries, keeps the last error and the times as written', () => {
    const byJob = new Map(n?.rows.map((r) => [r.job, r]));
    expect(byJob.get('fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      fails: 0,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(byJob.get('lane/sync')).toMatchObject({
      runs: 8,
      retries: 1,
      lastError: 'lock held',
      firstAt: '2026-10-28T23:00:06+01:00',
      lastAt: '2026-10-29T05:00:04+01:00',
    });
    expect(byJob.get('notes/backup')).toMatchObject({ lastStatus: 'fail', fails: 1, lastError: 'quota exceeded' });
    expect(byJob.get('rig/rotate-logs')?.lastError).toBeNull();
  });

  it('keeps a row whose owner is null', () => {
    expect(n?.rows.find((r) => r.job === 'digest/render')?.owner).toBeNull();
  });
});

describe('readNight edge cases', () => {
  it('returns null for a missing file or a name that is not a night', () => {
    expect(readNight(tmp, '2001-01-01')).toBeNull();
    expect(readNight('runs', '../package')).toBeNull();
  });

  it('reads an empty file as an empty night', () => {
    expect(readNight(tmp, night('2026-01-01', []))).toEqual({
      night: '2026-01-01',
      rows: [],
      counts: { ok: 0, retry: 0, fail: 0 },
      badLines: 0,
    });
  });

  it('counts invalid lines as bad, skips blank lines, never throws', () => {
    const n = readNight(
      tmp,
      night('2026-01-02', [
        '{"at":"2026-01-02T01:00:00-05:00","job":"a","status":"ok","owner":"x"}',
        '',
        'not json',
        '[1,2]',
        '{"at":"2026-01-02T02:00:00-05:00","job":"a","status":"done","owner":"x"}',
        '{"at":"2026-01-02T02:00:00-05:00","job":"a","status":"ok"}',
        '{"at":"2026-01-02T02:00:00-05:00","job":"a","status":"ok","owner":"x","error":5}',
        '',
      ]),
    );
    expect(n?.badLines).toBe(5);
    expect(n?.rows).toHaveLength(1);
    expect(n?.rows[0]?.firstAt).toBe('2026-01-02T01:00:00-05:00');
  });
});
