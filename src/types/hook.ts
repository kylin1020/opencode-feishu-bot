import type { UnifiedMessage, UnifiedReply, MessageContext } from './message';
import type { AnyAgentEvent } from './agent';
import type { AnyChannelEvent } from './channel';

export type HookEventType =
  | 'message.received'
  | 'message.sending'
  | 'message.sent'
  | 'session.created'
  | 'session.completed'
  | 'agent.switched'
  | 'error.occurred'
  | 'channel.connected'
  | 'channel.disconnected';

export interface HookEventBase {
  type: HookEventType;
  timestamp: number;
}

export interface MessageReceivedHook extends HookEventBase {
  type: 'message.received';
  message: UnifiedMessage;
  context: MessageContext;
}

export interface MessageSendingHook extends HookEventBase {
  type: 'message.sending';
  reply: UnifiedReply;
  context: MessageContext;
}

export interface MessageSentHook extends HookEventBase {
  type: 'message.sent';
  messageId: string;
  reply: UnifiedReply;
  context: MessageContext;
}

export interface SessionCreatedHook extends HookEventBase {
  type: 'session.created';
  sessionId: string;
  channelId: string;
  chatId: string;
  userId: string;
  projectPath: string;
}

export interface SessionCompletedHook extends HookEventBase {
  type: 'session.completed';
  sessionId: string;
  channelId: string;
  chatId: string;
  success: boolean;
  error?: string;
}

export interface AgentSwitchedHook extends HookEventBase {
  type: 'agent.switched';
  sessionId: string;
  fromAgent?: string;
  toAgent: string;
  reason?: string;
}

export interface ErrorOccurredHook extends HookEventBase {
  type: 'error.occurred';
  code: string;
  message: string;
  context?: {
    channelId?: string;
    chatId?: string;
    sessionId?: string;
  };
  stack?: string;
}

export interface ChannelConnectedHook extends HookEventBase {
  type: 'channel.connected';
  channelId: string;
  channelType: string;
}

export interface ChannelDisconnectedHook extends HookEventBase {
  type: 'channel.disconnected';
  channelId: string;
  channelType: string;
  reason?: string;
}

export type AnyHookEvent =
  | MessageReceivedHook
  | MessageSendingHook
  | MessageSentHook
  | SessionCreatedHook
  | SessionCompletedHook
  | AgentSwitchedHook
  | ErrorOccurredHook
  | ChannelConnectedHook
  | ChannelDisconnectedHook;

export type HookHandler<T extends AnyHookEvent = AnyHookEvent> = (event: T) => Promise<void>;

export interface HookRegistration {
  id: string;
  event: HookEventType;
  handler: HookHandler;
  priority: number;
  source: string;
}

export interface HookConfig {
  enabled: boolean;
  handlers?: Array<{
    event: HookEventType;
    path: string;
    priority?: number;
  }>;
}

export interface HookManager {
  register<T extends HookEventType>(
    event: T,
    handler: HookHandler,
    options?: { priority?: number; source?: string }
  ): string;
  
  unregister(id: string): void;
  
  emit<T extends AnyHookEvent>(event: T): Promise<void>;
  
  getHandlers(event: HookEventType): HookRegistration[];
}
