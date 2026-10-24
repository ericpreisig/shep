/**
 * DaemonHealthProbeService — makes the real readiness endpoint reachable
 * from the CLI. `shep status` used to report daemon.json plus `ps` output,
 * which proves a process exists, not that it can serve a request.
 */

import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';

import { DaemonHealthProbeService } from '@/infrastructure/services/diagnostics/daemon-health-probe.service.js';
import { HEALTH_ENDPOINT_PATHS } from '@/infrastructure/services/diagnostics/daemon-health-probe.service.js';
import type { IDaemonService } from '@/application/ports/output/services/daemon-service.interface.js';

vi.mock('@/infrastructure/services/web-auth/web-auth-token.service.js', () => ({
  getOrCreateWebAuthToken: () => 'local-test-token',
}));

function daemonService(overrides: Partial<IDaemonService> = {}): IDaemonService {
  return {
    read: async () => ({ pid: 1234, port: 3417, startedAt: new Date().toISOString() }),
    write: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
    isAlive: () => true,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('DaemonHealthProbeService', () => {
  it('authenticates readiness requests with the installation token', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    await new DaemonHealthProbeService(daemonService(), fetchFn).probe();
    expect(fetchFn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: { 'x-shep-token': 'local-test-token' } })
    );
  });

  it('reports not running when there is no daemon record', async () => {
    const probe = new DaemonHealthProbeService(daemonService({ read: async () => null }), vi.fn());
    const report = await probe.probe();
    expect(report.daemonRunning).toBe(false);
    expect(report.reachable).toBe(false);
    expect(report.healthy).toBe(false);
    expect(report.url).toBeNull();
  });

  it('reports not running when the recorded pid is dead', async () => {
    const report = await new DaemonHealthProbeService(
      daemonService({ isAlive: () => false }),
      vi.fn()
    ).probe();
    expect(report.daemonRunning).toBe(false);
    expect(report.error).toBeTruthy();
  });

  it('reports healthy and carries the per-check breakdown', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jsonResponse({
        ok: true,
        checks: {
          container: { ok: true },
          features: { ok: true, detail: '3 features (1 with agent runs)' },
        },
      })
    );
    const report = await new DaemonHealthProbeService(daemonService(), fetchFn).probe();

    expect(report.daemonRunning).toBe(true);
    expect(report.reachable).toBe(true);
    expect(report.healthy).toBe(true);
    expect(report.httpStatus).toBe(200);
    expect(report.checks).toEqual([
      { name: 'container', ok: true },
      { name: 'features', ok: true, detail: '3 features (1 with agent runs)' },
    ]);
    expect(report.url).toContain('3417');
  });

  it('treats a 503 with a breakdown as reachable but unhealthy', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { ok: false, checks: { container: { ok: false, detail: 'container exploded' } } },
          503
        )
      );
    const report = await new DaemonHealthProbeService(daemonService(), fetchFn).probe();

    expect(report.reachable).toBe(true);
    expect(report.healthy).toBe(false);
    expect(report.httpStatus).toBe(503);
    expect(report.checks[0]).toEqual({
      name: 'container',
      ok: false,
      detail: 'container exploded',
    });
  });

  it('prefers the short alias path and falls back to the namespaced one', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, checks: {} }));

    const report = await new DaemonHealthProbeService(daemonService(), fetchFn).probe();

    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(String(fetchFn.mock.calls[0][0])).toContain(HEALTH_ENDPOINT_PATHS[0]);
    expect(String(fetchFn.mock.calls[1][0])).toContain(HEALTH_ENDPOINT_PATHS[1]);
    expect(report.healthy).toBe(true);
  });

  it('reports unreachable rather than throwing when the fetch fails', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const report = await new DaemonHealthProbeService(daemonService(), fetchFn).probe();

    expect(report.daemonRunning).toBe(true);
    expect(report.reachable).toBe(false);
    expect(report.healthy).toBe(false);
    expect(report.error).toContain('ECONNREFUSED');
  });

  it('reports unreachable when the endpoint answers with something that is not JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('<html>oops</html>', { status: 200 }));
    const report = await new DaemonHealthProbeService(daemonService(), fetchFn).probe();
    expect(report.healthy).toBe(false);
    expect(report.error).toBeTruthy();
  });

  it('passes an abort signal so a hung daemon cannot hang the CLI', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ ok: true, checks: {} }));
    await new DaemonHealthProbeService(daemonService(), fetchFn).probe();
    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeDefined();
  });
});
