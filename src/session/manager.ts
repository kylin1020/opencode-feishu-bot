/**
 * 会话管理模块
 * 管理用户与 OpenCode 之间的会话生命周期
 */
import type { BotDatabase, SessionChat } from '../database';
import type { FeishuClient, MessageEvent } from '../feishu/client';
import { parseTextContent, cleanMentionsFromText, parseImageContent } from '../feishu/client';
import type { OpencodeWrapper, OpencodeEventData, ImageAttachment } from '../opencode/client';
import { extractTextFromPart, extractToolCallFromPart, parseModelId } from '../opencode/client';
import { CardStreamer, createCardStreamer } from '../feishu/streamer';
import { formatError } from '../feishu/formatter';
import { createQuestionCard, createAnsweredCard, type QuestionRequest, type QuestionInfo } from '../feishu/question-card';
import { logger } from '../utils/logger';

export interface SessionManagerConfig {
  defaultProjectPath: string;
  adminUserIds: string[];
  allowAllUsers: boolean;
}

interface ActiveSession {
  sessionId: string;
  chatId: string;
  userMessageId: string;
  streamer: CardStreamer;
  unsubscribe: (() => void) | null;
  parts: Array<{
    type: string;
    text?: string;
    name?: string;
    state?: string;
    title?: string;
    input?: Record<string, unknown>;
    output?: string;
    error?: string;
  }>;
  firstTextSkipped: boolean;
}

interface PendingQuestion {
  requestId: string;
  messageId: string;
  questions: QuestionInfo[];
  chatId: string;
}

export class SessionManager {
  private db: BotDatabase;
  private feishuClient: FeishuClient;
  private opencodeClient: OpencodeWrapper;
  private config: SessionManagerConfig;
  private activeSessions: Map<string, ActiveSession> = new Map();
  private messageQueue: Map<string, Promise<void>> = new Map();
  private pendingQuestions: Map<string, PendingQuestion> = new Map();

  constructor(
    db: BotDatabase,
    feishuClient: FeishuClient,
    opencodeClient: OpencodeWrapper,
    config: SessionManagerConfig
  ) {
    this.db = db;
    this.feishuClient = feishuClient;
    this.opencodeClient = opencodeClient;
    this.config = config;
  }

  async handleMessage(event: MessageEvent): Promise<void> {
    const { chatId, senderId, eventId, messageId, content, messageType, mentions, chatType } = event;

    if (this.db.isEventProcessed(eventId)) {
      return;
    }
    this.db.markEventProcessed(eventId);

    if (!this.isUserAuthorized(senderId)) {
      await this.sendUnauthorizedMessage(chatId);
      return;
    }

    const supportedTypes = ['text', 'image', 'post', 'file'];
    if (!supportedTypes.includes(messageType)) {
      logger.warn('不支持的消息类型', { messageType, chatId });
      await this.feishuClient.sendTextMessage(
        chatId,
        `暂不支持该消息类型 (${messageType})，目前支持：文本、图片、富文本`
      );
      return;
    }

    let text = '';
    let images: ImageAttachment[] = [];

    if (messageType === 'text') {
      text = parseTextContent(content);
      text = cleanMentionsFromText(text, mentions);
      
      if (!text.trim()) {
        return;
      }
    } else if (messageType === 'image') {
      const imageKey = parseImageContent(content);
      if (!imageKey) {
        await this.feishuClient.sendTextMessage(chatId, '无法解析图片内容');
        return;
      }
      
      const imageData = await this.feishuClient.getMessageImage(messageId, imageKey);
      if (!imageData) {
        await this.feishuClient.sendTextMessage(chatId, '获取图片失败，请重试');
        return;
      }
      
      images = [{
        data: imageData.data,
        mimeType: imageData.mimeType,
        filename: `${imageKey}.${imageData.mimeType.split('/')[1] || 'png'}`,
      }];
      text = '请分析这张图片';
    } else if (messageType === 'post') {
      const result = await this.parsePostContent(content, messageId);
      text = result.text;
      images = result.images;
      
      if (!text.trim() && images.length === 0) {
        return;
      }
      if (!text.trim() && images.length > 0) {
        text = '请分析这些图片';
      }
    } else if (messageType === 'file') {
      await this.feishuClient.sendTextMessage(chatId, '暂不支持文件消息，请直接发送图片或文本');
      return;
    }

    const sessionChat = this.db.getSessionChat(chatId);
    const isSessionChat = sessionChat !== null;

    if (chatType === 'group' && !isSessionChat) {
      return;
    }

    const pendingQuestion = this.pendingQuestions.get(chatId);
    if (pendingQuestion && messageType === 'text') {
      await this.handleQuestionTextAnswer(chatId, text, pendingQuestion);
      return;
    }

    try {
      this.db.saveMessageMapping(messageId, chatId);
    } catch (e) {
      logger.error('保存消息映射失败', e);
    }

    await this.queueMessage(chatId, async () => {
      await this.processMessage(chatId, senderId, messageId, text, images, isSessionChat ? sessionChat : undefined);
    });
  }

  private async queueMessage(chatId: string, handler: () => Promise<void>): Promise<void> {
    const existingPromise = this.messageQueue.get(chatId) ?? Promise.resolve();
    
    const newPromise = existingPromise.then(async () => {
      try {
        await handler();
      } catch (error) {
        logger.error('处理队列消息时出错', error);
      }
    });

    this.messageQueue.set(chatId, newPromise);
    await newPromise;
  }

  private async processMessage(chatId: string, senderId: string, userMessageId: string, text: string, images: ImageAttachment[], sessionChat?: SessionChat): Promise<void> {
    const isShellCommand = text.startsWith('!');
    const isSlashCommand = text.startsWith('/');
    
    const cardTitle = isShellCommand || isSlashCommand
      ? `执行 ${text.slice(0, 30)}${text.length > 30 ? '...' : ''}`
      : '思考中...';
    
    const streamer = createCardStreamer(this.feishuClient, chatId);
    streamer.setTitle(cardTitle);
    await streamer.start();
    
    let sessionId: string;
    
    if (sessionChat) {
      sessionId = sessionChat.session_id;
    } else {
      sessionId = await this.getOrCreateSession(chatId);
    }
    
    const activeSession: ActiveSession = {
      sessionId,
      chatId,
      userMessageId,
      streamer,
      unsubscribe: null,
      parts: [],
      firstTextSkipped: false,
    };
    
    this.activeSessions.set(chatId, activeSession);

    try {
      const unsubscribe = await this.opencodeClient.subscribeToEvents(
        sessionId,
        (event) => this.handleOpencodeEvent(chatId, event)
      );
      activeSession.unsubscribe = unsubscribe;

      if (isShellCommand) {
        const shellCommand = text.slice(1);
        const agents = await this.opencodeClient.listAgents();
        const primaryAgent = agents.find(a => a.mode === 'primary')?.name ?? agents[0]?.name ?? 'default';
        const modelId = sessionChat?.model;
        const model = modelId ? parseModelId(modelId) : undefined;
        await this.opencodeClient.executeShell(sessionId, shellCommand, primaryAgent, model ?? undefined);
      } else if (isSlashCommand) {
        const spaceIndex = text.indexOf(' ');
        const command = spaceIndex > 0 ? text.slice(1, spaceIndex) : text.slice(1);
        const args = spaceIndex > 0 ? text.slice(spaceIndex + 1) : '';
        await this.opencodeClient.executeCommand(sessionId, command, args);
      } else {
        await this.opencodeClient.sendPrompt(sessionId, text, images.length > 0 ? images : undefined);
      }
      
    } catch (error) {
      logger.error('发送提示时出错', { chatId, sessionId, error });
      await streamer.sendError(error instanceof Error ? error.message : '未知错误');
      this.cleanupSession(chatId);
    }
  }

  private async setSessionChatTitle(chatId: string, title: string, sessionId: string): Promise<void> {
    const maxLength = 60;
    const shortId = sessionId.replace(/^ses_/, '').slice(0, 8);
    const prefix = `o-${shortId}-`;
    const availableLength = maxLength - prefix.length;
    const truncatedTitle = title.length > availableLength 
      ? title.slice(0, availableLength - 3) + '...'
      : title;
    const chatName = `${prefix}${truncatedTitle}`;
    
    const success = await this.feishuClient.updateChatName(chatId, chatName);
    if (success) {
      this.db.updateSessionChatTitle(chatId, title);
    }
  }

  private async handleOpencodeEvent(chatId: string, event: OpencodeEventData): Promise<void> {
    const session = this.activeSessions.get(chatId);
    if (!session) return;

    const { streamer, parts } = session;
    const properties = event.properties as Record<string, unknown>;

    switch (event.type) {
      case 'message.part.updated': {
        const part = properties.part as Record<string, unknown>;
        if (!part) break;

        const partId = part.id as string;
        
        const formattedPart = this.formatPart(part);
        if (!formattedPart) break;
        
        if (formattedPart.type === 'text' && !session.firstTextSkipped) {
          session.firstTextSkipped = true;
          break;
        }
        
        const existingIndex = parts.findIndex(p => (p as Record<string, unknown>).id === partId);
        if (existingIndex >= 0) {
          parts[existingIndex] = { ...formattedPart, id: partId } as typeof parts[0];
        } else {
          parts.push({ ...formattedPart, id: partId } as typeof parts[0]);
        }
        
        await streamer.setParts(parts);
        
        const botMessageId = streamer.getMessageId();
        if (botMessageId && session.userMessageId) {
          this.db.updateBotMessageId(session.userMessageId, botMessageId);
        }
        break;
      }

      case 'session.idle': {
        const info = properties.info as Record<string, unknown>;
        const sessionInfo = info as { sessionID?: string };
        
        if (sessionInfo?.sessionID === session.sessionId) {
          await streamer.complete();
          this.cleanupSession(chatId);
        }
        break;
      }

      case 'session.error': {
        const errorInfo = properties as { error?: { message?: string } };
        const errorMessage = errorInfo.error?.message ?? '发生未知错误';
        logger.error('会话错误', { chatId, error: errorMessage });
        await streamer.sendError(errorMessage);
        this.cleanupSession(chatId);
        break;
      }

      case 'message.updated': {
        const info = properties.info as Record<string, unknown>;
        if (info?.error) {
          const error = info.error as { data?: { message?: string } };
          const errorMessage = error.data?.message ?? '消息处理错误';
          logger.error('消息错误', { chatId, error: errorMessage });
          await streamer.sendError(errorMessage);
          this.cleanupSession(chatId);
        }
        break;
      }

      case 'session.updated': {
        const info = properties.info as { id?: string; title?: string };
        if (info?.id === session.sessionId && info?.title) {
          const sessionChat = this.db.getSessionChat(chatId);
          if (sessionChat) {
            await this.setSessionChatTitle(chatId, info.title, session.sessionId);
          }
        }
        break;
      }

      case 'question.asked': {
        const questionRequest = properties as unknown as QuestionRequest;
        if (questionRequest?.id && questionRequest?.questions?.length > 0) {
          await this.handleQuestionAsked(chatId, questionRequest);
        }
        break;
      }
    }
  }

  private formatPart(part: Record<string, unknown>): {
    type: string;
    text?: string;
    name?: string;
    state?: string;
    title?: string;
    input?: Record<string, unknown>;
    output?: string;
    error?: string;
  } | null {
    const textResult = extractTextFromPart(part);
    if (textResult !== null) {
      return {
        type: part.type as string,
        text: textResult.startsWith('[思考中]') 
          ? textResult.replace('[思考中] ', '')
          : textResult,
      };
    }

    const toolResult = extractToolCallFromPart(part);
    if (toolResult !== null) {
      return {
        type: 'tool-call',
        name: toolResult.name,
        state: toolResult.state,
        title: toolResult.title,
        input: toolResult.input,
        output: toolResult.output,
        error: toolResult.error,
      };
    }

    return null;
  }

  private async handleQuestionAsked(chatId: string, request: QuestionRequest): Promise<void> {
    const card = createQuestionCard(request);
    const messageId = await this.feishuClient.sendCard(chatId, card);
    
    if (messageId) {
      this.pendingQuestions.set(chatId, {
        requestId: request.id,
        messageId,
        questions: request.questions,
        chatId,
      });
      logger.info('收到问题请求', { chatId, requestId: request.id, questionCount: request.questions.length });
    }
  }

  private async handleQuestionTextAnswer(chatId: string, text: string, pending: PendingQuestion): Promise<void> {
    const answers = pending.questions.map(() => [text]);
    const success = await this.opencodeClient.replyQuestion(pending.requestId, answers);
    
    if (success) {
      const firstQuestion = pending.questions[0]?.question || '问题';
      const answeredCard = createAnsweredCard(firstQuestion, text);
      await this.feishuClient.updateCard(pending.messageId, answeredCard);
      logger.info('文字回答问题', { chatId, requestId: pending.requestId, answer: text });
    } else {
      await this.feishuClient.sendTextMessage(chatId, '提交答案失败，请重试');
    }
    
    this.pendingQuestions.delete(chatId);
  }

  async handleQuestionAnswer(chatId: string, requestId: string, questionIndex: number, answerLabel: string, messageId?: string): Promise<boolean> {
    const pending = this.pendingQuestions.get(chatId);
    if (!pending || pending.requestId !== requestId) {
      return false;
    }

    const answers = pending.questions.map((_, idx) => 
      idx === questionIndex ? [answerLabel] : []
    );
    
    const success = await this.opencodeClient.replyQuestion(requestId, answers);
    
    if (success && messageId) {
      const firstQuestion = pending.questions[0]?.question || '问题';
      const answeredCard = createAnsweredCard(firstQuestion, answerLabel);
      await this.feishuClient.updateCard(messageId, answeredCard);
    }
    
    this.pendingQuestions.delete(chatId);
    logger.info('卡片回答问题', { chatId, requestId, questionIndex, answerLabel });
    return success;
  }

  getPendingQuestion(chatId: string): PendingQuestion | undefined {
    return this.pendingQuestions.get(chatId);
  }

  private async parsePostContent(content: string, messageId: string): Promise<{ text: string; images: ImageAttachment[] }> {
    let text = '';
    const images: ImageAttachment[] = [];
    
    try {
      const parsed = JSON.parse(content);
      
      // 飞书富文本格式: { content: [[{tag, text/image_key}]] } 或直接是数组
      let postContent = parsed.content;
      if (!postContent && Array.isArray(parsed)) {
        postContent = parsed;
      }
      
      // 有时候 content 在 zh_cn/en_us 下
      if (!postContent && parsed.zh_cn?.content) {
        postContent = parsed.zh_cn.content;
      }
      if (!postContent && parsed.en_us?.content) {
        postContent = parsed.en_us.content;
      }
      
      if (!postContent) {
        logger.warn('富文本消息格式异常', { content: content.substring(0, 200) });
        return { text, images };
      }
      
      for (const paragraph of postContent) {
        if (!Array.isArray(paragraph)) continue;
        
        for (const element of paragraph) {
          if (element.tag === 'text') {
            text += element.text || '';
          } else if (element.tag === 'img') {
            const imageKey = element.image_key;
            if (imageKey) {
              const imageData = await this.feishuClient.getMessageImage(messageId, imageKey);
              if (imageData) {
                images.push({
                  data: imageData.data,
                  mimeType: imageData.mimeType,
                  filename: `${imageKey}.${imageData.mimeType.split('/')[1] || 'png'}`,
                });
              }
            }
          }
        }
        text += '\n';
      }
      
      text = text.trim();
    } catch (e) {
      logger.error('解析富文本消息失败', { error: e });
    }
    
    return { text, images };
  }

  private async getOrCreateSession(chatId: string): Promise<string> {
    const existingSession = this.db.getSession(chatId);
    if (existingSession) {
      return existingSession.session_id;
    }

    const projectPath = this.db.getProjectPath(chatId) ?? this.config.defaultProjectPath;
    const sessionId = await this.opencodeClient.createSession();
    
    this.db.upsertSession(chatId, sessionId, projectPath);
    
    return sessionId;
  }

  private cleanupSession(chatId: string): void {
    const session = this.activeSessions.get(chatId);
    if (session) {
      if (session.unsubscribe) {
        session.unsubscribe();
      }
      this.activeSessions.delete(chatId);
    }
  }

  private isUserAuthorized(userId: string): boolean {
    if (this.config.allowAllUsers) {
      return true;
    }
    if (this.config.adminUserIds.includes(userId)) {
      return true;
    }
    return this.db.isUserWhitelisted(userId);
  }

  private async sendUnauthorizedMessage(chatId: string): Promise<void> {
    await this.feishuClient.sendTextMessage(
      chatId,
      '你没有权限使用此机器人。请联系管理员申请访问权限。'
    );
  }

  async createNewSession(chatId: string): Promise<string> {
    this.cleanupSession(chatId);
    this.db.deleteSession(chatId);
    
    const projectPath = this.db.getProjectPath(chatId) ?? this.config.defaultProjectPath;
    const sessionId = await this.opencodeClient.createSession();
    
    this.db.upsertSession(chatId, sessionId, projectPath);
    
    return sessionId;
  }

  async switchProject(chatId: string, projectPath: string): Promise<void> {
    this.db.setProjectPath(chatId, projectPath);
    this.db.deleteSession(chatId);
    this.cleanupSession(chatId);
  }

  async abortCurrentSession(chatId: string): Promise<boolean> {
    const session = this.activeSessions.get(chatId);
    if (!session) {
      return false;
    }

    const result = await this.opencodeClient.abortSession(session.sessionId);
    if (result) {
      this.cleanupSession(chatId);
    }
    return result;
  }

  isAdmin(userId: string): boolean {
    return this.config.adminUserIds.includes(userId);
  }

  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  getDefaultProjectPath(): string {
    return this.config.defaultProjectPath;
  }

  async handleMessageRecall(userMessageId: string): Promise<{ aborted: boolean; botMessagesDeleted: number }> {
    const mapping = this.db.getMessageMapping(userMessageId);
    if (!mapping) {
      return { aborted: false, botMessagesDeleted: 0 };
    }

    const { chat_id: chatId } = mapping;
    
    const messagesToRecall = this.db.getMessageMappingsAfter(userMessageId, chatId);
    
    let aborted = false;
    const activeSession = this.activeSessions.get(chatId);
    if (activeSession) {
      aborted = await this.opencodeClient.abortSession(activeSession.sessionId);
      this.cleanupSession(chatId);
    }

    let botMessagesDeleted = 0;
    for (const msg of messagesToRecall) {
      if (msg.bot_message_id) {
        const deleted = await this.feishuClient.deleteMessage(msg.bot_message_id);
        if (deleted) botMessagesDeleted++;
      }
    }

    const userMessageIds = messagesToRecall.map(m => m.user_message_id);
    this.db.deleteMessageMappings(userMessageIds);

    logger.info('处理消息撤回', { 
      userMessageId, 
      aborted, 
      botMessagesDeleted,
      totalMessagesRecalled: messagesToRecall.length 
    });

    return { aborted, botMessagesDeleted };
  }

  cleanupChatData(chatId: string): void {
    this.cleanupSession(chatId);
    this.db.deleteSession(chatId);
    this.db.deleteMessageMappingsByChatId(chatId);
    logger.info('清理聊天数据', { chatId });
  }

  async getOrCreateUserSession(userId: string): Promise<string | null> {
    const chatId = `user:${userId}`;
    const existingSession = this.db.getSession(chatId);
    if (existingSession) {
      return existingSession.session_id;
    }
    
    const projectPath = this.db.getProjectPath(chatId) ?? this.config.defaultProjectPath;
    const sessionId = await this.opencodeClient.createSession();
    this.db.upsertSession(chatId, sessionId, projectPath);
    return sessionId;
  }

  async createNewUserSession(userId: string): Promise<string> {
    const chatId = `user:${userId}`;
    this.cleanupSession(chatId);
    this.db.deleteSession(chatId);
    
    const projectPath = this.db.getProjectPath(chatId) ?? this.config.defaultProjectPath;
    const sessionId = await this.opencodeClient.createSession();
    this.db.upsertSession(chatId, sessionId, projectPath);
    return sessionId;
  }

  async getUserSessionInfo(userId: string): Promise<{ sessionId: string; projectPath: string; isActive: boolean } | null> {
    const chatId = `user:${userId}`;
    const session = this.db.getSession(chatId);
    if (!session) {
      return null;
    }
    
    const isActive = this.activeSessions.has(chatId);
    return {
      sessionId: session.session_id,
      projectPath: session.project_path,
      isActive,
    };
  }

  async switchUserProject(userId: string, projectPath: string): Promise<void> {
    const chatId = `user:${userId}`;
    this.db.setProjectPath(chatId, projectPath);
    this.db.deleteSession(chatId);
    this.cleanupSession(chatId);
  }

  async createSessionChat(userId: string, projectPath: string): Promise<{ chatId: string; sessionId: string } | null> {
    const sessionId = await this.opencodeClient.createSession();
    const shortId = sessionId.replace(/^ses_/, '').slice(0, 8);
    const chatName = `o-${shortId}`;
    
    const result = await this.feishuClient.createChat(chatName, [userId]);
    if (!result) {
      return null;
    }
    
    try {
      this.db.createSessionChat(result.chatId, sessionId, userId, projectPath);
      logger.info('创建会话群', { chatId: result.chatId, sessionId, userId });
    } catch (e) {
      logger.error('保存会话群到数据库失败', e);
      return null;
    }
    
    return { chatId: result.chatId, sessionId };
  }

  async cleanupSessionChat(chatId: string): Promise<void> {
    const sessionChat = this.db.getSessionChat(chatId);
    if (!sessionChat) {
      return;
    }
    
    this.cleanupSession(chatId);
    this.db.deleteSessionChat(chatId);
    this.db.deleteMessageMappingsByChatId(chatId);
    logger.info('清理会话群', { chatId, sessionId: sessionChat.session_id });
  }

  async handleUserLeftSessionChat(chatId: string): Promise<void> {
    const sessionChat = this.db.getSessionChat(chatId);
    if (!sessionChat) return;
    
    this.cleanupSession(chatId);
    
    this.db.deleteSessionChat(chatId);
    this.db.deleteMessageMappingsByChatId(chatId);
    this.pendingQuestions.delete(chatId);
    
    const deleted = await this.feishuClient.deleteChat(chatId);
    if (!deleted) {
      logger.debug('群聊可能已自动删除', { chatId });
    }
    
    logger.info('用户退出，清理会话群', { chatId, sessionId: sessionChat.session_id });
  }

  getSessionChat(chatId: string): SessionChat | null {
    return this.db.getSessionChat(chatId);
  }

  getUserSessionChats(userId: string): SessionChat[] {
    return this.db.getSessionChatsByOwner(userId);
  }

  cleanup(): void {
    for (const chatId of this.activeSessions.keys()) {
      this.cleanupSession(chatId);
    }
    this.messageQueue.clear();
  }
}

export function createSessionManager(
  db: BotDatabase,
  feishuClient: FeishuClient,
  opencodeClient: OpencodeWrapper,
  config: SessionManagerConfig
): SessionManager {
  return new SessionManager(db, feishuClient, opencodeClient, config);
}
