import { describe, test, expect, mock, beforeEach } from 'bun:test';
import { BaseAgent } from '../../agent/base';
import type { ModelInfo, SendOptions, AgentEventHandler } from '../../types/agent';

class TestAgent extends BaseAgent {
  readonly id = 'test';
  readonly type = 'test';
  
  async initialize(): Promise<void> {
    this.setInitialized(true);
  }
  
  async shutdown(): Promise<void> {
    this.setInitialized(false);
  }
  
  async createSession(_projectPath: string, _model?: string): Promise<string> {
    return 'session_123';
  }
  
  async getOrCreateSession(projectPath: string, model?: string): Promise<string> {
    return this.createSession(projectPath, model);
  }
  
  async switchModel(_sessionId: string, _model: string): Promise<void> {}
  
  async clearHistory(_sessionId: string): Promise<void> {}
  
  async send(_sessionId: string, _message: string, _options?: SendOptions): Promise<void> {}
  
  async abort(_sessionId: string): Promise<boolean> {
    return true;
  }
  
  async executeCommand(_sessionId: string, _command: string): Promise<string> {
    return 'executed';
  }
  
  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: 'test/model-1', name: 'Test Model 1' },
      { id: 'test/model-2', name: 'Test Model 2' },
    ];
  }
  
  async getSessionInfo(_sessionId: string) {
    return { model: 'test/model-1', projectPath: '/test', messageCount: 5 };
  }
  
  testNotify(sessionId: string, event: Parameters<AgentEventHandler>[0]): void {
    this.notifyHandlers(sessionId, event);
  }
}

describe('BaseAgent', () => {
  let agent: TestAgent;

  beforeEach(() => {
    agent = new TestAgent();
  });

  test('should track initialization state', async () => {
    expect(agent.initialized).toBe(false);
    await agent.initialize();
    expect(agent.initialized).toBe(true);
    await agent.shutdown();
    expect(agent.initialized).toBe(false);
  });

  test('should have correct id and type', () => {
    expect(agent.id).toBe('test');
    expect(agent.type).toBe('test');
  });

  test('should create session', async () => {
    await agent.initialize();
    const sessionId = await agent.createSession('/path/to/project', 'test/model');
    expect(sessionId).toBe('session_123');
  });

  test('should list models', async () => {
    await agent.initialize();
    const models = await agent.listModels();
    expect(models).toHaveLength(2);
    expect(models[0]!.id).toBe('test/model-1');
  });

  test('should subscribe and receive events', async () => {
    await agent.initialize();
    const received: Parameters<AgentEventHandler>[0][] = [];
    
    const unsubscribe = agent.subscribe('session_1', (event) => {
      received.push(event);
    });
    
    agent.testNotify('session_1', {
      type: 'message.delta',
      sessionId: 'session_1',
      timestamp: Date.now(),
      messageId: 'msg_1',
      delta: 'Hello',
    });
    
    expect(received).toHaveLength(1);
    expect(received[0]!.type).toBe('message.delta');
    
    unsubscribe();
  });

  test('should unsubscribe from events', async () => {
    await agent.initialize();
    let callCount = 0;
    
    const handler: AgentEventHandler = () => { callCount++; };
    const unsubscribe = agent.subscribe('session_1', handler);
    
    agent.testNotify('session_1', {
      type: 'message.delta',
      sessionId: 'session_1',
      timestamp: Date.now(),
      messageId: 'msg_1',
      delta: 'test',
    });
    
    expect(callCount).toBe(1);
    
    unsubscribe();
    
    agent.testNotify('session_1', {
      type: 'message.delta',
      sessionId: 'session_1',
      timestamp: Date.now(),
      messageId: 'msg_2',
      delta: 'test2',
    });
    
    expect(callCount).toBe(1);
  });

  test('should get session info', async () => {
    await agent.initialize();
    const info = await agent.getSessionInfo('session_123');
    
    expect(info).not.toBeNull();
    expect(info!.model).toBe('test/model-1');
    expect(info!.projectPath).toBe('/test');
    expect(info!.messageCount).toBe(5);
  });
});
