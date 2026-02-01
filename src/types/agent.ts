/**
 * Agent 类型定义
 * 定义 Agent 运行时抽象
 */

import type { UnifiedMessage, UnifiedReply, ContentBlock } from './message';

/** Agent 配置 */
export interface AgentConfig {
  /** Agent 唯一标识 */
  id: string;
  /** Agent 名称 */
  name: string;
  /** Agent 类型 */
  type: string;
  /** 是否启用 */
  enabled: boolean;
  /** Agent 特定配置 */
  options?: Record<string, unknown>;
}

/** Agent 事件类型 */
export type AgentEventType = 
  | 'session.created'
  | 'session.resumed'
  | 'message.start'
  | 'message.delta'
  | 'message.complete'
  | 'tool.start'
  | 'tool.delta'
  | 'tool.complete'
  | 'thinking.start'
  | 'thinking.delta'
  | 'thinking.complete'
  | 'error'
  | 'abort';

/** Agent 事件基类 */
export interface AgentEvent {
  /** 事件类型 */
  type: AgentEventType;
  /** 会话ID */
  sessionId: string;
  /** 时间戳 */
  timestamp: number;
}

/** 会话创建事件 */
export interface SessionCreatedEvent extends AgentEvent {
  type: 'session.created';
  /** 项目路径 */
  projectPath: string;
  /** 模型ID */
  model?: string;
}

/** 会话恢复事件 */
export interface SessionResumedEvent extends AgentEvent {
  type: 'session.resumed';
}

/** 消息开始事件 */
export interface MessageStartEvent extends AgentEvent {
  type: 'message.start';
  /** 消息ID */
  messageId: string;
}

/** 消息增量事件 */
export interface MessageDeltaEvent extends AgentEvent {
  type: 'message.delta';
  /** 消息ID */
  messageId: string;
  /** 增量内容 */
  delta: string;
  /** 当前内容块 */
  block?: ContentBlock;
}

/** 消息完成事件 */
export interface MessageCompleteEvent extends AgentEvent {
  type: 'message.complete';
  /** 消息ID */
  messageId: string;
  /** 完整内容 */
  content: ContentBlock[];
  /** 使用统计 */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

/** 工具开始事件 */
export interface ToolStartEvent extends AgentEvent {
  type: 'tool.start';
  /** 工具调用ID */
  toolCallId: string;
  /** 工具名称 */
  toolName: string;
  /** 工具输入 */
  input?: unknown;
}

/** 工具增量事件 */
export interface ToolDeltaEvent extends AgentEvent {
  type: 'tool.delta';
  /** 工具调用ID */
  toolCallId: string;
  /** 增量输出 */
  delta: string;
}

/** 工具完成事件 */
export interface ToolCompleteEvent extends AgentEvent {
  type: 'tool.complete';
  /** 工具调用ID */
  toolCallId: string;
  /** 工具名称 */
  toolName: string;
  /** 是否成功 */
  success: boolean;
  /** 工具输出 */
  output?: unknown;
  /** 错误信息 */
  error?: string;
}

/** 思考开始事件 */
export interface ThinkingStartEvent extends AgentEvent {
  type: 'thinking.start';
}

/** 思考增量事件 */
export interface ThinkingDeltaEvent extends AgentEvent {
  type: 'thinking.delta';
  /** 增量内容 */
  delta: string;
}

/** 思考完成事件 */
export interface ThinkingCompleteEvent extends AgentEvent {
  type: 'thinking.complete';
  /** 完整思考内容 */
  content: string;
}

/** 错误事件 */
export interface AgentErrorEvent extends AgentEvent {
  type: 'error';
  /** 错误代码 */
  code?: string;
  /** 错误消息 */
  message: string;
  /** 是否可恢复 */
  recoverable?: boolean;
}

/** 中止事件 */
export interface AbortEvent extends AgentEvent {
  type: 'abort';
  /** 中止原因 */
  reason?: string;
}

/** Agent 事件联合类型 */
export type AnyAgentEvent = 
  | SessionCreatedEvent
  | SessionResumedEvent
  | MessageStartEvent
  | MessageDeltaEvent
  | MessageCompleteEvent
  | ToolStartEvent
  | ToolDeltaEvent
  | ToolCompleteEvent
  | ThinkingStartEvent
  | ThinkingDeltaEvent
  | ThinkingCompleteEvent
  | AgentErrorEvent
  | AbortEvent;

/** Agent 事件处理器 */
export type AgentEventHandler = (event: AnyAgentEvent) => void;

/** 模型信息 */
export interface ModelInfo {
  /** 模型ID */
  id: string;
  /** 模型名称 */
  name: string;
  /** 提供商 */
  provider?: string;
  /** 是否支持工具调用 */
  supportsTools?: boolean;
  /** 是否支持流式输出 */
  supportsStreaming?: boolean;
  /** 上下文窗口大小 */
  contextWindow?: number;
}

/** 发送消息选项 */
export interface SendOptions {
  /** 图片附件 */
  images?: Array<{
    data: Buffer;
    mimeType: string;
    filename?: string;
  }>;
  /** 是否允许工具调用 */
  allowTools?: boolean;
}

/** Agent 运行时接口 */
export interface IAgentRuntime {
  /** Agent ID */
  readonly id: string;
  /** Agent 类型 */
  readonly type: string;
  /** 是否已初始化 */
  readonly initialized: boolean;

  /** 初始化 Agent */
  initialize(): Promise<void>;
  /** 关闭 Agent */
  shutdown(): Promise<void>;

  /** 创建新会话 */
  createSession(projectPath: string, model?: string): Promise<string>;
  /** 获取或创建会话 */
  getOrCreateSession(projectPath: string, model?: string): Promise<string>;
  /** 切换会话模型 */
  switchModel(sessionId: string, model: string): Promise<void>;
  /** 清除会话历史 */
  clearHistory(sessionId: string): Promise<void>;

  /** 发送消息 */
  send(sessionId: string, message: string, options?: SendOptions): Promise<void>;
  /** 中止当前任务 */
  abort(sessionId: string): Promise<boolean>;
  /** 执行命令 */
  executeCommand(sessionId: string, command: string): Promise<string>;

  /** 订阅事件 */
  subscribe(sessionId: string, handler: AgentEventHandler): () => void;
  /** 取消订阅 */
  unsubscribe(sessionId: string, handler: AgentEventHandler): void;

  /** 获取可用模型列表 */
  listModels(): Promise<ModelInfo[]>;
  /** 获取当前会话信息 */
  getSessionInfo(sessionId: string): Promise<{
    model?: string;
    projectPath?: string;
    messageCount?: number;
  } | null>;
}
