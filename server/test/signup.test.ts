/** Open sign-up: the registry's caps on new teams per network address and per day. */
import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { TEAMS_PER_ADDRESS_PER_DAY, TEAMS_PER_DAY } from '../src/registry';
import { call } from './helpers';

const body = { teamName: 'Lakeside Middle School', level: 'MS', memberName: 'Ana', pin: '2468' };
const create = (ip: string) => call('/api/teams', { body, headers: { 'CF-Connecting-IP': ip } });
const registry = () => env.REGISTRY.get(env.REGISTRY.idFromName('global'));
const today = () => new Date().toISOString().slice(0, 10);

describe('open sign-up', () => {
  it('caps new teams per network address per day', async () => {
    for (let i = 0; i < TEAMS_PER_ADDRESS_PER_DAY; i++) expect((await create('203.0.113.9')).status).toBe(201);
    const refused = await create('203.0.113.9');
    expect(refused.status).toBe(429);
    expect(refused.body.error).toBe(`${TEAMS_PER_ADDRESS_PER_DAY} teams were already created from this network today. Try again tomorrow, or join an existing team with its join link.`);
    expect(Number(refused.headers.get('Retry-After'))).toBeGreaterThan(0);
    // Another network is not affected.
    expect((await create('198.51.100.20')).status).toBe(201);
  });

  it('caps new teams per day across the server', async () => {
    const before = await registry().createdToday(Date.now());
    await runInDurableObject(registry(), (_i, state) => {
      state.storage.sql.exec("INSERT INTO creations (day, address, count) VALUES (?, 'filler', ?)", today(), TEAMS_PER_DAY - before);
    });
    const refused = await create('192.0.2.44');
    expect(refused.status).toBe(429);
    expect(refused.body.error).toBe('Rebound has reached its limit of new teams for today. Please try again tomorrow.');
    await runInDurableObject(registry(), (_i, state) => {
      state.storage.sql.exec("DELETE FROM creations WHERE address = 'filler'");
    });
    expect((await create('192.0.2.44')).status).toBe(201);
  });

  it('does not count a request that fails its checks', async () => {
    const before = await registry().createdToday(Date.now());
    const bad = await call('/api/teams', { body: { ...body, pin: '12' }, headers: { 'CF-Connecting-IP': '192.0.2.50' } });
    expect(bad.status).toBe(400);
    expect(await registry().createdToday(Date.now())).toBe(before);
  });

  it('keeps addresses only as salted hashes, and only for today', async () => {
    await runInDurableObject(registry(), (_i, state) => {
      state.storage.sql.exec("INSERT INTO creations (day, address, count) VALUES ('2020-01-01', 'old', 3)");
    });
    expect((await create('192.0.2.77')).status).toBe(201);
    const rows = await runInDurableObject(registry(), (_i, state) => state.storage.sql.exec<{ day: string; address: string }>('SELECT day, address FROM creations').toArray());
    expect(rows.map((r) => r.address)).not.toContain('192.0.2.77');
    expect(rows.every((r) => r.day === today())).toBe(true);
    expect(rows.find((r) => r.address !== 'none')?.address).toMatch(/^[0-9a-f]{64}$/);
  });
});
