/**
 * 飞书文档服务类型定义
 */

/** 文档信息 */
export interface DocumentInfo {
  /** 文档 ID (token) */
  documentId: string;
  /** 文档标题 */
  title: string;
  /** 文档版本号 */
  revisionId: number;
  /** 文档 URL */
  url: string;
}

/** 文档内容 */
export interface DocumentContent {
  /** 文档 ID */
  documentId: string;
  /** 纯文本内容 */
  content: string;
  /** 文档标题 */
  title?: string;
}

/** 创建文档选项 */
export interface CreateDocumentOptions {
  /** 文档标题 */
  title: string;
  /** 目标文件夹 token（不指定则使用默认配置或根目录） */
  folderToken?: string;
  /** 初始内容（Markdown 格式） */
  content?: string;
}

/** 更新文档选项 */
export interface UpdateDocumentOptions {
  /** 文档 ID 或 URL */
  documentId: string;
  /** 新内容（Markdown 格式） */
  content: string;
  /** 是否追加内容（否则替换） */
  append?: boolean;
}

/** 文档操作结果 */
export interface DocumentResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** 文件夹信息 */
export interface FolderInfo {
  /** 文件夹 token */
  folderToken: string;
  /** 文件夹名称 */
  name: string;
  /** 父文件夹 token */
  parentToken?: string;
}

/** 文档块类型 */
export type BlockType = 
  | 'page'      // 文档根节点
  | 'text'      // 文本
  | 'heading1'  // 一级标题
  | 'heading2'  // 二级标题
  | 'heading3'  // 三级标题
  | 'bullet'    // 无序列表
  | 'ordered'   // 有序列表
  | 'code'      // 代码块
  | 'quote'     // 引用
  | 'divider';  // 分割线

/** 文档块内容元素 */
export interface TextElement {
  textRun?: {
    content: string;
    style?: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      strikethrough?: boolean;
      code?: boolean;
      link?: { url: string };
    };
  };
}

/** 文档块 */
export interface DocumentBlock {
  blockId?: string;
  blockType: number;
  elements?: TextElement[];
  children?: string[];
}

/** 文档配置 */
export interface DocsConfig {
  /** 默认文档存储文件夹 token */
  defaultFolderToken?: string;
  /** 知识库 space_id（可选，用于知识库模式） */
  wikiSpaceId?: string;
}

/** 从飞书文档 URL 解析出来的信息 */
export interface ParsedDocumentUrl {
  /** 文档类型: docx, doc, wiki 等 */
  type: 'docx' | 'doc' | 'wiki' | 'sheet' | 'unknown';
  /** 文档 token */
  token: string;
  /** 原始 URL */
  url: string;
}
