import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { SessionManager } from '../../session/manager';
import type { SessionKey } from '../../types/session';
import type { IAgentRuntime } from '../../types/agent';

function createMockAgent(): IAgentRuntime {
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
    summarize: async () => true,
    subscribe: () => () => {},
    unsubscribe: () => {},
    listModels: async () => [],
    getSessionInfo: async () => null,
  };
}

describe('SessionManager', () => {
  let sessionManager: SessionManager;
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
  });
  
  afterEach(() => {
    sessionManager.shutdown();
  });
  
  test('should create session with chat key type', async () => {
    const key: SessionKey = {
      channelId: 'feishu',
      chatId: 'chat_123',
      keyType: 'chat',
    };
    
    const session = await sessionManager.createSession(key, '/test/project', 'test-model');
    
    expect(session).toBeDefined();
    expect(session.key).toEqual(key);
    expect(session.projectPath).toBe('/test/project');
    expect(session.model).toBe('test-model');
    expect(session.status).toBe('active');
  });
  
  test('should get existing session', async () => {
    const key: SessionKey = {
      channelId: 'feishu',
      chatId: 'chat_123',
      keyType: 'chat',
    };
    
    await sessionManager.createSession(key, '/test/project');
    const session = sessionManager.getSession(key);
    
    expect(session).toBeDefined();
    expect(session!.key.chatId).toBe('chat_123');
  });
  
  test('should return undefined for non-existent session', () => {
    const key: SessionKey = {
      channelId: 'feishu',
      chatId: 'non_existent',
      keyType: 'chat',
    };
    
    const session = sessionManager.getSession(key);
    expect(session).toBeUndefined();
  });
  
  test('should get or create session', async () => {
    const key: SessionKey = {
      channelId: 'feishu',
      chatId: 'chat_456',
      keyType: 'chat',
    };
    
    const session1 = await sessionManager.getOrCreateSession(key, '/project');
    const session2 = await sessionManager.getOrCreateSession(key, '/project');
    
    expect(session1.agentSessionId).toBe(session2.agentSessionId);
  });
  
  test('should update session', async () => {
    const key: SessionKey = {
      channelId: 'feishu',
      chatId: 'chat_789',
      keyType: 'chat',
    };
    
    await sessionManager.createSession(key, '/project');
    sessionManager.updateSession(key, { model: 'new-model' });
    
    const session = sessionManager.getSession(key);
    expect(session!.model).toBe('new-model');
  });
  
  test('should delete session', async () => {
    const key: SessionKey = {
      channelId: 'feishu',
      chatId: 'chat_to_delete',
      keyType: 'chat',
    };
    
    await sessionManager.createSession(key, '/project');
    sessionManager.deleteSession(key);
    
    const session = sessionManager.getSession(key);
    expect(session).toBeUndefined();
  });
  
  test('should track event deduplication', () => {
    const eventId = 'event_123';
    
    expect(sessionManager.isDuplicateEvent(eventId)).toBe(false);
    sessionManager.markEventProcessed(eventId);
    expect(sessionManager.isDuplicateEvent(eventId)).toBe(true);
  });
  
  test('should manage tasks', async () => {
    const key: SessionKey = {
      channelId: 'feishu',
      chatId: 'chat_task',
      keyType: 'chat',
    };
    
    await sessionManager.createSession(key, '/project');
    
    const controller = sessionManager.startTask(key, 'msg_123');
    expect(controller).toBeDefined();
    
    const task = sessionManager.getActiveTask(key);
    expect(task).toBeDefined();
    expect(task!.messageId).toBe('msg_123');
    
    sessionManager.completeTask(key);
    expect(sessionManager.getActiveTask(key)).toBeUndefined();
  });
  
  test('should abort task', async () => {
    const key: SessionKey = {
      channelId: 'feishu',
      chatId: 'chat_abort',
      keyType: 'chat',
    };
    
    await sessionManager.createSession(key, '/project');
    sessionManager.startTask(key, 'msg_123');
    
    const result = sessionManager.abortTask(key);
    expect(result).toBe(true);
    expect(sessionManager.getActiveTask(key)).toBeUndefined();
  });
  
  test('should manage subtasks', async () => {
    const key: SessionKey = {
      channelId: 'feishu',
      chatId: 'chat_subtask',
      keyType: 'chat',
    };
    
    await sessionManager.createSession(key, '/project');
    
    sessionManager.registerSubtask(key, 'subtask_1');
    sessionManager.registerSubtask(key, 'subtask_2');
    
    const subtasks = sessionManager.getActiveSubtasks(key);
    expect(subtasks).toHaveLength(2);
    expect(subtasks).toContain('subtask_1');
    expect(subtasks).toContain('subtask_2');
    
    sessionManager.completeSubtask(key, 'subtask_1');
    expect(sessionManager.getActiveSubtasks(key)).toHaveLength(1);
  });
  
  test('should get all sessions', async () => {
    const key1: SessionKey = { channelId: 'feishu', chatId: 'chat_1', keyType: 'chat' };
    const key2: SessionKey = { channelId: 'feishu', chatId: 'chat_2', keyType: 'chat' };
    
    await sessionManager.createSession(key1, '/project1');
    await sessionManager.createSession(key2, '/project2');
    
    const allSessions = sessionManager.getAllSessions();
    expect(allSessions).toHaveLength(2);
  });
  
  test('should get sessions by channel', async () => {
    const key1: SessionKey = { channelId: 'feishu', chatId: 'chat_1', keyType: 'chat' };
    const key2: SessionKey = { channelId: 'slack', chatId: 'chat_2', keyType: 'chat' };
    
    await sessionManager.createSession(key1, '/project1');
    await sessionManager.createSession(key2, '/project2');
    
    const feishuSessions = sessionManager.getSessionsByChannel('feishu');
    expect(feishuSessions).toHaveLength(1);
    expect(feishuSessions[0]!.key.channelId).toBe('feishu');
  });
  
  test('should build key string correctly for different key types', async () => {
    const chatKey: SessionKey = {
      channelId: 'feishu',
      chatId: 'chat_123',
      keyType: 'chat',
    };
    
    const userKey: SessionKey = {
      channelId: 'feishu',
      chatId: '',
      userId: 'user_123',
      keyType: 'user',
    };
    
    const userChatKey: SessionKey = {
      channelId: 'feishu',
      chatId: 'chat_456',
      userId: 'user_789',
      keyType: 'user_chat',
    };
    
    await sessionManager.createSession(chatKey, '/project');
    await sessionManager.createSession(userKey, '/project');
    await sessionManager.createSession(userChatKey, '/project');
    
    expect(sessionManager.getSession(chatKey)).toBeDefined();
    expect(sessionManager.getSession(userKey)).toBeDefined();
    expect(sessionManager.getSession(userChatKey)).toBeDefined();
  });
});
