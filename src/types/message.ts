/**
 * Message 类型定义
 * 定义统一的消息格式
 */

/** 消息附件类型 */
export type AttachmentType = 'image' | 'file' | 'audio' | 'video' | 'document' | 'sheet';

/** 消息附件 */
export interface MessageAttachment {
  /** 附件类型 */
  type: AttachmentType;
  /** 附件ID（渠道相关） */
  id: string;
  /** 文件名 */
  filename?: string;
  /** MIME类型 */
  mimeType?: string;
  /** 文件大小 */
  size?: number;
  /** 预览URL */
  previewUrl?: string;
  /** 下载URL */
  downloadUrl?: string;
  /** 附件数据（已下载时） */
  data?: Buffer;
}

/** 统一消息格式 - 输入 */
export interface UnifiedMessage {
  /** 消息ID */
  id: string;
  /** 会话ID */
  chatId: string;
  /** 会话类型 */
  chatType: 'private' | 'group';
  /** 发送者ID */
  senderId: string;
  /** 发送者名称 */
  senderName?: string;
  /** 消息类型 */
  type: 'text' | 'image' | 'file' | 'richtext' | 'card' | 'mixed';
  /** 文本内容 */
  text?: string;
  /** 附件列表 */
  attachments?: MessageAttachment[];
  /** 引用的消息ID */
  replyTo?: string;
  /** @提及列表 */
  mentions?: MessageMention[];
  /** 是否@机器人 */
  mentionedBot?: boolean;
  /** 时间戳 */
  timestamp: number;
  /** 原始消息数据 */
  raw?: unknown;
}

/** @提及信息 */
export interface MessageMention {
  /** 提及标识 */
  key: string;
  /** 用户ID */
  id: string;
  /** 用户名称 */
  name: string;
}

/** 消息内容块类型 */
export type ContentBlockType = 
  | 'text' 
  | 'code' 
  | 'thinking' 
  | 'tool_call' 
  | 'tool_result' 
  | 'image'
  | 'file'
  | 'error';

/** 文本内容块 */
export interface TextBlock {
  type: 'text';
  content: string;
}

/** 代码内容块 */
export interface CodeBlock {
  type: 'code';
  language?: string;
  content: string;
}

/** 思考过程块 */
export interface ThinkingBlock {
  type: 'thinking';
  content: string;
}

/** 工具调用块 */
export interface ToolCallBlock {
  type: 'tool_call';
  toolName: string;
  toolId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input?: unknown;
  output?: unknown;
  error?: string;
}

/** 工具结果块 */
export interface ToolResultBlock {
  type: 'tool_result';
  toolName: string;
  toolId?: string;
  success: boolean;
  output?: unknown;
  error?: string;
}

/** 图片块 */
export interface ImageBlock {
  type: 'image';
  url?: string;
  data?: Buffer;
  mimeType?: string;
  alt?: string;
}

/** 文件块 */
export interface FileBlock {
  type: 'file';
  url?: string;
  filename: string;
  mimeType?: string;
  size?: number;
}

/** 错误块 */
export interface ErrorBlock {
  type: 'error';
  message: string;
  code?: string;
  details?: unknown;
}

/** 内容块联合类型 */
export type ContentBlock = 
  | TextBlock 
  | CodeBlock 
  | ThinkingBlock 
  | ToolCallBlock 
  | ToolResultBlock
  | ImageBlock
  | FileBlock
  | ErrorBlock;

/** 回复状态 */
export type ReplyStatus = 
  | 'pending'      // 等待中
  | 'streaming'    // 流式输出中
  | 'completed'    // 已完成
  | 'error'        // 出错
  | 'cancelled';   // 已取消

/** 统一回复格式 - 输出 */
export interface UnifiedReply {
  /** 回复状态 */
  status: ReplyStatus;
  /** 内容块列表 */
  blocks: ContentBlock[];
  /** 纯文本摘要（用于不支持富文本的渠道） */
  plainText?: string;
  /** 是否显示思考过程 */
  showThinking?: boolean;
  /** 元数据 */
  metadata?: {
    /** 模型名称 */
    model?: string;
    /** Token 使用量 */
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
    };
    /** 处理时间(ms) */
    duration?: number;
  };
}

/** 消息上下文 */
export interface MessageContext {
  /** 渠道ID */
  channelId: string;
  /** 渠道类型 */
  channelType: string;
  /** 会话ID */
  chatId: string;
  /** 会话类型 */
  chatType: 'private' | 'group';
  /** 发送者ID */
  senderId: string;
  /** 是否在会话群中 */
  isSessionGroup?: boolean;
  /** 当前项目路径 */
  projectPath?: string;
  /** 当前模型 */
  model?: string;
}
