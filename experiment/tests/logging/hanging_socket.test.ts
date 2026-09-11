import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';

import { SupabaseTransport } from '../../src/logging/supabase';
import { EventLogger } from '../../src/logging/logger';
import type { EventRow } from '../../src/logging/schema';

/**
 * The real failure, against a real socket.
 *
 * The third pilot lost most of two participants' data to a request that neither
 * resolved nor rejected. A mock transport that returns a forever-pending
 * promise exercises the logger's watchdog but not the transport's timeout, and
 * a healthy endpoint exercises neither. This holds the TCP connection open and
 * never answers, which is what actually happened.
 */
let server: Server;
let port = 0;
let hangEverything = true;

beforeAll(async () => {
  server = createServer((_req, res) => {
    if (hangEverything) return;       // accept the connection and never answer
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('null');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

const row = (i: number) => ({ session_id: 'hang', trial_index: i } as unknown as EventRow);

describe('a socket that never answers', () => {
  it('aborts rather than hanging forever, so the retry path can run', async () => {
    const transport = new SupabaseTransport({
      url: `http://127.0.0.1:${port}`,
      anonKey: 'test-key',
      timeoutMs: 400,
    });

    const started = Date.now();
    await expect(transport.upsertEvents([row(0)])).rejects.toThrow();
    const elapsed = Date.now() - started;

    // Bounded by the timeout, not left pending.
    expect(elapsed).toBeGreaterThanOrEqual(350);
    expect(elapsed).toBeLessThan(4000);
  }, 20_000);

  it('keeps the events and delivers them once the connection recovers', async () => {
    hangEverything = true;
    const transport = new SupabaseTransport({
      url: `http://127.0.0.1:${port}`,
      anonKey: 'test-key',
      timeoutMs: 200,
    });
    const logger = new EventLogger(transport, { batchSize: 1000, maxRetries: 1 });

    for (let i = 0; i < 3; i++) logger.log(row(i));

    // Every attempt meets the hanging socket, so this flush fails. The rows go
    // back to the buffer rather than being dropped, and -- the whole point --
    // inFlight is released so a later flush is not refused.
    expect(await logger.flush()).toBe(false);
    expect(logger.pendingCount).toBe(3);

    // A second attempt while still hanging must also be allowed to run. Before
    // the fix this returned early on a latched inFlight and delivered nothing
    // for the rest of the session.
    expect(await logger.flush()).toBe(false);
    expect(logger.pendingCount).toBe(3);

    hangEverything = false;
    expect(await logger.flush()).toBe(true);
    expect(logger.pendingCount).toBe(0);
  }, 30_000);
});
