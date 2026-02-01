/**
 * Channel 类型定义
 * 定义渠道抽象层的核心接口
 */

import type { UnifiedMessage, UnifiedReply, MessageAttachment } from './message';

/** 渠道能力标识 */
export type ChannelCapability = 
  | 'text'           // 文本消息
  | 'image'          // 图片消息
  | 'file'           // 文件消息
  | 'card'           // 卡片消息
  | 'streaming'      // 流式更新
  | 'reaction'       // 消息反应
  | 'thread'         // 消息线程
  | 'mention'        // @提及
  | 'richtext'       // 富文本
  | 'document'       // 文档操作
  | 'sheet'          // 表格操作
  | 'group'          // 群组操作
  | 'recall';        // 消息撤回

/** 渠道能力配置 */
export interface ChannelCapabilities {
  /** 支持的能力列表 */
  supported: ChannelCapability[];
  /** 流式更新的最小间隔(ms) */
  streamingThrottleMs?: number;
  /** 单条消息最大长度 */
  maxMessageLength?: number;
  /** 单条消息最大附件数 */
  maxAttachments?: number;
}

/** 渠道配置基类 */
export interface ChannelConfig {
  /** 渠道唯一标识 */
  id: string;
  /** 渠道类型 */
  type: string;
  /** 是否启用 */
  enabled: boolean;
}

/** 渠道事件类型 */
export type ChannelEventType = 
  | 'message'           // 收到消息
  | 'message_recalled'  // 消息撤回
  | 'bot_added'         // 机器人被添加
  | 'bot_removed'       // 机器人被移除
  | 'member_added'      // 成员加入
  | 'member_removed'    // 成员离开
  | 'group_disbanded'   // 群组解散
  | 'card_action'       // 卡片交互
  | 'menu_action';      // 菜单点击

/** 渠道事件基类 */
export interface ChannelEvent {
  /** 事件类型 */
  type: ChannelEventType;
  /** 事件ID（用于去重） */
  eventId: string;
  /** 渠道ID */
  channelId: string;
  /** 时间戳 */
  timestamp: number;
  /** 原始事件数据 */
  raw?: unknown;
}

/** 消息事件 */
export interface MessageEvent extends ChannelEvent {
  type: 'message';
  /** 消息ID */
  messageId: string;
  /** 会话ID */
  chatId: string;
  /** 会话类型 */
  chatType: 'private' | 'group';
  /** 发送者ID */
  senderId: string;
  /** 发送者类型 */
  senderType: 'user' | 'bot';
  /** 消息类型 */
  messageType: string;
  /** 消息内容 */
  content: string;
  /** 附件列表 */
  attachments?: MessageAttachment[];
  /** @提及列表 */
  mentions?: Array<{ key: string; id: string; name: string }>;
}

/** 消息撤回事件 */
export interface MessageRecalledEvent extends ChannelEvent {
  type: 'message_recalled';
  /** 被撤回的消息ID */
  messageId: string;
  /** 会话ID */
  chatId: string;
  /** 撤回类型 */
  recallType: 'owner' | 'admin' | 'system';
}

/** 机器人事件 */
export interface BotEvent extends ChannelEvent {
  type: 'bot_added' | 'bot_removed';
  /** 会话ID */
  chatId: string;
  /** 操作者ID */
  operatorId: string;
  /** 群组名称 */
  chatName?: string;
}

/** 成员事件 */
export interface MemberEvent extends ChannelEvent {
  type: 'member_added' | 'member_removed';
  /** 会话ID */
  chatId: string;
  /** 成员ID列表 */
  memberIds: string[];
  /** 操作者ID */
  operatorId?: string;
}

/** 群组解散事件 */
export interface GroupDisbandedEvent extends ChannelEvent {
  type: 'group_disbanded';
  /** 会话ID */
  chatId: string;
  /** 操作者ID */
  operatorId?: string;
}

/** 卡片交互事件 */
export interface CardActionEvent extends ChannelEvent {
  type: 'card_action';
  /** 消息ID */
  messageId: string;
  /** 会话ID */
  chatId: string;
  /** 操作者ID */
  operatorId: string;
  /** 动作标识 */
  actionId: string;
  /** 动作值 */
  actionValue?: unknown;
}

/** 菜单点击事件 */
export interface MenuActionEvent extends ChannelEvent {
  type: 'menu_action';
  /** 操作者ID */
  operatorId: string;
  /** 会话ID（可能为空） */
  chatId?: string;
  /** 菜单事件key */
  eventKey: string;
}

/** 渠道事件联合类型 */
export type AnyChannelEvent = 
  | MessageEvent 
  | MessageRecalledEvent 
  | BotEvent 
  | MemberEvent 
  | GroupDisbandedEvent
  | CardActionEvent
  | MenuActionEvent;

/** 事件处理器 */
export type ChannelEventHandler<T extends ChannelEvent = ChannelEvent> = (event: T) => Promise<void>;

/** 卡片更新结果 */
export interface CardUpdateResult {
  success: boolean;
  rateLimited?: boolean;
  error?: string;
}

/** 发送消息选项 */
export interface SendMessageOptions {
  /** 回复的消息ID */
  replyTo?: string;
  /** 是否@所有人 */
  mentionAll?: boolean;
  /** @指定用户 */
  mentionUsers?: string[];
}

/** 渠道接口 */
export interface IChannel {
  /** 渠道唯一标识 */
  readonly id: string;
  /** 渠道类型 */
  readonly type: string;
  /** 渠道能力 */
  readonly capabilities: ChannelCapabilities;

  /** 连接渠道 */
  connect(): Promise<void>;
  /** 断开连接 */
  disconnect(): Promise<void>;
  /** 检查是否已连接 */
  isConnected(): boolean;

  /** 发送消息 */
  sendMessage(chatId: string, message: UnifiedReply, options?: SendMessageOptions): Promise<string>;
  /** 更新消息（用于流式） */
  updateMessage(messageId: string, message: UnifiedReply): Promise<CardUpdateResult>;
  /** 撤回消息 */
  recallMessage(messageId: string): Promise<boolean>;

  /** 注册事件处理器 */
  on<T extends ChannelEventType>(event: T, handler: ChannelEventHandler): void;
  /** 移除事件处理器 */
  off<T extends ChannelEventType>(event: T, handler: ChannelEventHandler): void;

  /** 检查是否支持某能力 */
  hasCapability(capability: ChannelCapability): boolean;
  
  /** 下载附件 */
  downloadAttachment(attachmentId: string): Promise<Buffer>;
  /** 获取用户信息 */
  getUserInfo(userId: string): Promise<{ id: string; name: string; avatar?: string }>;
}
