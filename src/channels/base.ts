import type {
  IChannel,
  ChannelCapabilities,
  ChannelCapability,
  ChannelEventType,
  ChannelEventHandler,
  ChannelEvent,
  CardUpdateResult,
  SendMessageOptions,
} from '../types/channel';
import type { UnifiedReply } from '../types/message';

export abstract class BaseChannel implements IChannel {
  abstract readonly id: string;
  abstract readonly type: string;
  abstract readonly capabilities: ChannelCapabilities;

  protected connected = false;
  protected eventHandlers = new Map<ChannelEventType, Set<ChannelEventHandler>>();

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;

  isConnected(): boolean {
    return this.connected;
  }

  abstract sendMessage(chatId: string, message: UnifiedReply, options?: SendMessageOptions): Promise<string>;
  abstract updateMessage(messageId: string, message: UnifiedReply): Promise<CardUpdateResult>;
  abstract recallMessage(messageId: string): Promise<boolean>;
  abstract downloadAttachment(attachmentId: string): Promise<Buffer>;
  abstract getUserInfo(userId: string): Promise<{ id: string; name: string; avatar?: string }>;

  on<T extends ChannelEventType>(event: T, handler: ChannelEventHandler): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off<T extends ChannelEventType>(event: T, handler: ChannelEventHandler): void {
    this.eventHandlers.get(event)?.delete(handler);
  }

  hasCapability(capability: ChannelCapability): boolean {
    return this.capabilities.supported.includes(capability);
  }

  protected async emit(event: ChannelEvent): Promise<void> {
    const handlers = this.eventHandlers.get(event.type);
    if (!handlers) return;

    const promises = Array.from(handlers).map(handler => 
      handler(event).catch(err => {
        console.error(`Error in event handler for ${event.type}:`, err);
      })
    );
    await Promise.all(promises);
  }

  protected setConnected(value: boolean): void {
    this.connected = value;
  }
}
