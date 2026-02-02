import type { SessionKey, CompactionResult } from '../types/session';
import type { IAgentRuntime } from '../types/agent';
import type { SessionManager } from './manager';
import { logger } from '../utils/logger';

export interface CompactionManagerConfig {
  autoCompactEnabled?: boolean;
  compactThreshold?: number;
  preCompactMemoryFlush?: boolean;
  checkIntervalMs?: number;
}

export interface CompactionManagerDependencies {
  sessionManager: SessionManager;
  getAgent: (agentId: string) => IAgentRuntime | undefined;
}

export class CompactionManager {
  private config: CompactionManagerConfig;
  private deps: CompactionManagerDependencies;
  private checkTimer?: ReturnType<typeof setInterval>;

  constructor(config: CompactionManagerConfig, deps: CompactionManagerDependencies) {
    this.config = {
      autoCompactEnabled: config.autoCompactEnabled ?? true,
      compactThreshold: config.compactThreshold ?? 50,
      preCompactMemoryFlush: config.preCompactMemoryFlush ?? true,
      checkIntervalMs: config.checkIntervalMs ?? 60000,
    };
    this.deps = deps;

    if (this.config.autoCompactEnabled) {
      this.startAutoCompaction();
    }
  }

  async compact(key: SessionKey): Promise<CompactionResult> {
    const session = this.deps.sessionManager.getSession(key);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const agent = this.deps.getAgent(session.agentId);
    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }

    logger.info('Starting session compaction', { 
      sessionId: session.agentSessionId,
      messageCount: session.messageCount,
    });

    if (this.config.preCompactMemoryFlush) {
      await this.flushMemory(session.agentSessionId, agent);
    }

    const success = await agent.summarize(session.agentSessionId);

    if (success) {
      logger.info('Session compaction completed', { sessionId: session.agentSessionId });
      return { success: true };
    }

    return { success: false, error: 'Compaction failed' };
  }

  async compactIfNeeded(key: SessionKey): Promise<CompactionResult | null> {
    const session = this.deps.sessionManager.getSession(key);
    if (!session) return null;

    const threshold = this.config.compactThreshold || 50;
    
    if (session.messageCount >= threshold) {
      logger.debug('Auto-compact threshold reached', { 
        messageCount: session.messageCount, 
        threshold 
      });
      return this.compact(key);
    }

    return null;
  }

  private async flushMemory(sessionId: string, agent: IAgentRuntime): Promise<void> {
    try {
      await agent.executeCommand(sessionId, '/memory');
      logger.debug('Memory flushed before compaction', { sessionId });
    } catch (error) {
      logger.warn('Memory flush failed', { sessionId, error });
    }
  }

  private startAutoCompaction(): void {
    this.checkTimer = setInterval(() => {
      this.checkAllSessionsForCompaction();
    }, this.config.checkIntervalMs);
  }

  private async checkAllSessionsForCompaction(): Promise<void> {
    const sessions = this.deps.sessionManager.getAllSessions();
    const threshold = this.config.compactThreshold || 50;

    for (const session of sessions) {
      if (session.messageCount >= threshold && session.status === 'active') {
        try {
          await this.compact(session.key);
        } catch (error) {
          logger.error('Auto-compaction failed', { 
            sessionKey: session.key, 
            error 
          });
        }
      }
    }
  }

  shutdown(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }
  }
}

export function createCompactionManager(
  config: CompactionManagerConfig,
  deps: CompactionManagerDependencies
): CompactionManager {
  return new CompactionManager(config, deps);
}
