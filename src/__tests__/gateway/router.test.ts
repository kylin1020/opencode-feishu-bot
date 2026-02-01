import { describe, test, expect, beforeEach } from 'bun:test';
import { BindingsRouter } from '../../gateway/router';
import type { Binding, BindingContext } from '../../types/binding';

describe('BindingsRouter', () => {
  let router: BindingsRouter;

  beforeEach(() => {
    router = new BindingsRouter('default-agent');
  });

  test('should route to default agent when no bindings match', () => {
    const context: BindingContext = {
      channelId: 'feishu',
      channelType: 'feishu',
      chatId: 'chat_1',
      chatType: 'private',
      userId: 'user_1',
    };

    const result = router.route(context);

    expect(result.agentId).toBe('default-agent');
    expect(result.matchedBy).toContain('default');
  });

  test('should match by userId', () => {
    router.addBinding({
      id: 'vip',
      agentId: 'premium-agent',
      priority: 10,
      enabled: true,
      match: { userId: 'vip_user' },
    });

    const result = router.route({
      channelId: 'feishu',
      channelType: 'feishu',
      chatId: 'chat_1',
      chatType: 'private',
      userId: 'vip_user',
    });

    expect(result.agentId).toBe('premium-agent');
    expect(result.matchedBy).toContain('userId');
  });

  test('should match by userId array', () => {
    router.addBinding({
      id: 'vip-group',
      agentId: 'premium-agent',
      priority: 10,
      enabled: true,
      match: { userId: ['vip_1', 'vip_2', 'vip_3'] },
    });

    const result = router.route({
      channelId: 'feishu',
      channelType: 'feishu',
      chatId: 'chat_1',
      chatType: 'private',
      userId: 'vip_2',
    });

    expect(result.agentId).toBe('premium-agent');
  });

  test('should match by chatType', () => {
    router.addBinding({
      id: 'groups-only',
      agentId: 'group-agent',
      priority: 5,
      enabled: true,
      match: { chatType: 'group' },
    });

    const result = router.route({
      channelId: 'feishu',
      channelType: 'feishu',
      chatId: 'chat_1',
      chatType: 'group',
      userId: 'user_1',
    });

    expect(result.agentId).toBe('group-agent');
    expect(result.matchedBy).toContain('chatType');
  });

  test('should match by messagePattern', () => {
    router.addBinding({
      id: 'code-review',
      agentId: 'code-agent',
      priority: 10,
      enabled: true,
      match: { messagePattern: '^/review' },
    });

    const result = router.route({
      channelId: 'feishu',
      channelType: 'feishu',
      chatId: 'chat_1',
      chatType: 'private',
      userId: 'user_1',
      messageText: '/review PR #123',
    });

    expect(result.agentId).toBe('code-agent');
    expect(result.matchedBy).toContain('messagePattern');
  });

  test('should respect priority order', () => {
    router.addBinding({
      id: 'low',
      agentId: 'low-agent',
      priority: 1,
      enabled: true,
      match: { chatType: 'private' },
    });

    router.addBinding({
      id: 'high',
      agentId: 'high-agent',
      priority: 10,
      enabled: true,
      match: { chatType: 'private' },
    });

    const result = router.route({
      channelId: 'feishu',
      channelType: 'feishu',
      chatId: 'chat_1',
      chatType: 'private',
      userId: 'user_1',
    });

    expect(result.agentId).toBe('high-agent');
  });

  test('should skip disabled bindings', () => {
    router.addBinding({
      id: 'disabled',
      agentId: 'disabled-agent',
      priority: 100,
      enabled: false,
      match: { chatType: 'private' },
    });

    const result = router.route({
      channelId: 'feishu',
      channelType: 'feishu',
      chatId: 'chat_1',
      chatType: 'private',
      userId: 'user_1',
    });

    expect(result.agentId).toBe('default-agent');
  });

  test('should remove binding', () => {
    router.addBinding({
      id: 'to-remove',
      agentId: 'temp-agent',
      priority: 10,
      enabled: true,
      match: { chatType: 'private' },
    });

    router.removeBinding('to-remove');

    const result = router.route({
      channelId: 'feishu',
      channelType: 'feishu',
      chatId: 'chat_1',
      chatType: 'private',
      userId: 'user_1',
    });

    expect(result.agentId).toBe('default-agent');
  });

  test('should update binding', () => {
    router.addBinding({
      id: 'updatable',
      agentId: 'old-agent',
      priority: 10,
      enabled: true,
      match: { chatType: 'private' },
    });

    router.updateBinding('updatable', { agentId: 'new-agent' });

    const result = router.route({
      channelId: 'feishu',
      channelType: 'feishu',
      chatId: 'chat_1',
      chatType: 'private',
      userId: 'user_1',
    });

    expect(result.agentId).toBe('new-agent');
  });

  test('should get bindings by agent', () => {
    router.addBinding({
      id: 'b1',
      agentId: 'agent-a',
      priority: 1,
      enabled: true,
    });

    router.addBinding({
      id: 'b2',
      agentId: 'agent-b',
      priority: 2,
      enabled: true,
    });

    router.addBinding({
      id: 'b3',
      agentId: 'agent-a',
      priority: 3,
      enabled: true,
    });

    const bindings = router.getBindingsByAgent('agent-a');
    expect(bindings).toHaveLength(2);
    expect(bindings.every(b => b.agentId === 'agent-a')).toBe(true);
  });
});
