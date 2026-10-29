import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('links each night to its digest with counts', async () => {
    const html = await (await createApp(config).request('/')).text();
    expect(html).toMatch(/<a href="\/digest\/2026-10-28">2026-10-28<\/a>[^]*?ok 10 · retry 4 · <span class="warn">fail 1<\/span>/);
    expect(html).toMatch(/<a href="\/digest\/2026-10-27">2026-10-27<\/a>[^]*?ok 7 · retry 0 · <span>fail 0<\/span>/);
    expect(html.indexOf('2026-10-28')).toBeLessThan(html.indexOf('2026-10-27'));
  });

  it('lists a night with no readable counts as —', async () => {
    const runsDir = mkdtempSync(join(tmpdir(), 'rig-'));
    mkdirSync(join(runsDir, '2026-10-26.jsonl'));
    const html = await (await createApp({ ...config, runsDir }).request('/')).text();
    expect(html).toContain('<a href="/digest/2026-10-26">2026-10-26</a>');
    expect(html).toContain('ok — · retry — · fail —');
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
