import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { Gateway } from '../../gateway/gateway';
import type { IChannel, ChannelCapabilities, ChannelCapability, ChannelEventHandler, ChannelEventType, CardUpdateResult } from '../../types/channel';
import type { IAgentRuntime, AgentEventHandler, ModelInfo } from '../../types/agent';
import type { Binding } from '../../types/binding';
import type { UnifiedReply } from '../../types/message';

function createMockChannel(id: string, type: string = 'test'): IChannel {
  let connected = false;
  
  return {
    id,
    type,
    capabilities: {
      supported: ['text', 'markdown'] as ChannelCapability[],
      streamingThrottleMs: 100,
      maxMessageLength: 4000,
    } as ChannelCapabilities,
    connect: mock(async () => { connected = true; }),
    disconnect: mock(async () => { connected = false; }),
    isConnected: () => connected,
    sendMessage: mock(async (_chatId: string, _message: UnifiedReply) => 'msg_123'),
    updateMessage: mock(async (_messageId: string, _message: UnifiedReply): Promise<CardUpdateResult> => ({ success: true })),
    recallMessage: mock(async (_messageId: string) => true),
    on: mock((_event: ChannelEventType, _handler: ChannelEventHandler) => {}),
    off: mock((_event: ChannelEventType, _handler: ChannelEventHandler) => {}),
    hasCapability: mock((cap: ChannelCapability) => ['text', 'markdown'].includes(cap)),
    downloadAttachment: mock(async (_id: string) => Buffer.from('test')),
    getUserInfo: mock(async (_userId: string) => ({ id: _userId, name: 'Test User' })),
  };
}

function createMockAgent(id: string, type: string = 'test'): IAgentRuntime {
  let initialized = false;
  
  return {
    id,
    type,
    get initialized() { return initialized; },
    initialize: mock(async () => { initialized = true; }),
    shutdown: mock(async () => { initialized = false; }),
    createSession: mock(async (_projectPath: string, _model?: string) => 'session_123'),
    getOrCreateSession: mock(async (_projectPath: string, _model?: string) => 'session_123'),
    switchModel: mock(async (_sessionId: string, _model: string) => {}),
    clearHistory: mock(async (_sessionId: string) => {}),
    send: mock(async (_sessionId: string, _message: string) => {}),
    abort: mock(async (_sessionId: string) => true),
    summarize: mock(async (_sessionId: string) => true),
    executeCommand: mock(async (_sessionId: string, _command: string) => 'result'),
    subscribe: mock((_sessionId: string, _handler: AgentEventHandler) => () => {}),
    unsubscribe: mock((_sessionId: string, _handler: AgentEventHandler) => {}),
    listModels: mock(async (): Promise<ModelInfo[]> => []),
    getSessionInfo: mock(async (_sessionId: string) => ({ model: 'test-model', projectPath: '/test' })),
  };
}

describe('Gateway', () => {
  let gateway: Gateway;

  beforeEach(() => {
    gateway = new Gateway({
      defaultAgent: 'default-agent',
      maxConcurrency: 5,
    });
  });

  describe('Channel Registration', () => {
    test('should register a channel', () => {
      const channel = createMockChannel('ch1', 'feishu');
      
      gateway.registerChannel(channel);
      
      expect(gateway.getChannel('ch1')).toBe(channel);
    });

    test('should throw when registering duplicate channel', () => {
      const channel = createMockChannel('ch1');
      
      gateway.registerChannel(channel);
      
      expect(() => gateway.registerChannel(channel)).toThrow('Channel ch1 already registered');
    });

    test('should unregister a channel', () => {
      const channel = createMockChannel('ch1');
      
      gateway.registerChannel(channel);
      gateway.unregisterChannel('ch1');
      
      expect(gateway.getChannel('ch1')).toBeUndefined();
    });

    test('should handle unregistering non-existent channel gracefully', () => {
      expect(() => gateway.unregisterChannel('non-existent')).not.toThrow();
    });
  });

  describe('Agent Registration', () => {
    test('should register an agent', () => {
      const agent = createMockAgent('agent1', 'opencode');
      
      gateway.registerAgent(agent);
      
      expect(gateway.getAgent('agent1')).toBe(agent);
    });

    test('should throw when registering duplicate agent', () => {
      const agent = createMockAgent('agent1');
      
      gateway.registerAgent(agent);
      
      expect(() => gateway.registerAgent(agent)).toThrow('Agent agent1 already registered');
    });

    test('should unregister an agent', () => {
      const agent = createMockAgent('agent1');
      
      gateway.registerAgent(agent);
      gateway.unregisterAgent('agent1');
      
      expect(gateway.getAgent('agent1')).toBeUndefined();
    });

    test('should handle unregistering non-existent agent gracefully', () => {
      expect(() => gateway.unregisterAgent('non-existent')).not.toThrow();
    });
  });

  describe('Gateway Lifecycle', () => {
    test('should start and initialize all agents and channels', async () => {
      const channel = createMockChannel('ch1');
      const agent = createMockAgent('agent1');
      
      gateway.registerChannel(channel);
      gateway.registerAgent(agent);
      
      await gateway.start();
      
      expect(gateway.isStarted()).toBe(true);
      expect(channel.connect).toHaveBeenCalled();
      expect(agent.initialize).toHaveBeenCalled();
    });

    test('should not start twice', async () => {
      const channel = createMockChannel('ch1');
      
      gateway.registerChannel(channel);
      
      await gateway.start();
      await gateway.start();
      
      expect(channel.connect).toHaveBeenCalledTimes(1);
    });

    test('should stop and shutdown all agents and disconnect channels', async () => {
      const channel = createMockChannel('ch1');
      const agent = createMockAgent('agent1');
      
      gateway.registerChannel(channel);
      gateway.registerAgent(agent);
      
      await gateway.start();
      await gateway.stop();
      
      expect(gateway.isStarted()).toBe(false);
      expect(channel.disconnect).toHaveBeenCalled();
      expect(agent.shutdown).toHaveBeenCalled();
    });

    test('should not stop if not started', async () => {
      const channel = createMockChannel('ch1');
      
      gateway.registerChannel(channel);
      
      await gateway.stop();
      
      expect(channel.disconnect).not.toHaveBeenCalled();
    });

    test('should skip already connected channels', async () => {
      const channel = createMockChannel('ch1');
      (channel as any).isConnected = () => true;
      
      gateway.registerChannel(channel);
      await gateway.start();
      
      expect(channel.connect).not.toHaveBeenCalled();
    });

    test('should skip already initialized agents', async () => {
      const agent = createMockAgent('agent1');
      Object.defineProperty(agent, 'initialized', { get: () => true });
      
      gateway.registerAgent(agent);
      await gateway.start();
      
      expect(agent.initialize).not.toHaveBeenCalled();
    });
  });

  describe('Router Integration', () => {
    test('should expose router', () => {
      const router = gateway.getRouter();
      
      expect(router).toBeDefined();
      expect(typeof router.route).toBe('function');
    });

    test('should initialize router with default agent', () => {
      const router = gateway.getRouter();
      
      const result = router.route({
        channelId: 'ch1',
        channelType: 'feishu',
        chatId: 'chat_1',
        chatType: 'private',
        userId: 'user_1',
      });
      
      expect(result.agentId).toBe('default-agent');
    });

    test('should configure bindings from config', () => {
      const bindings: Binding[] = [
        {
          id: 'vip',
          agentId: 'premium-agent',
          priority: 10,
          enabled: true,
          match: { userId: 'vip_user' },
        },
      ];
      
      const gatewayWithBindings = new Gateway({
        defaultAgent: 'default-agent',
        bindings,
      });
      
      const router = gatewayWithBindings.getRouter();
      const result = router.route({
        channelId: 'ch1',
        channelType: 'feishu',
        chatId: 'chat_1',
        chatType: 'private',
        userId: 'vip_user',
      });
      
      expect(result.agentId).toBe('premium-agent');
    });
  });

  describe('Queue Integration', () => {
    test('should expose queue', () => {
      const queue = gateway.getQueue();
      
      expect(queue).toBeDefined();
      expect(typeof queue.enqueue).toBe('function');
    });

    test('should respect maxConcurrency config', () => {
      const customGateway = new Gateway({
        defaultAgent: 'default',
        maxConcurrency: 3,
      });
      
      const queue = customGateway.getQueue();
      expect(queue).toBeDefined();
    });
  });

  describe('Multiple Channels and Agents', () => {
    test('should handle multiple channels', async () => {
      const ch1 = createMockChannel('ch1', 'feishu');
      const ch2 = createMockChannel('ch2', 'slack');
      const ch3 = createMockChannel('ch3', 'discord');
      
      gateway.registerChannel(ch1);
      gateway.registerChannel(ch2);
      gateway.registerChannel(ch3);
      
      await gateway.start();
      
      expect(ch1.connect).toHaveBeenCalled();
      expect(ch2.connect).toHaveBeenCalled();
      expect(ch3.connect).toHaveBeenCalled();
    });

    test('should handle multiple agents', async () => {
      const a1 = createMockAgent('agent1', 'opencode');
      const a2 = createMockAgent('agent2', 'custom');
      
      gateway.registerAgent(a1);
      gateway.registerAgent(a2);
      
      await gateway.start();
      
      expect(a1.initialize).toHaveBeenCalled();
      expect(a2.initialize).toHaveBeenCalled();
    });
  });
});
