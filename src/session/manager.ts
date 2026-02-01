/**
 * 会话管理模块
 * 管理用户与 OpenCode 之间的会话生命周期
 */
import type { BotDatabase, SessionChat } from '../database';
import type { FeishuClient, MessageEvent } from '../feishu/client';
import { parseTextContent, cleanMentionsFromText, parseImageContent } from '../feishu/client';
import type { OpencodeWrapper, OpencodeEventData, ImageAttachment } from '../opencode/client';
import { extractTextFromPart, extractToolCallFromPart, extractSubtaskFromPart, parseModelId } from '../opencode/client';
import { CardStreamer, createCardStreamer } from '../feishu/streamer';
import { formatError, type SubtaskMetadata } from '../feishu/formatter';
import { createQuestionCard, createAnsweredCard, createMultiAnsweredCard, type QuestionRequest, type QuestionInfo } from '../feishu/question-card';
import { logger } from '../utils/logger';

export interface SessionManagerConfig {
  defaultProjectPath: string;
  defaultModel?: string;
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
    subtask?: SubtaskMetadata;
    id?: string;
  }>;
  firstTextSkipped: boolean;
  childSessionToPartId: Map<string, string>;
  subtaskToolCounts: Map<string, number>;
  subtaskStartTimes: Map<string, number>;
  /** 问题回答后需要创建新卡片 */
  needsNewCard: boolean;
}

interface PendingQuestion {
  requestId: string;
  messageId: string;
  questions: QuestionInfo[];
  chatId: string;
  /** 每个问题的已选答案，索引对应问题序号 */
  answers: (string | null)[];
}

export class SessionManager {
  private db: BotDatabase;
  private feishuClient: FeishuClient;
  private opencodeClient: OpencodeWrapper;
  private config: SessionManagerConfig;
  private activeSessions: Map<string, ActiveSession> = new Map();
  private messageQueue: Map<string, Promise<void>> = new Map();

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

    const pendingQuestion = this.getPendingQuestion(chatId);
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
    
    try {
      await newPromise;
    } finally {
      // 清理已完成的队列条目，防止 Promise 链无限增长
      if (this.messageQueue.get(chatId) === newPromise) {
        this.messageQueue.delete(chatId);
      }
    }
  }

  private async processMessage(chatId: string, senderId: string, userMessageId: string, text: string, images: ImageAttachment[], sessionChat?: SessionChat): Promise<void> {
    const isShellCommand = text.startsWith('!');
    const isSlashCommand = text.startsWith('/');
    
    const streamer = createCardStreamer(this.feishuClient, chatId);
    if (isShellCommand || isSlashCommand) {
      streamer.setTitle(`执行 ${text.slice(0, 30)}${text.length > 30 ? '...' : ''}`);
    }
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
      childSessionToPartId: new Map(),
      subtaskToolCounts: new Map(),
      subtaskStartTimes: new Map(),
      needsNewCard: false,
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
        const modelId = sessionChat?.model || this.config.defaultModel;
        const model = modelId ? parseModelId(modelId) : undefined;
        logger.info('执行 shell 命令', { chatId, sessionId, modelId, model, sessionChatModel: sessionChat?.model, defaultModel: this.config.defaultModel });
        await this.opencodeClient.executeShell(sessionId, shellCommand, model ?? undefined);
      } else if (isSlashCommand) {
        const spaceIndex = text.indexOf(' ');
        const command = spaceIndex > 0 ? text.slice(1, spaceIndex) : text.slice(1);
        const args = spaceIndex > 0 ? text.slice(spaceIndex + 1) : '';
        await this.opencodeClient.executeCommand(sessionId, command, args);
      } else {
        const modelId = sessionChat?.model || this.config.defaultModel;
        const model = modelId ? parseModelId(modelId) : undefined;
        logger.info('发送提示消息', { chatId, sessionId, modelId, model, sessionChatModel: sessionChat?.model, defaultModel: this.config.defaultModel });
        await this.opencodeClient.sendPrompt(sessionId, text, images.length > 0 ? images : undefined, model ?? undefined);
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
    const properties = event.properties as Record<string, unknown>;
    
    if (event.type === 'question.asked') {
      const questionRequest = properties as unknown as QuestionRequest;
      if (questionRequest?.id && questionRequest?.questions?.length > 0) {
        await this.handleQuestionAsked(chatId, questionRequest);
      }
      return;
    }
    
    // question.replied 和 question.rejected 事件不需要处理，AI 会自动继续
    if (event.type === 'question.replied' || event.type === 'question.rejected') {
      return;
    }
    
    const session = this.activeSessions.get(chatId);
    if (!session) return;

    const { streamer, parts } = session;

    switch (event.type) {
      case 'message.part.updated': {
        const part = properties.part as Record<string, unknown>;
        if (!part) break;

        // 问题回答后，需要创建新卡片继续输出
        if (session.needsNewCard) {
          session.needsNewCard = false;
          session.parts = [];
          session.firstTextSkipped = false;
          // 清理旧 streamer 的定时器，防止竞态条件
          session.streamer.reset();
          // 创建新的 streamer
          const newStreamer = new CardStreamer(this.feishuClient, chatId);
          await newStreamer.start();
          session.streamer = newStreamer;
        }

        const { streamer, parts } = session;
        const partId = part.id as string;
        
        const subtaskInfo = extractSubtaskFromPart(part);
        if (subtaskInfo) {
          await this.handleSubtaskPart(session, subtaskInfo);
          break;
        }
        
        const formattedPart = this.formatPart(part);
        if (!formattedPart) break;
        
        if (formattedPart.type === 'text' && !session.firstTextSkipped) {
          session.firstTextSkipped = true;
          break;
        }
        
        if (formattedPart.type === 'tool-call' && formattedPart.name && streamer.isSubAgentTool(formattedPart.name)) {
          await this.handleSubAgentToolUpdateInline(session, partId, formattedPart);
        }
        
        if (formattedPart.type === 'tool-call') {
          const partSessionId = part.sessionID as string | undefined;
          const isChildSessionEvent = partSessionId && partSessionId !== session.sessionId;
          
          if (isChildSessionEvent) {
            const existingPartId = session.childSessionToPartId.get(partSessionId);
            if (existingPartId) {
              const count = session.subtaskToolCounts.get(existingPartId) ?? 0;
              const isRunning = formattedPart.state === 'running' || formattedPart.state === 'pending';
              session.subtaskToolCounts.set(existingPartId, isRunning ? count : count + 1);
              
              this.updateSubtaskPartInline(session, existingPartId, {
                toolCount: isRunning ? count : count + 1,
                currentTool: isRunning ? (formattedPart.title || formattedPart.name) : undefined,
              });
            }
          }
        }
        
        // 捕获子会话的文本输出，更新到 subtask 的 streamingText
        if (formattedPart.type === 'text' && formattedPart.text) {
          const partSessionId = part.sessionID as string | undefined;
          const isChildSessionEvent = partSessionId && partSessionId !== session.sessionId;
          
          if (isChildSessionEvent) {
            const existingPartId = session.childSessionToPartId.get(partSessionId);
            if (existingPartId) {
              this.updateSubtaskPartInline(session, existingPartId, {
                streamingText: formattedPart.text,
              });
            }
          }
        }
        
        const partSessionId = part.sessionID as string | undefined;
        const isChildSessionEvent = partSessionId && partSessionId !== session.sessionId;
        const isSubAgentToolCall = formattedPart.type === 'tool-call' && formattedPart.name && streamer.isSubAgentTool(formattedPart.name);
        
        if (!isChildSessionEvent && !isSubAgentToolCall) {
          const existingIndex = parts.findIndex(p => p.id === partId);
          if (existingIndex >= 0) {
            parts[existingIndex] = { ...formattedPart, id: partId };
          } else {
            parts.push({ ...formattedPart, id: partId });
          }
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
        const eventSessionId = (properties.sessionID as string) 
          ?? (info?.id as string) 
          ?? (info?.sessionID as string);
        
        if (eventSessionId && eventSessionId !== session.sessionId) {
          await this.handleChildSessionIdle(session, eventSessionId);
          break;
        }
        
        if (eventSessionId === session.sessionId || !eventSessionId) {
          await streamer.complete();
          this.cleanupSession(chatId);
        }
        break;
      }

      case 'session.created': {
        const info = properties.info as { id?: string; parentID?: string; title?: string };
        if (info?.parentID === session.sessionId && info?.id) {
          logger.debug('子会话创建', { childSessionId: info.id, parentSessionId: session.sessionId });
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
    time?: { start: number; end?: number };
  } | null {
    const textResult = extractTextFromPart(part);
    if (textResult !== null) {
      const partTime = part.time as { start: number; end?: number } | undefined;
      return {
        type: part.type as string,
        text: textResult.startsWith('[思考中]') 
          ? textResult.replace('[思考中] ', '')
          : textResult,
        time: partTime,
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
        time: toolResult.time,
      };
    }

    return null;
  }

  private async handleSubAgentToolUpdateInline(
    activeSession: ActiveSession,
    partId: string,
    formattedPart: {
      type: string;
      name?: string;
      state?: string;
      title?: string;
      input?: Record<string, unknown>;
      output?: string;
      error?: string;
    }
  ): Promise<void> {
    const { parts, streamer } = activeSession;
    const input = formattedPart.input ?? {};
    
    const description = (input.description as string) || formattedPart.title || '子任务';
    const agentType = (input.subagent_type as string) || (input.category as string) || 'agent';
    const prompt = input.prompt as string | undefined;
    
    if (!activeSession.subtaskStartTimes.has(partId)) {
      activeSession.subtaskStartTimes.set(partId, Date.now());
    }
    
    const existingIndex = parts.findIndex(p => p.id === partId);
    const toolCount = activeSession.subtaskToolCounts.get(partId) ?? 0;
    
    const subtaskMetadata: SubtaskMetadata = {
      agentType,
      description,
      toolCount,
      prompt,
    };
    
    const partWithSubtask = {
      ...formattedPart,
      id: partId,
      subtask: subtaskMetadata,
    };
    
    if (existingIndex >= 0) {
      const existing = parts[existingIndex];
      parts[existingIndex] = {
        ...partWithSubtask,
        subtask: {
          ...existing?.subtask,
          ...subtaskMetadata,
        },
      };
    } else {
      parts.push(partWithSubtask);
    }
    
    await streamer.setParts(parts);
  }

  private updateSubtaskPartInline(
    activeSession: ActiveSession,
    partId: string,
    updates: {
      toolCount?: number;
      currentTool?: string;
      summary?: { files: number; additions: number; deletions: number };
      conclusion?: string;
      state?: string;
      streamingText?: string;
    }
  ): void {
    const { parts } = activeSession;
    const existingIndex = parts.findIndex(p => p.id === partId);
    
    if (existingIndex >= 0) {
      const existing = parts[existingIndex];
      if (existing) {
        if (existing.subtask) {
          existing.subtask = {
            ...existing.subtask,
            ...updates,
          };
        }
        if (updates.state) {
          existing.state = updates.state;
        }
      }
    }
  }

  private async handleSubtaskPart(
    activeSession: ActiveSession,
    subtaskInfo: { id: string; sessionID: string; description: string; agent: string; prompt?: string }
  ): Promise<void> {
    const { parts, streamer } = activeSession;
    
    const runningDelegateTask = parts.find(p => 
      p.type === 'tool-call' && 
      p.name && 
      (p.name.toLowerCase() === 'delegate_task' || p.name.toLowerCase() === 'task') &&
      (p.state === 'running' || p.state === 'pending')
    );
    
    const partId = runningDelegateTask?.id ?? subtaskInfo.id;
    
    activeSession.childSessionToPartId.set(subtaskInfo.sessionID, partId);
    
    if (!activeSession.subtaskStartTimes.has(partId)) {
      activeSession.subtaskStartTimes.set(partId, Date.now());
    }
    
    const existingIndex = parts.findIndex(p => p.id === partId);
    const subtaskMetadata: SubtaskMetadata = {
      agentType: subtaskInfo.agent,
      description: subtaskInfo.description,
      toolCount: activeSession.subtaskToolCounts.get(partId) ?? 0,
      prompt: subtaskInfo.prompt,
    };
    
    if (existingIndex >= 0) {
      const existing = parts[existingIndex];
      if (existing) {
        existing.subtask = {
          ...existing.subtask,
          ...subtaskMetadata,
        };
      }
    } else {
      parts.push({
        type: 'tool-call',
        name: 'delegate_task',
        state: 'running',
        title: subtaskInfo.description,
        id: partId,
        subtask: subtaskMetadata,
      });
    }
    
    await streamer.setParts(parts);
  }

  private async handleChildSessionIdle(activeSession: ActiveSession, childSessionId: string): Promise<void> {
    const partId = activeSession.childSessionToPartId.get(childSessionId);
    if (!partId) return;
    
    const { parts, streamer } = activeSession;
    const toolCount = activeSession.subtaskToolCounts.get(partId) ?? 0;
    
    const sessionDetail = await this.opencodeClient.getSessionDetail(childSessionId);
    
    const updates: Partial<SubtaskMetadata> & { state?: string } = {
      toolCount,
      state: 'completed',
    };
    
    if (sessionDetail) {
      if (sessionDetail.summary) {
        updates.summary = {
          files: sessionDetail.summary.files,
          additions: sessionDetail.summary.additions,
          deletions: sessionDetail.summary.deletions,
        };
      }
      updates.conclusion = sessionDetail.title;
    }
    
    this.updateSubtaskPartInline(activeSession, partId, updates);
    await streamer.setParts(parts);
  }

  private async handleQuestionAsked(chatId: string, request: QuestionRequest): Promise<void> {
    // 完成当前流式卡片，为问题卡片腾出位置
    const session = this.activeSessions.get(chatId);
    if (session) {
      await session.streamer.complete();
      session.needsNewCard = true;
    }
    
    const card = createQuestionCard(request);
    const messageId = await this.feishuClient.sendCard(chatId, card);
    
    if (messageId) {
      const answers = new Array(request.questions.length).fill(null) as (string | null)[];
      this.db.savePendingQuestion(chatId, request.id, messageId, request.questions, answers);
    } else {
      logger.error('发送问题卡片失败', { chatId, requestId: request.id });
    }
  }

  private async handleQuestionTextAnswer(chatId: string, text: string, pending: PendingQuestion): Promise<void> {
    // 对于多问题场景，文字回答会应用到所有未回答的问题
    const unansweredIndices = pending.answers
      .map((a, idx) => a === null ? idx : -1)
      .filter(idx => idx >= 0);
    
    if (unansweredIndices.length === 0) {
      // 所有问题都已回答，忽略文字输入
      return;
    }

    // 将文字答案应用到所有未回答的问题
    for (const idx of unansweredIndices) {
      pending.answers[idx] = text;
    }
    
    // 现在所有问题都已回答，提交
    const answers = pending.answers.map(a => [a!]);
    const success = await this.opencodeClient.replyQuestion(pending.requestId, answers);
    
    if (success) {
      if (pending.questions.length === 1) {
        const firstQuestion = pending.questions[0]?.question || '问题';
        const answeredCard = createAnsweredCard(firstQuestion, text);
        await this.feishuClient.updateCard(pending.messageId, answeredCard);
      } else {
        const answeredCard = createMultiAnsweredCard(pending.questions, pending.answers as string[]);
        await this.feishuClient.updateCard(pending.messageId, answeredCard);
      }
      logger.info('文字回答问题', { chatId, requestId: pending.requestId, answer: text });
    } else {
      await this.feishuClient.sendTextMessage(chatId, '提交答案失败，请重试');
    }
    
    this.db.deletePendingQuestion(chatId);
  }

  async handleQuestionFormSubmit(
    chatId: string,
    formValue: Record<string, string | string[]>,
    messageId?: string
  ): Promise<boolean> {
    const pending = this.getPendingQuestion(chatId);
    if (!pending) {
      return false;
    }

    const answers: string[] = [];
    for (let i = 0; i < pending.questions.length; i++) {
      const q = pending.questions[i]!;
      const value = formValue[`q_${i}`];
      
      if (value === undefined) {
        return false;
      }

      if (Array.isArray(value)) {
        const selectedLabels = value.map(idx => q.options[Number(idx)]?.label || idx).join(', ');
        answers.push(selectedLabels);
      } else {
        const selectedLabel = q.options[Number(value)]?.label || value;
        answers.push(selectedLabel);
      }
    }

    const formattedAnswers = answers.map(a => [a]);
    const success = await this.opencodeClient.replyQuestion(pending.requestId, formattedAnswers);
    
    if (!success) {
      logger.error('提交答案到 OpenCode 失败', { chatId, requestId: pending.requestId });
    }

    this.db.deletePendingQuestion(chatId);
    return success;
  }

  getPendingQuestion(chatId: string): PendingQuestion | undefined {
    const record = this.db.getPendingQuestion(chatId);
    if (!record) return undefined;
    
    try {
      return {
        requestId: record.request_id,
        messageId: record.message_id,
        questions: JSON.parse(record.questions) as QuestionInfo[],
        chatId: record.chat_id,
        answers: JSON.parse(record.answers) as (string | null)[],
      };
    } catch {
      logger.warn('解析 pending question 失败', { chatId });
      return undefined;
    }
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
      // 清理 streamer 的定时器和资源，防止内存泄漏
      session.streamer.reset();
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

  getDefaultModel(): string | undefined {
    return this.config.defaultModel;
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
      this.db.createSessionChat(result.chatId, sessionId, userId, projectPath, this.config.defaultModel);
      logger.info('创建会话群', { chatId: result.chatId, sessionId, userId, model: this.config.defaultModel });
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
    this.db.deletePendingQuestion(chatId);
    
    const deleted = await this.feishuClient.deleteChat(chatId);
    if (!deleted) {
      logger.debug('群聊可能已自动删除', { chatId });
    }
    
    logger.info('用户退出，清理会话群', { chatId, sessionId: sessionChat.session_id });
  }

  getSessionChat(chatId: string): SessionChat | null {
    return this.db.getSessionChat(chatId);
  }

  updateSessionChatModel(chatId: string, model: string): void {
    logger.info('更新会话群模型', { chatId, model });
    this.db.updateSessionChatModel(chatId, model);
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
