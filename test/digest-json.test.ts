import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read.js';
import type { Night } from '../src/digest/types.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('GET /api/digest/:night', () => {
  it('returns exactly the Night that readNight reads', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-28');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body).toEqual(readNight('runs', '2026-10-28'));
    expect(body.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(body.badLines).toBe(1);
  });

  it('404s with the night when there is no run log', async () => {
    const res = await createApp(config).request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: '2026-01-01' });
  });
});
