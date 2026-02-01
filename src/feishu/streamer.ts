/**
 * 卡片流式更新模块
 * 实现节流的卡片内容更新，用于流式响应
 */
import type { FeishuClient } from './client';
import { buildStreamingCard, buildStreamingCardsV2, type FeishuCard, type OrderedPart, type SubtaskMetadata } from './formatter';
import { logger } from '../utils/logger';

const DEFAULT_THROTTLE_MS = 500;
const MIN_THROTTLE_MS = 500;
const RATE_LIMIT_RETRY_DELAY_MS = 600;
const MAX_RETRIES = 2;

export interface StreamerConfig {
  throttleMs?: number;
  maxContentLength?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class CardStreamer {
  private client: FeishuClient;
  private chatId: string;
  private messageIds: string[] = [];
  private buffer: string = '';
  private orderedParts: OrderedPart[] = [];
  private lastUpdateTimePerMessage: Map<string, number> = new Map();
  private throttleMs: number;
  private pendingUpdate: ReturnType<typeof setTimeout> | null = null;
  private isComplete: boolean = false;
  private title?: string;
  private useV2: boolean = false;
  private isUpdating: boolean = false;
  private hasPendingData: boolean = false;

  constructor(client: FeishuClient, chatId: string, config?: StreamerConfig) {
    this.client = client;
    this.chatId = chatId;
    this.throttleMs = Math.max(config?.throttleMs ?? DEFAULT_THROTTLE_MS, MIN_THROTTLE_MS);
  }

  setTitle(title: string): void {
    this.title = title;
  }

  async start(): Promise<void> {
    if (this.messageIds.length > 0) return;
    
    const cards = this.useV2 
      ? buildStreamingCardsV2([], false, this.title ?? '处理中...').cards
      : [buildStreamingCard('', false, this.title ?? '处理中...')];
    
    const card = cards[0];
    if (!card) return;
    
    try {
      const messageId = await this.client.sendCard(this.chatId, card);
      if (messageId) {
        this.messageIds.push(messageId);
        this.lastUpdateTimePerMessage.set(messageId, Date.now());
      } else {
        logger.error('创建初始卡片消息失败');
      }
    } catch (error) {
      logger.error('发送初始卡片时出错', error);
    }
  }

  async append(content: string): Promise<void> {
    this.buffer += content;
    await this.scheduleUpdate();
  }

  async setContent(content: string): Promise<void> {
    this.buffer = content;
    this.useV2 = false;
    await this.scheduleUpdate();
  }

  async setOrderedParts(parts: OrderedPart[]): Promise<void> {
    this.orderedParts = parts;
    this.useV2 = true;
    await this.scheduleUpdate();
  }

  async setParts(parts: Array<{ type: string; text?: string; name?: string; state?: string; title?: string; input?: Record<string, unknown>; output?: string; error?: string; time?: { start: number; end?: number }; subtask?: SubtaskMetadata }>): Promise<void> {
    this.orderedParts = parts.map(p => ({
      type: p.type as 'text' | 'reasoning' | 'tool-call',
      text: p.text,
      name: p.name,
      state: p.state,
      title: p.title,
      input: p.input,
      output: p.output,
      error: p.error,
      time: p.time,
      subtask: p.subtask,
    }));
    this.useV2 = true;
    await this.scheduleUpdate();
  }

  private async scheduleUpdate(): Promise<void> {
    this.hasPendingData = true;
    
    if (this.isUpdating) {
      return;
    }
    
    if (this.pendingUpdate) {
      return;
    }
    
    this.pendingUpdate = setTimeout(async () => {
      this.pendingUpdate = null;
      await this.flush();
    }, this.throttleMs);
  }

  async flush(): Promise<void> {
    if (!this.buffer && this.orderedParts.length === 0) return;
    if (this.isUpdating) {
      this.hasPendingData = true;
      return;
    }

    this.isUpdating = true;
    this.hasPendingData = false;

    try {
      if (this.useV2) {
        const result = buildStreamingCardsV2(this.orderedParts, this.isComplete, this.title);
        await this.syncCards(result.cards);
      } else {
        const card = buildStreamingCard(this.buffer, this.isComplete, this.title);
        await this.syncCards([card]);
      }
    } catch (error) {
      logger.error('刷新卡片时出错', error);
    } finally {
      this.isUpdating = false;
      
      if (this.hasPendingData && !this.isComplete) {
        this.pendingUpdate = setTimeout(async () => {
          this.pendingUpdate = null;
          await this.flush();
        }, this.throttleMs);
      }
    }
  }

  private async updateCardWithRateLimit(messageId: string, card: object): Promise<boolean> {
    const lastUpdate = this.lastUpdateTimePerMessage.get(messageId) ?? 0;
    const timeSinceLastUpdate = Date.now() - lastUpdate;
    
    if (timeSinceLastUpdate < this.throttleMs) {
      const waitTime = this.throttleMs - timeSinceLastUpdate;
      await sleep(waitTime);
    }
    
    for (let retry = 0; retry <= MAX_RETRIES; retry++) {
      const result = await this.client.updateCard(messageId, card);
      
      if (result.success) {
        this.lastUpdateTimePerMessage.set(messageId, Date.now());
        return true;
      }
      
      if (result.rateLimited && retry < MAX_RETRIES) {
        logger.debug('卡片更新触发频率限制，等待重试', { messageId, retry });
        await sleep(RATE_LIMIT_RETRY_DELAY_MS);
        continue;
      }
      
      if (!result.rateLimited) {
        logger.warn('更新卡片失败', { messageId });
      }
      return false;
    }
    
    return false;
  }

  private async syncCards(cards: object[]): Promise<void> {
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      if (!card) continue;
      
      const existingMessageId = this.messageIds[i];
      if (existingMessageId) {
        await this.updateCardWithRateLimit(existingMessageId, card);
      } else {
        const messageId = await this.client.sendCard(this.chatId, card);
        if (messageId) {
          this.messageIds.push(messageId);
          this.lastUpdateTimePerMessage.set(messageId, Date.now());
        } else {
          logger.error('创建续卡片失败', { index: i });
        }
      }
    }
    
    while (this.messageIds.length > cards.length) {
      const extraMessageId = this.messageIds.pop();
      if (extraMessageId) {
        this.lastUpdateTimePerMessage.delete(extraMessageId);
        await this.client.deleteMessage(extraMessageId);
      }
    }
  }

  async complete(): Promise<void> {
    this.isComplete = true;
    
    if (this.pendingUpdate) {
      clearTimeout(this.pendingUpdate);
      this.pendingUpdate = null;
    }
    
    // 等待正在进行的更新完成
    while (this.isUpdating) {
      await sleep(50);
    }
    
    // 强制刷新最终状态，确保所有待处理数据都被更新
    // 多次调用以确保任何在等待期间到达的数据都被处理
    await this.flush();
    
    // 如果在 flush 期间有新数据到达，再刷新一次
    if (this.hasPendingData) {
      while (this.isUpdating) {
        await sleep(50);
      }
      await this.flush();
    }
  }

  async sendError(errorMessage: string): Promise<void> {
    this.isComplete = true;
    
    if (this.pendingUpdate) {
      clearTimeout(this.pendingUpdate);
      this.pendingUpdate = null;
    }

    while (this.isUpdating) {
      await sleep(50);
    }

    const card: FeishuCard = {
      config: { wide_screen_mode: true },
      header: {
        title: { tag: 'plain_text', content: '错误' },
        template: 'red',
      },
      elements: [{
        tag: 'markdown',
        content: `**发生错误：**\n\`\`\`\n${errorMessage}\n\`\`\``,
      }],
    };

    try {
      if (this.messageIds.length === 0) {
        const messageId = await this.client.sendCard(this.chatId, card);
        if (messageId) {
          this.messageIds.push(messageId);
        }
      } else {
        const firstMessageId = this.messageIds[0];
        if (firstMessageId) {
          await this.updateCardWithRateLimit(firstMessageId, card);
        }
        for (let i = 1; i < this.messageIds.length; i++) {
          const msgId = this.messageIds[i];
          if (msgId) {
            await this.client.deleteMessage(msgId);
          }
        }
        this.messageIds = this.messageIds.slice(0, 1);
      }
    } catch (error) {
      logger.error('发送错误卡片时出错', error);
    }
  }

  getMessageId(): string | null {
    return this.messageIds[0] ?? null;
  }

  getMessageIds(): string[] {
    return [...this.messageIds];
  }

  getContent(): string {
    return this.buffer;
  }

  isSubAgentTool(toolName: string): boolean {
    const subAgentTools = ['delegate_task', 'task'];
    return subAgentTools.includes(toolName.toLowerCase());
  }

  reset(): void {
    this.messageIds = [];
    this.buffer = '';
    this.orderedParts = [];
    this.lastUpdateTimePerMessage.clear();
    this.isComplete = false;
    this.title = undefined;
    this.useV2 = false;
    this.isUpdating = false;
    this.hasPendingData = false;
    
    if (this.pendingUpdate) {
      clearTimeout(this.pendingUpdate);
      this.pendingUpdate = null;
    }
  }
}

export function createCardStreamer(
  client: FeishuClient,
  chatId: string,
  config?: StreamerConfig
): CardStreamer {
  return new CardStreamer(client, chatId, config);
}
