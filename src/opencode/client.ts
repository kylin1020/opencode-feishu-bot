/**
 * OpenCode 客户端模块
 * 封装 OpenCode SDK，自动启动服务器并管理会话
 */
import { createOpencode, createOpencodeClient, createOpencodeServer, type OpencodeClient } from '@opencode-ai/sdk';
import type { Event, TextPart, ReasoningPart, ToolPart, Message } from '@opencode-ai/sdk/client';
import { logger } from '../utils/logger';

/** OpenCode 配置 */
export interface OpencodeConfig {
  directory?: string;
}

/** OpenCode 事件数据 */
export interface OpencodeEventData {
  type: string;
  properties: Record<string, unknown>;
}

export type EventCallback = (event: OpencodeEventData) => void;

export interface ImageAttachment {
  data: Buffer;
  mimeType: string;
  filename?: string;
}

/** OpenCode 服务器和客户端封装 */
export class OpencodeWrapper {
  private client: OpencodeClient | null = null;
  private serverCloseFn: (() => void) | null = null;
  private serverUrl: string | null = null;
  private directory?: string;

  constructor(config: OpencodeConfig) {
    this.directory = config.directory;
  }

  /** 启动 OpenCode 服务器（随机端口） */
  async start(): Promise<string> {
    if (this.client) {
      logger.warn('OpenCode 已启动');
      return this.serverUrl!;
    }

    logger.info('正在启动 OpenCode 服务器...');
    
    const { client, server } = await createOpencode({
      port: 0, // 随机端口
    });

    this.client = client;
    this.serverUrl = server.url;
    this.serverCloseFn = server.close;

    logger.info('OpenCode 服务器已启动', { url: this.serverUrl });
    return this.serverUrl;
  }

  /** 停止 OpenCode 服务器 */
  stop(): void {
    if (this.serverCloseFn) {
      logger.info('正在停止 OpenCode 服务器...');
      this.serverCloseFn();
      this.serverCloseFn = null;
      this.client = null;
      this.serverUrl = null;
      logger.info('OpenCode 服务器已停止');
    }
  }

  /** 获取服务器 URL */
  getServerUrl(): string | null {
    return this.serverUrl;
  }

  /** 检查是否已启动 */
  isStarted(): boolean {
    return this.client !== null;
  }

  private ensureClient(): OpencodeClient {
    if (!this.client) {
      throw new Error('OpenCode 未启动，请先调用 start()');
    }
    return this.client;
  }

  /** 创建新会话 */
  async createSession(): Promise<string> {
    const client = this.ensureClient();
    const response = await client.session.create({
      query: { directory: this.directory },
    });
    
    if (!response.data) {
      throw new Error('创建会话失败：未返回数据');
    }
    
    return response.data.id;
  }

  /** 发送提示消息 */
  async sendPrompt(sessionId: string, prompt: string, images?: ImageAttachment[], model?: { providerID: string; modelID: string }): Promise<void> {
    const client = this.ensureClient();
    
    logger.info('OpenCode sendPrompt', { sessionId, model, hasImages: images && images.length > 0 });
    
    const parts: Array<
      | { type: 'text'; text: string }
      | { type: 'file'; mime: string; url: string; filename?: string }
    > = [
      { type: 'text', text: prompt },
    ];
    
    if (images && images.length > 0) {
      for (const image of images) {
        const base64Data = image.data.toString('base64');
        const dataUrl = `data:${image.mimeType};base64,${base64Data}`;
        parts.push({
          type: 'file',
          mime: image.mimeType,
          url: dataUrl,
          filename: image.filename,
        });
      }
    }
    
    await client.session.promptAsync({
      path: { id: sessionId },
      query: { directory: this.directory },
      body: { parts, model },
    });
  }

  /** 中止会话 */
  async abortSession(sessionId: string): Promise<boolean> {
    try {
      const client = this.ensureClient();
      await client.session.abort({
        path: { id: sessionId },
        query: { directory: this.directory },
      });
      return true;
    } catch (error) {
      logger.error('中止会话失败', error);
      return false;
    }
  }

  /** 订阅事件流 */
  async subscribeToEvents(
    sessionId: string, 
    callback: EventCallback
  ): Promise<() => void> {
    const client = this.ensureClient();
    const abortController = new AbortController();
    const childSessionIds = new Set<string>();
    
    const eventResult = await client.event.subscribe({
      query: { directory: this.directory },
    });

    const processEvents = async () => {
      try {
        for await (const eventData of eventResult.stream) {
          if (abortController.signal.aborted) break;
          
          // client.event.subscribe() yields Event directly, NOT wrapped in { directory, payload }
          // (That wrapper format is only from client.global.event())
          const event = eventData as Event;
          if (!event || !event.type) continue;
          
          const properties = 'properties' in event ? event.properties : {};
          const eventInfo = properties as Record<string, unknown>;
          const info = eventInfo.info as Record<string, unknown> | undefined;
          const part = eventInfo.part as Record<string, unknown> | undefined;
          
          const eventSessionId = (eventInfo.sessionID ?? part?.sessionID ?? info?.id ?? info?.sessionID) as string | undefined;
          const parentId = info?.parentID as string | undefined;
          
          if (event.type === 'session.created' && parentId === sessionId && info?.id) {
            childSessionIds.add(info.id as string);
          }
          
          const isMainSession = eventSessionId === sessionId || !eventSessionId;
          const isChildSession = eventSessionId && childSessionIds.has(eventSessionId);
          const isNewChildSession = parentId === sessionId;
          
          if (isMainSession || isChildSession || isNewChildSession) {
            callback({
              type: event.type,
              properties: properties as Record<string, unknown>,
            });
          }
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          logger.error('事件流错误', { sessionId, error });
        }
      }
    };

    processEvents();

    return () => {
      abortController.abort();
    };
  }

  /** 获取会话状态 */
  async getSessionStatus(sessionId: string): Promise<'idle' | 'busy' | 'unknown'> {
    try {
      const client = this.ensureClient();
      const response = await client.session.status({
        query: { directory: this.directory },
      });
      
      const data = response.data as Record<string, unknown>;
      if (data && data[sessionId]) {
        return (data[sessionId] as string) === 'busy' ? 'busy' : 'idle';
      }
      return 'unknown';
    } catch (error) {
      logger.error('获取会话状态失败', error);
      return 'unknown';
    }
  }

  /** 获取原始客户端实例 */
  getClient(): OpencodeClient | null {
    return this.client;
  }

  /** 执行命令 */
  async executeCommand(sessionId: string, command: string, args = ''): Promise<boolean> {
    try {
      const client = this.ensureClient();
      await client.session.command({
        path: { id: sessionId },
        query: { directory: this.directory },
        body: {
          command,
          arguments: args,
        },
      });
      return true;
    } catch (error) {
      logger.error('执行命令失败', { command, error });
      return false;
    }
  }

  async executeShell(sessionId: string, command: string, model?: { providerID: string; modelID: string }): Promise<boolean> {
    try {
      const client = this.ensureClient();
      logger.info('OpenCode executeShell', { sessionId, command: command.slice(0, 50), model });
      await client.session.shell({
        path: { id: sessionId },
        query: { directory: this.directory },
        body: {
          command,
          agent: 'build',
          model,
        },
      });
      return true;
    } catch (error) {
      logger.error('执行 shell 命令失败', { command, error });
      return false;
    }
  }

  async summarizeSession(sessionId: string, model?: { providerID: string; modelID: string }): Promise<boolean> {
    try {
      const client = this.ensureClient();
      await client.session.summarize({
        path: { id: sessionId },
        query: { directory: this.directory },
        body: model,
      });
      return true;
    } catch (error) {
      logger.error('压缩会话上下文失败', { sessionId, error });
      return false;
    }
  }

  /** 获取可用命令列表 */
  async listCommands(): Promise<Array<{ name: string; description?: string }>> {
    try {
      const client = this.ensureClient();
      const response = await client.command.list({
        query: { directory: this.directory },
      });
      return response.data ?? [];
    } catch (error) {
      logger.error('获取命令列表失败', error);
      return [];
    }
  }

  /** 获取可用模型列表 */
  async listModels(): Promise<Array<{ id: string; name: string; providerId: string }>> {
    try {
      const client = this.ensureClient();
      const response = await client.config.providers({
        query: { directory: this.directory },
      });
      
      const models: Array<{ id: string; name: string; providerId: string }> = [];
      const data = response.data as { providers?: Array<{ id: string; models?: Record<string, { id: string; name: string }> }> };
      
      if (data?.providers) {
        for (const provider of data.providers) {
          if (provider.models) {
            for (const [modelKey, model] of Object.entries(provider.models)) {
              models.push({
                id: `${provider.id}/${model.id}`,
                name: model.name,
                providerId: provider.id,
              });
            }
          }
        }
      }
      
      return models;
    } catch (error) {
      logger.error('获取模型列表失败', error);
      return [];
    }
  }

  /** 获取会话信息 */
  async getSession(sessionId: string): Promise<Record<string, unknown> | null> {
    try {
      const client = this.ensureClient();
      const response = await client.session.get({
        path: { id: sessionId },
        query: { directory: this.directory },
      });
      return response.data as Record<string, unknown>;
    } catch (error) {
      logger.error('获取会话信息失败', error);
      return null;
    }
  }

  /** 获取会话消息列表 */
  async getSessionMessages(sessionId: string): Promise<Array<Record<string, unknown>>> {
    try {
      const client = this.ensureClient();
      const response = await client.session.messages({
        path: { id: sessionId },
        query: { directory: this.directory },
      });
      return (response.data ?? []) as Array<Record<string, unknown>>;
    } catch (error) {
      logger.error('获取会话消息失败', error);
      return [];
    }
  }

  async replyQuestion(requestId: string, answers: string[][]): Promise<boolean> {
    if (!this.serverUrl) {
      return false;
    }
    try {
      const url = new URL(`/question/${encodeURIComponent(requestId)}/reply`, this.serverUrl);
      if (this.directory) {
        url.searchParams.set('directory', this.directory);
      }
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      return response.ok;
    } catch (error) {
      logger.error('回复问题失败', error);
      return false;
    }
  }

  async rejectQuestion(requestId: string): Promise<boolean> {
    if (!this.serverUrl) {
      logger.error('拒绝问题失败：服务器未启动');
      return false;
    }
    try {
      const url = new URL(`/question/${encodeURIComponent(requestId)}/reject`, this.serverUrl);
      if (this.directory) {
        url.searchParams.set('directory', this.directory);
      }
      const response = await fetch(url.toString(), {
        method: 'POST',
      });
      return response.ok;
    } catch (error) {
      logger.error('拒绝问题失败', error);
      return false;
    }
  }

  /** 获取子会话列表 */
  async getChildSessions(parentSessionId: string): Promise<ChildSession[]> {
    try {
      const client = this.ensureClient();
      const response = await client.session.children({
        path: { id: parentSessionId },
        query: { directory: this.directory },
      });
      return (response.data ?? []) as ChildSession[];
    } catch (error) {
      logger.error('获取子会话列表失败', error);
      return [];
    }
  }

  /** 获取会话详情（包含摘要信息） */
  async getSessionDetail(sessionId: string): Promise<SessionDetail | null> {
    try {
      const client = this.ensureClient();
      const response = await client.session.get({
        path: { id: sessionId },
        query: { directory: this.directory },
      });
      return response.data as SessionDetail | null;
    } catch (error) {
      logger.error('获取会话详情失败', error);
      return null;
    }
  }
}

/** 创建 OpenCode 封装实例 */
export function createOpencodeWrapper(config: OpencodeConfig): OpencodeWrapper {
  return new OpencodeWrapper(config);
}

/** 从消息部分提取文本 */
export function extractTextFromPart(part: unknown): string | null {
  if (!part || typeof part !== 'object') return null;
  
  const p = part as Record<string, unknown>;
  
  if (p.synthetic || p.ignored) return null;
  
  if (p.type === 'text' && typeof p.text === 'string') {
    return p.text;
  }
  
  if (p.type === 'reasoning' && typeof p.text === 'string') {
    return `[思考中] ${p.text}`;
  }
  
  return null;
}

/** 工具调用提取结果 */
export interface ToolCallInfo {
  name: string;
  state: string;
  title?: string;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  time?: { start: number; end?: number };
}

export function extractToolCallFromPart(part: unknown): ToolCallInfo | null {
  if (!part || typeof part !== 'object') return null;
  
  const p = part as Record<string, unknown>;
  
  if (p.type === 'tool' && typeof p.tool === 'string') {
    const stateObj = p.state as {
      status?: string;
      title?: string;
      input?: Record<string, unknown>;
      output?: string;
      error?: string;
      time?: { start: number; end?: number };
    } | undefined;
    
    return {
      name: p.tool,
      state: stateObj?.status ?? 'pending',
      title: stateObj?.title,
      input: stateObj?.input,
      output: stateObj?.output,
      error: stateObj?.error,
      time: stateObj?.time,
    };
  }
  
  return null;
}

export interface SubtaskInfo {
  id: string;
  sessionID: string;
  messageID: string;
  prompt: string;
  description: string;
  agent: string;
}

export function extractSubtaskFromPart(part: unknown): SubtaskInfo | null {
  if (!part || typeof part !== 'object') return null;
  
  const p = part as Record<string, unknown>;
  
  if (p.type === 'subtask') {
    return {
      id: p.id as string,
      sessionID: p.sessionID as string,
      messageID: p.messageID as string,
      prompt: (p.prompt as string) ?? '',
      description: (p.description as string) ?? '',
      agent: (p.agent as string) ?? 'agent',
    };
  }
  
  return null;
}

export { type Event, type TextPart, type ReasoningPart, type ToolPart, type Message };

export interface ModelSelection {
  providerID: string;
  modelID: string;
}

export interface FileDiff {
  file: string;
  before: string;
  after: string;
  additions: number;
  deletions: number;
}

export interface SessionSummary {
  additions: number;
  deletions: number;
  files: number;
  diffs?: FileDiff[];
}

export interface ChildSession {
  id: string;
  projectID: string;
  directory: string;
  parentID?: string;
  title: string;
  summary?: SessionSummary;
  time: {
    created: number;
    updated: number;
  };
}

export interface SessionDetail {
  id: string;
  projectID: string;
  directory: string;
  parentID?: string;
  title: string;
  summary?: SessionSummary;
  time: {
    created: number;
    updated: number;
    compacting?: number;
  };
}

export function parseModelId(modelId: string): ModelSelection | null {
  const slashIndex = modelId.indexOf('/');
  if (slashIndex === -1) return null;
  
  const providerID = modelId.substring(0, slashIndex);
  const modelID = modelId.substring(slashIndex + 1);
  
  if (!providerID || !modelID) return null;
  
  return { providerID, modelID };
}
