import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { DefaultHookManager, createHookManager } from '../../hooks/manager';
import type { MessageReceivedHook, SessionCreatedHook, ErrorOccurredHook } from '../../types/hook';

describe('DefaultHookManager', () => {
  let manager: DefaultHookManager;

  beforeEach(() => {
    manager = createHookManager();
  });

  describe('register', () => {
    test('should register a hook handler', () => {
      const handler = mock(async () => {});
      
      const id = manager.register('message.received', handler);
      
      expect(id).toBeDefined();
      expect(id).toMatch(/^hook_/);
      expect(manager.getHandlerCount('message.received')).toBe(1);
    });

    test('should register multiple handlers for same event', () => {
      manager.register('message.received', async () => {});
      manager.register('message.received', async () => {});
      manager.register('message.received', async () => {});
      
      expect(manager.getHandlerCount('message.received')).toBe(3);
    });

    test('should register handlers for different events', () => {
      manager.register('message.received', async () => {});
      manager.register('session.created', async () => {});
      manager.register('error.occurred', async () => {});
      
      expect(manager.getRegisteredEvents()).toHaveLength(3);
      expect(manager.getHandlerCount()).toBe(3);
    });

    test('should sort handlers by priority (highest first)', () => {
      manager.register('message.received', async () => {}, { priority: 1, source: 'low' });
      manager.register('message.received', async () => {}, { priority: 10, source: 'high' });
      manager.register('message.received', async () => {}, { priority: 5, source: 'medium' });
      
      const handlers = manager.getHandlers('message.received');
      
      expect(handlers[0]!.source).toBe('high');
      expect(handlers[1]!.source).toBe('medium');
      expect(handlers[2]!.source).toBe('low');
    });
  });

  describe('unregister', () => {
    test('should unregister a hook handler by id', () => {
      const id = manager.register('message.received', async () => {});
      expect(manager.getHandlerCount('message.received')).toBe(1);
      
      manager.unregister(id);
      
      expect(manager.getHandlerCount('message.received')).toBe(0);
    });

    test('should only remove the specific handler', () => {
      const id1 = manager.register('message.received', async () => {});
      const id2 = manager.register('message.received', async () => {});
      
      manager.unregister(id1);
      
      expect(manager.getHandlerCount('message.received')).toBe(1);
      const remaining = manager.getHandlers('message.received');
      expect(remaining[0]!.id).toBe(id2);
    });

    test('should handle unregistering non-existent id gracefully', () => {
      expect(() => manager.unregister('non-existent-id')).not.toThrow();
    });
  });

  describe('emit', () => {
    test('should call handler when event is emitted', async () => {
      const handler = mock(async () => {});
      manager.register('message.received', handler);
      
      const event: MessageReceivedHook = {
        type: 'message.received',
        timestamp: Date.now(),
        message: {
          id: 'msg_1',
          chatId: 'chat_1',
          chatType: 'private',
          senderId: 'user_1',
          type: 'text',
          text: 'Hello',
          timestamp: Date.now(),
        },
        context: {
          channelId: 'feishu',
          channelType: 'feishu',
          chatId: 'chat_1',
          senderId: 'user_1',
          chatType: 'private',
        },
      };
      
      await manager.emit(event);
      
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    test('should call all handlers in priority order', async () => {
      const order: string[] = [];
      
      manager.register('session.created', async () => { order.push('low'); }, { priority: 1 });
      manager.register('session.created', async () => { order.push('high'); }, { priority: 10 });
      manager.register('session.created', async () => { order.push('medium'); }, { priority: 5 });
      
      const event: SessionCreatedHook = {
        type: 'session.created',
        timestamp: Date.now(),
        sessionId: 'sess_1',
        channelId: 'feishu',
        chatId: 'chat_1',
        userId: 'user_1',
        projectPath: '/project',
      };
      
      await manager.emit(event);
      
      expect(order).toEqual(['high', 'medium', 'low']);
    });

    test('should not throw when no handlers registered', async () => {
      const event: MessageReceivedHook = {
        type: 'message.received',
        timestamp: Date.now(),
        message: {
          id: 'msg_1',
          chatId: 'chat_1',
          chatType: 'private',
          senderId: 'user_1',
          type: 'text',
          timestamp: Date.now(),
        },
        context: {
          channelId: 'feishu',
          channelType: 'feishu',
          chatId: 'chat_1',
          senderId: 'user_1',
          chatType: 'private',
        },
      };
      
      await expect(manager.emit(event)).resolves.toBeUndefined();
    });

    test('should continue calling handlers even if one throws', async () => {
      const handler1 = mock(async () => { throw new Error('Handler 1 error'); });
      const handler2 = mock(async () => {});
      
      manager.register('error.occurred', handler1, { priority: 10 });
      manager.register('error.occurred', handler2, { priority: 1 });
      
      const event: ErrorOccurredHook = {
        type: 'error.occurred',
        timestamp: Date.now(),
        code: 'TEST_ERROR',
        message: 'Test error message',
      };
      
      await manager.emit(event);
      
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('getHandlers', () => {
    test('should return empty array for unregistered event', () => {
      const handlers = manager.getHandlers('channel.connected');
      expect(handlers).toEqual([]);
    });

    test('should return all handlers for an event', () => {
      manager.register('message.sent', async () => {}, { source: 'plugin1' });
      manager.register('message.sent', async () => {}, { source: 'plugin2' });
      
      const handlers = manager.getHandlers('message.sent');
      
      expect(handlers).toHaveLength(2);
      expect(handlers.map(h => h.source)).toContain('plugin1');
      expect(handlers.map(h => h.source)).toContain('plugin2');
    });
  });

  describe('clear', () => {
    test('should remove all handlers', () => {
      manager.register('message.received', async () => {});
      manager.register('session.created', async () => {});
      manager.register('error.occurred', async () => {});
      
      expect(manager.getHandlerCount()).toBe(3);
      
      manager.clear();
      
      expect(manager.getHandlerCount()).toBe(0);
      expect(manager.getRegisteredEvents()).toHaveLength(0);
    });
  });

  describe('getRegisteredEvents', () => {
    test('should return all event types with handlers', () => {
      manager.register('message.received', async () => {});
      manager.register('session.created', async () => {});
      
      const events = manager.getRegisteredEvents();
      
      expect(events).toContain('message.received');
      expect(events).toContain('session.created');
      expect(events).not.toContain('error.occurred');
    });
  });

  describe('getHandlerCount', () => {
    test('should return total count when no event specified', () => {
      manager.register('message.received', async () => {});
      manager.register('message.received', async () => {});
      manager.register('session.created', async () => {});
      
      expect(manager.getHandlerCount()).toBe(3);
    });

    test('should return count for specific event', () => {
      manager.register('message.received', async () => {});
      manager.register('message.received', async () => {});
      manager.register('session.created', async () => {});
      
      expect(manager.getHandlerCount('message.received')).toBe(2);
      expect(manager.getHandlerCount('session.created')).toBe(1);
      expect(manager.getHandlerCount('error.occurred')).toBe(0);
    });
  });
});
