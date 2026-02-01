import { describe, test, expect } from 'bun:test';
import { BaseChannel, MessageConverter } from '../../channels';
import type { 
  ChannelCapabilities, 
  CardUpdateResult, 
  SendMessageOptions,
  ChannelEvent,
} from '../../types/channel';
import type { UnifiedReply, ContentBlock } from '../../types/message';

class TestChannel extends BaseChannel {
  readonly id = 'test';
  readonly type = 'test';
  readonly capabilities: ChannelCapabilities = {
    supported: ['text', 'image', 'streaming'],
    streamingThrottleMs: 100,
  };

  async connect(): Promise<void> {
    this.setConnected(true);
  }

  async disconnect(): Promise<void> {
    this.setConnected(false);
  }

  async sendMessage(_chatId: string, _message: UnifiedReply, _options?: SendMessageOptions): Promise<string> {
    return 'msg_123';
  }

  async updateMessage(_messageId: string, _message: UnifiedReply): Promise<CardUpdateResult> {
    return { success: true };
  }

  async recallMessage(_messageId: string): Promise<boolean> {
    return true;
  }

  async downloadAttachment(_attachmentId: string): Promise<Buffer> {
    return Buffer.from('test');
  }

  async getUserInfo(_userId: string): Promise<{ id: string; name: string }> {
    return { id: 'user_1', name: 'Test User' };
  }

  async testEmit(event: ChannelEvent): Promise<void> {
    await this.emit(event);
  }
}

describe('BaseChannel', () => {
  test('should track connection state', async () => {
    const channel = new TestChannel();
    expect(channel.isConnected()).toBe(false);
    
    await channel.connect();
    expect(channel.isConnected()).toBe(true);
    
    await channel.disconnect();
    expect(channel.isConnected()).toBe(false);
  });

  test('should check capabilities', () => {
    const channel = new TestChannel();
    expect(channel.hasCapability('text')).toBe(true);
    expect(channel.hasCapability('streaming')).toBe(true);
    expect(channel.hasCapability('card')).toBe(false);
  });

  test('should handle event registration', async () => {
    const channel = new TestChannel();
    let called = false;

    const handler = async () => { called = true; };
    channel.on('message', handler);

    await channel.testEmit({
      type: 'message',
      eventId: 'evt_1',
      channelId: 'test',
      timestamp: Date.now(),
    } as ChannelEvent);

    expect(called).toBe(true);
  });

  test('should handle event unregistration', async () => {
    const channel = new TestChannel();
    let callCount = 0;

    const handler = async () => { callCount++; };
    channel.on('message', handler);
    
    await channel.testEmit({
      type: 'message',
      eventId: 'evt_1',
      channelId: 'test',
      timestamp: Date.now(),
    } as ChannelEvent);
    
    expect(callCount).toBe(1);

    channel.off('message', handler);
    
    await channel.testEmit({
      type: 'message',
      eventId: 'evt_2',
      channelId: 'test',
      timestamp: Date.now(),
    } as ChannelEvent);
    
    expect(callCount).toBe(1);
  });
});

describe('MessageConverter', () => {
  test('should convert blocks to plain text', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'Hello' },
      { type: 'code', language: 'js', content: 'console.log("hi")' },
      { type: 'tool_call', toolName: 'read', status: 'completed' },
    ];

    const text = MessageConverter.toPlainText(blocks);
    expect(text).toContain('Hello');
    expect(text).toContain('```js');
    expect(text).toContain('[Tool: read - completed]');
  });

  test('should extract text blocks', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'First' },
      { type: 'code', language: 'ts', content: 'code' },
      { type: 'text', content: 'Second' },
    ];

    const text = MessageConverter.extractText(blocks);
    expect(text).toBe('First\nSecond');
  });

  test('should extract code blocks', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', content: 'text' },
      { type: 'code', language: 'ts', content: 'const x = 1' },
      { type: 'code', content: 'plain code' },
    ];

    const code = MessageConverter.extractCode(blocks);
    expect(code).toHaveLength(2);
    expect(code[0]!.language).toBe('ts');
  });

  test('should create text reply', () => {
    const reply = MessageConverter.createTextReply('Hello');
    expect(reply.status).toBe('completed');
    expect(reply.blocks).toHaveLength(1);
    expect(reply.plainText).toBe('Hello');
  });

  test('should create error reply', () => {
    const reply = MessageConverter.createErrorReply('Something went wrong', 'ERR_001');
    expect(reply.status).toBe('error');
    expect(reply.blocks[0]!.type).toBe('error');
  });

  test('should parse markdown to blocks', () => {
    const markdown = `Hello world

\`\`\`typescript
const x = 1;
\`\`\`

More text`;

    const blocks = MessageConverter.parseMarkdownToBlocks(markdown);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]!.type).toBe('text');
    expect(blocks[1]!.type).toBe('code');
    expect(blocks[2]!.type).toBe('text');
  });

  test('should append block to reply', () => {
    const reply = MessageConverter.createTextReply('Start');
    const updated = MessageConverter.appendBlock(reply, { type: 'text', content: 'End' });
    
    expect(updated.blocks).toHaveLength(2);
    expect(updated.plainText).toContain('End');
  });
});
