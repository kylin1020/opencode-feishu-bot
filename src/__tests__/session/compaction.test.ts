import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { CompactionManager } from '../../session/compaction';
import { SessionManager } from '../../session/manager';
import type { SessionKey } from '../../types/session';
import type { IAgentRuntime } from '../../types/agent';

function createMockAgent(): IAgentRuntime {
  let summarizeCalled = false;
  
  return {
    id: 'mock-agent',
    type: 'mock',
    initialized: true,
    initialize: async () => {},
    shutdown: async () => {},
    createSession: async () => `session_${Date.now()}`,
    getOrCreateSession: async () => `session_${Date.now()}`,
    switchModel: async () => {},
    clearHistory: async () => {},
    send: async () => {},
    abort: async () => true,
    executeCommand: async () => 'executed',
    summarize: async () => {
      summarizeCalled = true;
      return true;
    },
    subscribe: () => () => {},
    unsubscribe: () => {},
    listModels: async () => [],
    getSessionInfo: async () => null,
    get _summarizeCalled() { return summarizeCalled; },
  } as IAgentRuntime & { _summarizeCalled: boolean };
}

describe('CompactionManager', () => {
  let sessionManager: SessionManager;
  let compactionManager: CompactionManager;
  let mockAgent: IAgentRuntime;
  
  beforeEach(() => {
    mockAgent = createMockAgent();
    
    sessionManager = new SessionManager(
      { keyType: 'chat' },
      {
        getAgent: () => mockAgent,
        getChannel: () => undefined,
      }
    );
    
    compactionManager = new CompactionManager(
      {
        autoCompactEnabled: false,
        compactThreshold: 10,
        preCompactMemoryFlush: false,
      },
      {
        sessionManager,
        getAgent: () => mockAgent,
      }
    );
  });
  
  afterEach(() => {
    compactionManager.shutdown();
    sessionManager.shutdown();
  });
  
  test('should compact session successfully', async () => {
    const key: SessionKey = {
      channelId: 'feishu',
      chatId: 'chat_compact',
      keyType: 'chat',
    };
    
    await sessionManager.createSession(key, '/project');
    const result = await compactionManager.compact(key);
    
    expect(result.success).toBe(true);
  });
  
  test('should return error for non-existent session', async () => {
    const key: SessionKey = {
      channelId: 'feishu',
      chatId: 'non_existent',
      keyType: 'chat',
    };
    
    const result = await compactionManager.compact(key);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
  
  test('should compact if needed based on threshold', async () => {
    const key: SessionKey = {
      channelId: 'feishu',
      chatId: 'chat_threshold',
      keyType: 'chat',
    };
    
    await sessionManager.createSession(key, '/project');
    
    const resultBelowThreshold = await compactionManager.compactIfNeeded(key);
    expect(resultBelowThreshold).toBeNull();
    
    sessionManager.updateSession(key, { messageCount: 15 });
    
    const resultAboveThreshold = await compactionManager.compactIfNeeded(key);
    expect(resultAboveThreshold).not.toBeNull();
    expect(resultAboveThreshold!.success).toBe(true);
  });
  
  test('should not compact if message count below threshold', async () => {
    const key: SessionKey = {
      channelId: 'feishu',
      chatId: 'chat_below',
      keyType: 'chat',
    };
    
    await sessionManager.createSession(key, '/project');
    sessionManager.updateSession(key, { messageCount: 5 });
    
    const result = await compactionManager.compactIfNeeded(key);
    expect(result).toBeNull();
  });
});
