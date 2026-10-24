import type { SpawnFunction } from '../types.js';
import { IS_WINDOWS } from '../../../../platform.js';
import { AcpInteractiveExecutor, type AcpAgentProfile } from './acp/acp-interactive-executor.js';
import { OPENCODE_NOT_FOUND } from './opencode-executor.service.js';
import { OPENCODE_FREE_MODEL } from '../../../../../domain/shared/agent-catalog.js';

export const OPENCODE_ACP_PROFILE: AcpAgentProfile = {
  agentName: 'OpenCode',
  defaultModel: OPENCODE_FREE_MODEL,
  requireRequestedModel: true,
  notFoundMessage: OPENCODE_NOT_FOUND,
  loginHint:
    'Run opencode and connect the provider with /connect. Free OpenCode models need no paid API key; connect OpenCode Go after subscribing.',
  handshakeFailureHint:
    'OpenCode chat requires v2 with the acp command. Update with npm install -g @opencode/cli.',
  launchCommand: () =>
    IS_WINDOWS
      ? { command: 'cmd.exe', args: ['/d', '/c', 'opencode', 'acp'] }
      : { command: 'opencode', args: ['acp'] },
};

export class OpenCodeInteractiveExecutor extends AcpInteractiveExecutor {
  constructor(spawn: SpawnFunction) {
    super(spawn, OPENCODE_ACP_PROFILE);
  }
}
