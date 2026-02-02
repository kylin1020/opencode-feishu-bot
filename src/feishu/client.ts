/**
 * 飞书客户端模块
 * 封装飞书 SDK，提供消息收发和卡片操作功能
 */
import * as Lark from '@larksuiteoapi/node-sdk';
import { logger } from '../utils/logger';
import { DocumentReader, DocumentWriter, parseDocumentUrl, BlockReader, BlockWriter, MediaUploader } from './docs';
import type { DocumentContent, DocumentInfo, CreateDocumentOptions, DocumentResult, DocumentBlock, CreateBlockData } from './docs';
import { SheetReader, SheetWriter, parseSheetUrl } from './sheets';
import type { SpreadsheetInfo, SheetInfo, CellValue, CreateSpreadsheetOptions, SheetResult } from './sheets';
import { FeishuApiClient } from './api';

/** 飞书客户端配置 */
export interface FeishuConfig {
  appId: string;
  appSecret: string;
  domain?: string;
}

/** 消息事件数据 */
export interface MessageEvent {
  eventId: string;
  messageId: string;
  chatId: string;
  chatType: 'p2p' | 'group';
  senderId: string;
  senderType: string;
  messageType: string;
  content: string;
  createTime: string;
  mentions?: Array<{ key: string; id: string; name: string }>;
}

/** 消息处理回调函数类型 */
export type MessageHandler = (event: MessageEvent) => Promise<void>;

/** 卡片更新结果 */
export interface UpdateCardResult {
  success: boolean;
  rateLimited?: boolean;
}

/** 机器人进群事件 */
export interface BotAddedEvent {
  eventId: string;
  chatId: string;
  operatorId: string;
  chatName?: string;
}

/** 消息撤回事件 */
export interface MessageRecalledEvent {
  eventId: string;
  messageId: string;
  chatId: string;
  recallTime: string;
  recallType: 'message_owner' | 'group_owner' | 'group_manager' | 'enterprise_manager';
}

/** 机器人移出群事件 */
export interface BotRemovedEvent {
  eventId: string;
  chatId: string;
  operatorId: string;
}

/** 机器人菜单点击事件 */
export interface BotMenuEvent {
  eventId: string;
  eventKey: string;
  operatorId: string;
  operatorName?: string;
  chatId?: string;
  messageId?: string;
  timestamp: string;
}

/** 用户退群事件 */
export interface UserLeftChatEvent {
  eventId: string;
  chatId: string;
  operatorId: string;
  users: Array<{ userId: string; name?: string }>;
  chatName?: string;
}

/** 群解散事件 */
export interface ChatDisbandedEvent {
  eventId: string;
  chatId: string;
  operatorId: string;
  chatName?: string;
}

/** 卡片交互事件 */
export interface CardActionEvent {
  eventId: string;
  operatorId: string;
  chatId?: string;
  messageId?: string;
  action: {
    tag: string;
    value: Record<string, unknown>;
    option?: string;
    formValue?: Record<string, string | string[]>;
  };
}

export type BotAddedHandler = (event: BotAddedEvent) => Promise<void>;
export type MessageRecalledHandler = (event: MessageRecalledEvent) => Promise<void>;
export type BotRemovedHandler = (event: BotRemovedEvent) => Promise<void>;
export type BotMenuHandler = (event: BotMenuEvent) => Promise<void>;
export type UserLeftChatHandler = (event: UserLeftChatEvent) => Promise<void>;
export type ChatDisbandedHandler = (event: ChatDisbandedEvent) => Promise<void>;
export type CardActionHandler = (event: CardActionEvent) => Promise<void>;

/** 群聊菜单项 */
export interface ChatMenuItem {
  action_type: 'NONE' | 'REDIRECT_LINK';
  redirect_link?: {
    common_url?: string;
    ios_url?: string;
    android_url?: string;
    pc_url?: string;
    web_url?: string;
  };
  image_key?: string;
  name: string;
  i18n_names?: {
    zh_cn?: string;
    en_us?: string;
    ja_jp?: string;
  };
}

/** 群聊菜单树结构 */
export interface ChatMenuTree {
  chat_menu_top_levels: Array<{
    chat_menu_item: ChatMenuItem;
    children?: Array<{
      chat_menu_item: ChatMenuItem;
    }>;
  }>;
}

/** 原始消息事件数据结构 */
interface RawMessageEventData {
  header?: {
    event_id?: string;
  };
  event?: {
    sender?: {
      sender_id?: { open_id?: string };
      sender_type?: string;
    };
    message?: {
      message_id?: string;
      chat_id?: string;
      chat_type?: string;
      message_type?: string;
      content?: string;
      create_time?: string;
      mentions?: Array<{
        key?: string;
        id?: { open_id?: string };
        name?: string;
      }>;
    };
  };
}

type EventSender = NonNullable<NonNullable<RawMessageEventData['event']>['sender']>;
type EventMessage = NonNullable<NonNullable<RawMessageEventData['event']>['message']>;

/** 飞书客户端类 */
export class FeishuClient {
  private client: Lark.Client;
  private wsClient: Lark.WSClient;
  private appId: string;
  private appSecret: string;
  private apiClient: FeishuApiClient;
  private messageHandler: MessageHandler | null = null;
  private botAddedHandler: BotAddedHandler | null = null;
  private messageRecalledHandler: MessageRecalledHandler | null = null;
  private botRemovedHandler: BotRemovedHandler | null = null;
  private botMenuHandler: BotMenuHandler | null = null;
  private userLeftChatHandler: UserLeftChatHandler | null = null;
  private chatDisbandedHandler: ChatDisbandedHandler | null = null;
  private cardActionHandler: CardActionHandler | null = null;
  private isConnected = false;
  private documentReader: DocumentReader;
  private documentWriter: DocumentWriter;
  private blockReader: BlockReader;
  private blockWriter: BlockWriter;
  private mediaUploader: MediaUploader;
  private sheetReader: SheetReader;
  private sheetWriter: SheetWriter;

  constructor(config: FeishuConfig) {
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    
    const baseConfig = {
      appId: config.appId,
      appSecret: config.appSecret,
      domain: config.domain ?? Lark.Domain.Feishu,
    };

    this.client = new Lark.Client(baseConfig);
    this.wsClient = new Lark.WSClient({
      appId: config.appId,
      appSecret: config.appSecret,
      loggerLevel: Lark.LoggerLevel.error,
    });

    // 创建原生 API 客户端（用于绕过 SDK 的连接问题）
    this.apiClient = new FeishuApiClient(config.appId, config.appSecret);

    // 使用原生 API 客户端的模块
    this.documentReader = new DocumentReader(this.apiClient);
    
    // 仍使用 SDK 的模块（这些暂时工作正常）
    this.documentWriter = new DocumentWriter(this.client);
    this.blockReader = new BlockReader(this.client);
    this.blockWriter = new BlockWriter(this.client);
    this.mediaUploader = new MediaUploader(this.client);
    this.sheetReader = new SheetReader(this.client);
    this.sheetWriter = new SheetWriter(this.client);
  }

  /** 注册消息处理回调 */
  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  onBotAdded(handler: BotAddedHandler): void {
    this.botAddedHandler = handler;
  }

  onMessageRecalled(handler: MessageRecalledHandler): void {
    this.messageRecalledHandler = handler;
  }

  onBotRemoved(handler: BotRemovedHandler): void {
    this.botRemovedHandler = handler;
  }

  onBotMenu(handler: BotMenuHandler): void {
    this.botMenuHandler = handler;
  }

  onUserLeftChat(handler: UserLeftChatHandler): void {
    this.userLeftChatHandler = handler;
  }

  onChatDisbanded(handler: ChatDisbandedHandler): void {
    this.chatDisbandedHandler = handler;
  }

  onCardAction(handler: CardActionHandler): void {
    this.cardActionHandler = handler;
  }

  /** 启动 WebSocket 连接 */
  async start(): Promise<void> {
    if (this.isConnected) {
      logger.warn('飞书客户端已连接');
      return;
    }

    const eventDispatcher = new Lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data) => {
        try {
          await this.handleMessageEvent(data);
        } catch (error) {
          logger.error('处理消息事件时出错', error);
        }
      },
      'im.chat.member.bot.added_v1': async (data) => {
        try {
          await this.handleBotAddedEvent(data);
        } catch (error) {
          logger.error('处理机器人进群事件时出错', error);
        }
      },
      'im.message.recalled_v1': async (data) => {
        try {
          await this.handleMessageRecalledEvent(data);
        } catch (error) {
          logger.error('处理消息撤回事件时出错', error);
        }
      },
      'im.chat.member.bot.deleted_v1': async (data) => {
        try {
          await this.handleBotRemovedEvent(data);
        } catch (error) {
          logger.error('处理机器人移出群事件时出错', error);
        }
      },
      'application.bot.menu_v6': async (data) => {
        try {
          await this.handleBotMenuEvent(data);
        } catch (error) {
          logger.error('处理菜单点击事件时出错', error);
        }
      },
      'im.chat.member.user.deleted_v1': async (data) => {
        try {
          await this.handleUserLeftChatEvent(data);
        } catch (error) {
          logger.error('处理用户退群事件时出错', error);
        }
      },
      'im.chat.disbanded_v1': async (data) => {
        try {
          await this.handleChatDisbandedEvent(data);
        } catch (error) {
          logger.error('处理群解散事件时出错', error);
        }
      },
      'card.action.trigger': async (data: unknown) => {
        try {
          await this.handleCardActionEvent(data);
        } catch (error) {
          logger.error('处理卡片交互事件时出错', error);
        }
      },
    });

    await this.wsClient.start({ eventDispatcher });
    this.isConnected = true;
    logger.info('飞书 WebSocket 已连接');
  }

  /** 处理消息事件 */
  private async handleMessageEvent(rawData: unknown): Promise<void> {
    const data = this.extractEventData(rawData);
    if (!data) {
      logger.warn('无效的消息事件结构');
      return;
    }

    const { header, event } = data;

    if (!event?.message || !event?.sender) {
      logger.warn('无效的消息事件：缺少 message 或 sender');
      return;
    }

    const chatType = event.message.chat_type as 'p2p' | 'group';
    const mentions = event.message.mentions?.map(m => ({
      key: m.key ?? '',
      id: m.id?.open_id ?? '',
      name: m.name ?? '',
    }));

    const messageEvent: MessageEvent = {
      eventId: header?.event_id ?? '',
      messageId: event.message.message_id ?? '',
      chatId: event.message.chat_id ?? '',
      chatType,
      senderId: event.sender.sender_id?.open_id ?? '',
      senderType: event.sender.sender_type ?? '',
      messageType: event.message.message_type ?? '',
      content: event.message.content ?? '',
      createTime: event.message.create_time ?? '',
      mentions,
    };

    if (this.messageHandler) {
      await this.messageHandler(messageEvent);
    }
  }

  private async handleBotAddedEvent(rawData: unknown): Promise<void> {
    if (!rawData || typeof rawData !== 'object') {
      logger.warn('无效的机器人进群事件结构');
      return;
    }

    const data = rawData as Record<string, unknown>;
    const eventId = (data.event_id as string) ?? '';
    const chatId = (data.chat_id as string) ?? '';
    const operatorId = (data.operator_id as { open_id?: string })?.open_id ?? '';
    const chatName = (data.name as string) ?? (data.i18n_names as { zh_cn?: string })?.zh_cn;

    if (!chatId) {
      logger.warn('机器人进群事件缺少 chat_id');
      return;
    }

    const event: BotAddedEvent = { eventId, chatId, operatorId, chatName };

    if (this.botAddedHandler) {
      await this.botAddedHandler(event);
    }
  }

  private async handleMessageRecalledEvent(rawData: unknown): Promise<void> {
    if (!rawData || typeof rawData !== 'object') {
      logger.warn('无效的消息撤回事件结构');
      return;
    }

    const data = rawData as Record<string, unknown>;
    const eventId = (data.event_id as string) ?? '';
    const messageId = (data.message_id as string) ?? '';
    const chatId = (data.chat_id as string) ?? '';
    const recallTime = (data.recall_time as string) ?? '';
    const recallType = (data.recall_type as MessageRecalledEvent['recallType']) ?? 'message_owner';

    if (!messageId) {
      logger.warn('消息撤回事件缺少 message_id');
      return;
    }

    const event: MessageRecalledEvent = { eventId, messageId, chatId, recallTime, recallType };

    if (this.messageRecalledHandler) {
      await this.messageRecalledHandler(event);
    }
  }

  private async handleBotRemovedEvent(rawData: unknown): Promise<void> {
    if (!rawData || typeof rawData !== 'object') {
      logger.warn('无效的机器人移出群事件结构');
      return;
    }

    const data = rawData as Record<string, unknown>;
    const eventId = (data.event_id as string) ?? '';
    const chatId = (data.chat_id as string) ?? '';
    const operatorId = (data.operator_id as { open_id?: string })?.open_id ?? '';

    if (!chatId) {
      logger.warn('机器人移出群事件缺少 chat_id');
      return;
    }

    const event: BotRemovedEvent = { eventId, chatId, operatorId };

    if (this.botRemovedHandler) {
      await this.botRemovedHandler(event);
    }
  }

  private async handleBotMenuEvent(rawData: unknown): Promise<void> {
    if (!rawData || typeof rawData !== 'object') {
      logger.warn('无效的菜单点击事件结构');
      return;
    }

    const data = rawData as Record<string, unknown>;
    const eventId = (data.event_id as string) ?? '';
    const eventKey = (data.event_key as string) ?? '';
    const timestamp = (data.timestamp as string) ?? '';
    
    const operator = data.operator as { operator_id?: { open_id?: string }; operator_name?: string } | undefined;
    const operatorId = operator?.operator_id?.open_id ?? '';
    const operatorName = operator?.operator_name;

    if (!eventKey) {
      logger.warn('菜单点击事件缺少 event_key');
      return;
    }

    const event: BotMenuEvent = { 
      eventId, 
      eventKey, 
      operatorId, 
      operatorName,
      timestamp 
    };

    if (this.botMenuHandler) {
      await this.botMenuHandler(event);
    }
  }

  private async handleUserLeftChatEvent(rawData: unknown): Promise<void> {
    if (!rawData || typeof rawData !== 'object') {
      logger.warn('无效的用户退群事件结构');
      return;
    }

    const data = rawData as Record<string, unknown>;
    const eventId = (data.event_id as string) ?? '';
    const chatId = (data.chat_id as string) ?? '';
    const operatorId = (data.operator_id as { open_id?: string })?.open_id ?? '';
    const chatName = (data.name as string) ?? (data.i18n_names as { zh_cn?: string })?.zh_cn;
    
    const rawUsers = data.users as Array<{ name?: string; user_id?: { open_id?: string } }> | undefined;
    const users = rawUsers?.map(u => ({
      userId: u.user_id?.open_id ?? '',
      name: u.name,
    })) ?? [];

    if (!chatId) {
      logger.warn('用户退群事件缺少 chat_id');
      return;
    }

    const event: UserLeftChatEvent = { eventId, chatId, operatorId, users, chatName };

    if (this.userLeftChatHandler) {
      await this.userLeftChatHandler(event);
    }
  }

  private async handleChatDisbandedEvent(rawData: unknown): Promise<void> {
    if (!rawData || typeof rawData !== 'object') {
      logger.warn('无效的群解散事件结构');
      return;
    }

    const data = rawData as Record<string, unknown>;
    const eventId = (data.event_id as string) ?? '';
    const chatId = (data.chat_id as string) ?? '';
    const operatorId = (data.operator_id as { open_id?: string })?.open_id ?? '';
    const chatName = (data.name as string) ?? (data.i18n_names as { zh_cn?: string })?.zh_cn;

    if (!chatId) {
      logger.warn('群解散事件缺少 chat_id');
      return;
    }

    const event: ChatDisbandedEvent = { eventId, chatId, operatorId, chatName };

    if (this.chatDisbandedHandler) {
      await this.chatDisbandedHandler(event);
    }
  }

  private async handleCardActionEvent(rawData: unknown): Promise<void> {
    if (!rawData || typeof rawData !== 'object') {
      logger.warn('无效的卡片交互事件结构');
      return;
    }

    const data = rawData as Record<string, unknown>;
    const context = data.context as { open_chat_id?: string; open_message_id?: string } | undefined;
    
    logger.info('收到卡片交互原始数据', { 
      keys: Object.keys(data),
      open_chat_id: data.open_chat_id,
      open_message_id: data.open_message_id,
      context,
      action: data.action 
    });
    
    const eventId = (data.event_id as string) ?? '';
    const operatorId = (data.operator as { open_id?: string })?.open_id ?? '';
    const openChatId = (data.open_chat_id as string) ?? context?.open_chat_id ?? undefined;
    const openMessageId = (data.open_message_id as string) ?? context?.open_message_id ?? undefined;
    
    const actionData = data.action as { 
      tag?: string; 
      value?: Record<string, unknown>; 
      option?: string;
      form_value?: Record<string, string | string[]>;
    } | undefined;
    if (!actionData) {
      logger.warn('卡片交互事件缺少 action');
      return;
    }

    const event: CardActionEvent = {
      eventId,
      operatorId,
      chatId: openChatId,
      messageId: openMessageId,
      action: {
        tag: actionData.tag ?? '',
        value: actionData.value ?? {},
        option: actionData.option,
        formValue: actionData.form_value,
      },
    };

    if (this.cardActionHandler) {
      await this.cardActionHandler(event);
    }
  }

  /** 从原始数据中提取事件数据 */
  private extractEventData(rawData: unknown): RawMessageEventData | null {
    if (!rawData || typeof rawData !== 'object') {
      return null;
    }

    const data = rawData as Record<string, unknown>;
    
    let header = data.header as RawMessageEventData['header'];
    let event = data.event as RawMessageEventData['event'];
    
    // 兼容不同的事件数据格式
    if (!event && data.message) {
      const senderData = data.sender as EventSender | undefined;
      const messageData = data.message as EventMessage | undefined;
      event = {
        sender: senderData,
        message: messageData,
      };
      header = { event_id: data.event_id as string };
    }

    return { header, event };
  }

  /** 发送消息 */
  async sendMessage(chatId: string, content: string, msgType: 'text' | 'interactive' = 'text'): Promise<string | null> {
    try {
      const response = await this.client.im.v1.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: chatId,
          msg_type: msgType,
          content,
        },
      });

      if (response.code !== 0) {
        logger.error('发送消息失败', { code: response.code, msg: response.msg });
        return null;
      }

      return response.data?.message_id ?? null;
    } catch (error) {
      logger.error('发送消息时出错', error);
      return null;
    }
  }

  async sendMessageToUser(userId: string, content: string, msgType: 'text' | 'interactive' = 'text'): Promise<string | null> {
    try {
      const response = await this.client.im.v1.message.create({
        params: { receive_id_type: 'open_id' },
        data: {
          receive_id: userId,
          msg_type: msgType,
          content,
        },
      });

      if (response.code !== 0) {
        logger.error('发送用户消息失败', { code: response.code, msg: response.msg });
        return null;
      }

      return response.data?.message_id ?? null;
    } catch (error) {
      logger.error('发送用户消息时出错', error);
      return null;
    }
  }

  async sendCardToUser(userId: string, card: object): Promise<string | null> {
    const content = JSON.stringify(card);
    return this.sendMessageToUser(userId, content, 'interactive');
  }

  /** 发送文本消息 */
  async sendTextMessage(chatId: string, text: string): Promise<string | null> {
    const content = JSON.stringify({ text });
    return this.sendMessage(chatId, content, 'text');
  }

  /** 发送卡片消息 */
  async sendCard(chatId: string, card: object): Promise<string | null> {
    const content = JSON.stringify(card);
    return this.sendMessage(chatId, content, 'interactive');
  }

  /** 更新卡片消息 */
  async updateCard(messageId: string, card: object): Promise<UpdateCardResult> {
    try {
      const content = JSON.stringify(card);
      logger.debug('updateCard 调用', { messageId, contentLength: content.length, contentPreview: content.substring(0, 500) });
      
      const response = await this.client.im.v1.message.patch({
        path: { message_id: messageId },
        data: {
          content,
          msg_type: 'interactive',
        } as { content: string },
      });
      
      logger.debug('updateCard response', { code: response.code, msg: response.msg, data: response.data });

      if (response.code !== 0) {
        const isRateLimited = response.code === 230020;
        if (!isRateLimited) {
          logger.error('更新卡片失败', { code: response.code, msg: response.msg });
        }
        return { success: false, rateLimited: isRateLimited };
      }

      return { success: true };
    } catch (error) {
      const axiosError = error as { response?: { data?: { code?: number } } };
      const isRateLimited = axiosError?.response?.data?.code === 230020;
      if (!isRateLimited) {
        logger.error('更新卡片时出错', error);
      }
      return { success: false, rateLimited: isRateLimited };
    }
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    try {
      const response = await this.client.im.v1.message.delete({
        path: { message_id: messageId },
      });

      if (response.code !== 0) {
        logger.error('撤回消息失败', { code: response.code, msg: response.msg });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('撤回消息时出错', error);
      return false;
    }
  }

  async createChat(name: string, userIds: string[]): Promise<{ chatId: string; shareLink?: string } | null> {
    try {
      const response = await this.client.im.v1.chat.create({
        params: { 
          user_id_type: 'open_id',
          set_bot_manager: true,
        },
        data: {
          name,
          user_id_list: userIds,
          chat_type: 'private',
          join_message_visibility: 'only_owner',
          leave_message_visibility: 'only_owner',
          membership_approval: 'no_approval_required',
        },
      });

      if (response.code !== 0) {
        logger.error('创建群失败', { code: response.code, msg: response.msg });
        return null;
      }

      const chatId = response.data?.chat_id;
      if (!chatId) {
        logger.error('创建群成功但未返回 chat_id');
        return null;
      }

      return { chatId };
    } catch (error) {
      logger.error('创建群时出错', error);
      return null;
    }
  }

  async updateChatName(chatId: string, name: string): Promise<boolean> {
    try {
      const response = await this.client.im.v1.chat.update({
        path: { chat_id: chatId },
        data: { name },
      });

      if (response.code !== 0) {
        logger.error('更新群名失败', { code: response.code, msg: response.msg });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('更新群名时出错', error);
      return false;
    }
  }

  async deleteChat(chatId: string): Promise<boolean> {
    try {
      const response = await this.client.im.v1.chat.delete({
        path: { chat_id: chatId },
      });

      if (response.code !== 0) {
        logger.error('解散群失败', { code: response.code, msg: response.msg });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('解散群时出错', error);
      return false;
    }
  }

  async getChatInfo(chatId: string): Promise<{ name?: string; userCount?: number } | null> {
    try {
      const response = await this.client.im.v1.chat.get({
        path: { chat_id: chatId },
        params: { user_id_type: 'open_id' },
      });

      if (response.code !== 0) {
        logger.error('获取群信息失败', { code: response.code, msg: response.msg });
        return null;
      }

      return {
        name: response.data?.name,
        userCount: response.data?.user_count ? parseInt(response.data.user_count, 10) : undefined,
      };
    } catch (error) {
      logger.error('获取群信息时出错', error);
      return null;
    }
  }

  async pinMessage(messageId: string): Promise<boolean> {
    try {
      const response = await this.client.im.v1.pin.create({
        data: { message_id: messageId },
      });

      if (response.code !== 0) {
        logger.error('置顶消息失败', { code: response.code, msg: response.msg, messageId });
        return false;
      }

      logger.info('置顶消息成功', { messageId });
      return true;
    } catch (error) {
      logger.error('置顶消息时出错', { messageId, error });
      return false;
    }
  }

  async unpinMessage(messageId: string): Promise<boolean> {
    try {
      const response = await this.client.im.v1.pin.delete({
        path: { message_id: messageId },
      });

      if (response.code !== 0) {
        logger.error('取消置顶失败', { code: response.code, msg: response.msg, messageId });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('取消置顶时出错', { messageId, error });
      return false;
    }
  }

  /** 创建群聊菜单 */
  async createChatMenu(chatId: string, menuTree: ChatMenuTree): Promise<boolean> {
    try {
      const response = await this.client.im.v1.chatMenuTree.create({
        path: { chat_id: chatId },
        data: { menu_tree: menuTree },
      });

      if (response.code !== 0) {
        logger.error('创建群聊菜单失败', { code: response.code, msg: response.msg, chatId });
        return false;
      }

      logger.info('创建群聊菜单成功', { chatId });
      return true;
    } catch (error) {
      logger.error('创建群聊菜单时出错', { chatId, error });
      return false;
    }
  }

  /** 删除群聊菜单 */
  async deleteChatMenu(chatId: string, menuIds: string[]): Promise<boolean> {
    try {
      const response = await this.client.im.v1.chatMenuTree.delete({
        path: { chat_id: chatId },
        data: {
          chat_menu_top_level_ids: menuIds,
        },
      });

      if (response.code !== 0) {
        logger.error('删除群聊菜单失败', { code: response.code, msg: response.msg, chatId });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('删除群聊菜单时出错', { chatId, error });
      return false;
    }
  }

  /** 获取群聊菜单 */
  async getChatMenu(chatId: string): Promise<ChatMenuTree | null> {
    try {
      const response = await this.client.im.v1.chatMenuTree.get({
        path: { chat_id: chatId },
      });

      if (response.code !== 0) {
        logger.error('获取群聊菜单失败', { code: response.code, msg: response.msg, chatId });
        return null;
      }

      return response.data?.menu_tree as ChatMenuTree ?? null;
    } catch (error) {
      logger.error('获取群聊菜单时出错', { chatId, error });
      return null;
    }
  }

  async getMessageImage(messageId: string, imageKey: string): Promise<{ data: Buffer; mimeType: string } | null> {
    return this.apiClient.getMessageImage(messageId, imageKey);
  }

  setDefaultDocumentFolder(folderToken: string): void {
    this.documentWriter.setDefaultFolder(folderToken);
  }

  async readDocument(urlOrToken: string): Promise<DocumentResult<DocumentContent>> {
    return this.documentReader.readDocument(urlOrToken);
  }

  async getDocumentInfo(documentId: string): Promise<DocumentResult<DocumentInfo>> {
    return this.documentReader.getDocumentInfo(documentId);
  }

  async createDocument(options: CreateDocumentOptions): Promise<DocumentResult<DocumentInfo>> {
    return this.documentWriter.createDocument(options);
  }

  async writeToDocument(urlOrToken: string, content: string): Promise<DocumentResult<void>> {
    return this.documentWriter.writeToDocument(urlOrToken, content);
  }

  /** 追加内容到文档 */
  async appendToDocument(urlOrToken: string, content: string): Promise<DocumentResult<void>> {
    const parsed = parseDocumentUrl(urlOrToken);
    if (parsed.type !== 'docx' && parsed.type !== 'doc') {
      return { success: false, error: `不支持此类型文档: ${parsed.type}` };
    }
    return this.documentWriter.appendContent(parsed.token, content);
  }

  /** 替换文档内容 */
  async replaceDocumentContent(urlOrToken: string, content: string): Promise<DocumentResult<void>> {
    const parsed = parseDocumentUrl(urlOrToken);
    if (parsed.type !== 'docx' && parsed.type !== 'doc') {
      return { success: false, error: `不支持此类型文档: ${parsed.type}` };
    }
    return this.documentWriter.replaceContent(parsed.token, content);
  }

  /** 获取文档所有块 */
  async getDocumentBlocks(urlOrToken: string): Promise<DocumentResult<DocumentBlock[]>> {
    const parsed = parseDocumentUrl(urlOrToken);
    if (parsed.type !== 'docx' && parsed.type !== 'doc') {
      return { success: false, error: `不支持此类型文档: ${parsed.type}` };
    }
    return this.blockReader.getBlocks(parsed.token);
  }

  /** 创建文档块 */
  async createDocumentBlocks(
    urlOrToken: string,
    blocks: CreateBlockData[],
    parentBlockId?: string,
    index?: number
  ): Promise<DocumentResult<{ blockIds: string[] }>> {
    const parsed = parseDocumentUrl(urlOrToken);
    if (parsed.type !== 'docx' && parsed.type !== 'doc') {
      return { success: false, error: `不支持此类型文档: ${parsed.type}` };
    }
    
    let targetParentId = parentBlockId;
    if (!targetParentId) {
      const rootResult = await this.blockReader.getRootBlock(parsed.token);
      if (!rootResult.success || !rootResult.data) {
        return { success: false, error: rootResult.error || '获取根块失败' };
      }
      targetParentId = rootResult.data.blockId;
    }
    
    return this.blockWriter.createChildren(parsed.token, targetParentId, blocks, index);
  }

  /** 上传图片到文档 */
  async uploadDocumentImage(urlOrToken: string, imageData: Buffer, fileName?: string): Promise<DocumentResult<{ fileToken: string }>> {
    const parsed = parseDocumentUrl(urlOrToken);
    if (parsed.type !== 'docx' && parsed.type !== 'doc') {
      return { success: false, error: `不支持此类型文档: ${parsed.type}` };
    }
    return this.mediaUploader.uploadImage(parsed.token, imageData, { fileName });
  }

  // ============ 电子表格方法 ============

  /** 设置默认表格文件夹 */
  setDefaultSheetFolder(folderToken: string): void {
    this.sheetWriter.setDefaultFolder(folderToken);
  }

  /** 创建电子表格 */
  async createSpreadsheet(options: CreateSpreadsheetOptions): Promise<SheetResult<SpreadsheetInfo>> {
    return this.sheetWriter.createSpreadsheet(options);
  }

  /** 获取表格信息 */
  async getSpreadsheetInfo(urlOrToken: string): Promise<SheetResult<SpreadsheetInfo>> {
    return this.sheetReader.getSpreadsheetInfo(urlOrToken);
  }

  /** 获取所有工作表 */
  async getSheets(urlOrToken: string): Promise<SheetResult<SheetInfo[]>> {
    return this.sheetReader.getSheets(urlOrToken);
  }

  /** 读取表格数据 */
  async readSheetData(urlOrToken: string, range: string): Promise<SheetResult<CellValue[][]>> {
    return this.sheetReader.readRange(urlOrToken, range);
  }

  /** 写入表格数据 */
  async writeSheetData(urlOrToken: string, range: string, values: CellValue[][]): Promise<SheetResult<{ updatedCells: number }>> {
    const result = await this.sheetWriter.writeRange(urlOrToken, range, values);
    if (result.success && result.data) {
      return { success: true, data: { updatedCells: result.data.updatedCells } };
    }
    return { success: false, error: result.error };
  }

  /** 追加表格数据 */
  async appendSheetData(urlOrToken: string, range: string, values: CellValue[][]): Promise<SheetResult<{ updatedCells: number }>> {
    const result = await this.sheetWriter.appendData(urlOrToken, range, values);
    if (result.success && result.data) {
      return { success: true, data: { updatedCells: result.data.updatedCells } };
    }
    return { success: false, error: result.error };
  }

  /** 查找表格单元格 */
  async findInSheet(urlOrToken: string, sheetId: string, query: string): Promise<SheetResult<string[]>> {
    const result = await this.sheetReader.find(urlOrToken, sheetId, query);
    if (result.success && result.data) {
      return { success: true, data: result.data.matchedCells };
    }
    return { success: false, error: result.error };
  }

  /** 查找并替换表格内容 */
  async replaceInSheet(urlOrToken: string, sheetId: string, find: string, replacement: string): Promise<SheetResult<number>> {
    const result = await this.sheetWriter.replace(urlOrToken, sheetId, find, replacement);
    if (result.success && result.data) {
      return { success: true, data: result.data.replacedCount };
    }
    return { success: false, error: result.error };
  }

  /** 获取底层读写器（高级用法） */
  getBlockReader(): BlockReader {
    return this.blockReader;
  }

  getBlockWriter(): BlockWriter {
    return this.blockWriter;
  }

  getMediaUploader(): MediaUploader {
    return this.mediaUploader;
  }

  getSheetReader(): SheetReader {
    return this.sheetReader;
  }

  getSheetWriter(): SheetWriter {
    return this.sheetWriter;
  }

  /** 获取飞书 SDK 客户端（用于 SDK 原生调用） */
  getLarkClient(): Lark.Client {
    return this.client;
  }

  /** 获取原生 API 客户端（绕过 SDK 的 axios） */
  getFeishuApiClient(): FeishuApiClient {
    return this.apiClient;
  }

  /**
   * @deprecated 使用 getLarkClient() 替代
   */
  getApiClient(): Lark.Client {
    return this.client;
  }

  /** 检查连接状态 */
  isReady(): boolean {
    return this.isConnected;
  }

  /** 停止客户端 */
  async stop(): Promise<void> {
    this.isConnected = false;
    logger.info('飞书客户端已停止');
  }
}

/** 解析文本消息内容 */
export function parseTextContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    return parsed.text ?? '';
  } catch {
    return '';
  }
}

/** 解析图片消息内容，返回 image_key */
export function parseImageContent(content: string): string | null {
  try {
    const parsed = JSON.parse(content);
    return parsed.image_key ?? null;
  } catch {
    return null;
  }
}

export function cleanMentionsFromText(text: string, mentions?: Array<{ key: string }>): string {
  if (!mentions || mentions.length === 0) return text;
  
  let cleaned = text;
  for (const mention of mentions) {
    if (mention.key) {
      cleaned = cleaned.replace(new RegExp(`@${mention.key}\\s*`, 'g'), '');
    }
  }
  return cleaned.trim();
}

/** 创建飞书客户端实例 */
export function createFeishuClient(config: FeishuConfig): FeishuClient {
  return new FeishuClient(config);
}
