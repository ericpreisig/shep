/**
 * Daemon Health Probe
 *
 * Calls the web app's readiness endpoint over HTTP and turns the answer
 * into a `DaemonHealthReport`. The endpoint is a real readiness check — it
 * resolves use cases from DI and does live database reads — but it is
 * namespaced under `/api/agent-events/health`, which is why nothing found
 * it. `HEALTH_ENDPOINT_PATHS` lists the short alias first so the probe
 * starts working against `/api/health` the moment that alias lands (see
 * the report); today the second entry answers.
 *
 * Always resolves. An unreachable daemon is data, not an exception.
 */

import { inject, injectable } from 'tsyringe';
import { getOrCreateWebAuthToken } from '../web-auth/web-auth-token.service.js';

import type { IDaemonService } from '../../../application/ports/output/services/daemon-service.interface.js';
import type {
  DaemonHealthCheck,
  DaemonHealthReport,
  IDaemonHealthProbe,
} from '../../../application/ports/output/services/daemon-health-probe.interface.js';

/**
 * Candidate readiness paths, most preferred first. A 404 moves on to the
 * next; anything else is taken as the answer.
 */
export const HEALTH_ENDPOINT_PATHS = ['/api/health', '/api/agent-events/health'] as const;

/** How long the probe may wait before declaring the daemon unreachable. */
export const HEALTH_PROBE_TIMEOUT_MS = 2500;

/** The daemon always serves on loopback; daemon.json records only the port. */
const DAEMON_ORIGIN_PREFIX = 'http://localhost:';

/** HTTP status meaning "this path is not served" — try the next candidate. */
const HTTP_NOT_FOUND = 404;

/** Shape of the JSON the readiness endpoint returns. */
interface HealthPayload {
  ok?: unknown;
  checks?: Record<string, { ok?: unknown; detail?: unknown }>;
}

/** The subset of `fetch` this service needs, so tests pass a plain double. */
export type FetchFunction = (url: string, init: RequestInit) => Promise<Response>;

@injectable()
export class DaemonHealthProbeService implements IDaemonHealthProbe {
  constructor(
    @inject('IDaemonService')
    private readonly daemonService: IDaemonService,
    private readonly fetchFn: FetchFunction = (url, init) => fetch(url, init),
    private readonly timeoutMs: number = HEALTH_PROBE_TIMEOUT_MS
  ) {}

  async probe(): Promise<DaemonHealthReport> {
    const state = await this.daemonService.read();
    if (state === null) {
      return unreachable(false, null, 'No daemon record at ~/.shep/daemon.json');
    }
    if (!this.daemonService.isAlive(state.pid)) {
      return unreachable(false, null, `Daemon PID ${state.pid} is not running`);
    }

    const origin = `${DAEMON_ORIGIN_PREFIX}${state.port}`;
    let lastError = 'No readiness endpoint answered';
    let lastUrl: string | null = null;

    for (const path of HEALTH_ENDPOINT_PATHS) {
      const url = `${origin}${path}`;
      lastUrl = url;
      try {
        const response = await this.fetchWithTimeout(url);
        if (response.status === HTTP_NOT_FOUND) {
          lastError = `No readiness endpoint answered (last tried ${path})`;
          continue;
        }
        return await toReport(url, response);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    return unreachable(true, lastUrl, lastError);
  }

  /**
   * A daemon that accepts the connection and never answers must not hang
   * `shep doctor`, so every request carries an abort signal.
   */
  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchFn(url, {
        signal: controller.signal,
        headers: { 'x-shep-token': getOrCreateWebAuthToken() },
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

async function toReport(url: string, response: Response): Promise<DaemonHealthReport> {
  let payload: HealthPayload;
  try {
    payload = (await response.json()) as HealthPayload;
  } catch (error) {
    return {
      daemonRunning: true,
      reachable: false,
      healthy: false,
      url,
      httpStatus: response.status,
      checks: [],
      error: `Readiness endpoint did not return JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  const checks = toChecks(payload.checks);
  return {
    daemonRunning: true,
    reachable: true,
    healthy: payload.ok === true,
    url,
    httpStatus: response.status,
    checks,
    error: null,
  };
}

function toChecks(raw: HealthPayload['checks']): DaemonHealthCheck[] {
  if (raw === undefined || raw === null || typeof raw !== 'object') return [];
  return Object.entries(raw).map(([name, value]) => ({
    name,
    ok: value?.ok === true,
    ...(typeof value?.detail === 'string' ? { detail: value.detail } : {}),
  }));
}

function unreachable(
  daemonRunning: boolean,
  url: string | null,
  error: string
): DaemonHealthReport {
  return {
    daemonRunning,
    reachable: false,
    healthy: false,
    url,
    httpStatus: null,
    checks: [],
    error,
  };
}
