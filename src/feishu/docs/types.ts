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

/** 文档块类型（字符串形式） */
export type BlockTypeName = 
  | 'page'      // 文档根节点
  | 'text'      // 文本
  | 'heading1'  // 一级标题
  | 'heading2'  // 二级标题
  | 'heading3'  // 三级标题
  | 'heading4'  // 四级标题
  | 'heading5'  // 五级标题
  | 'heading6'  // 六级标题
  | 'heading7'  // 七级标题
  | 'heading8'  // 八级标题
  | 'heading9'  // 九级标题
  | 'bullet'    // 无序列表
  | 'ordered'   // 有序列表
  | 'code'      // 代码块
  | 'quote'     // 引用
  | 'equation'  // 公式
  | 'todo'      // 待办
  | 'bitable'   // 多维表格
  | 'callout'   // 高亮块
  | 'diagram'   // 绘图
  | 'divider'   // 分割线
  | 'file'      // 文件
  | 'grid'      // 分栏
  | 'grid_column' // 分栏列
  | 'iframe'    // 内嵌网页
  | 'image'     // 图片
  | 'table'     // 表格
  | 'table_cell' // 表格单元格
  | 'board'     // 画板
  | 'unknown';  // 未知类型

/** @deprecated 使用 BlockTypeName 代替 */
export type BlockType = BlockTypeName;

/** 文本元素样式 */
export interface TextElementStyle {
  /** 粗体 */
  bold?: boolean;
  /** 斜体 */
  italic?: boolean;
  /** 下划线 */
  underline?: boolean;
  /** 删除线 */
  strikethrough?: boolean;
  /** 行内代码 */
  inlineCode?: boolean;
  /** 背景色 */
  backgroundColor?: number;
  /** 文字颜色 */
  textColor?: number;
  /** 链接 */
  link?: { url: string };
  /** 评论ID列表 */
  commentIds?: string[];
}

/** 文档块内容元素 */
export interface TextElement {
  /** 文本内容 */
  textRun?: {
    content: string;
    style?: TextElementStyle;
  };
  /** 提及用户 */
  mentionUser?: {
    userId: string;
    style?: TextElementStyle;
  };
  /** 提及文档 */
  mentionDoc?: {
    token: string;
    objType: number;
    url?: string;
    title?: string;
    style?: TextElementStyle;
  };
  /** 行内公式 */
  equation?: {
    content: string;
    style?: TextElementStyle;
  };
}

/** 块样式 */
export interface BlockStyle {
  /** 对齐方式: 1=左, 2=中, 3=右 */
  align?: number;
  /** 完成状态（待办） */
  done?: boolean;
  /** 是否折叠 */
  folded?: boolean;
  /** 代码语言 */
  language?: number;
  /** 是否自动换行 */
  wrap?: boolean;
  /** 背景颜色 */
  backgroundColor?: string;
  /** 缩进级别 */
  indentationLevel?: string;
  /** 序列号（有序列表） */
  sequence?: string;
}

/** 表格属性 */
export interface TableProperty {
  /** 行数 */
  rowSize: number;
  /** 列数 */
  columnSize: number;
  /** 列宽数组 */
  columnWidth?: number[];
  /** 合并单元格信息 */
  mergeInfo?: Array<{
    rowSpan?: number;
    colSpan?: number;
  }>;
  /** 是否有表头行 */
  headerRow?: boolean;
  /** 是否有表头列 */
  headerColumn?: boolean;
}

/** 图片属性 */
export interface ImageProperty {
  /** 图片宽度 */
  width?: number;
  /** 图片高度 */
  height?: number;
  /** 图片token */
  token?: string;
  /** 对齐方式 */
  align?: number;
  /** 图片说明 */
  caption?: {
    content?: string;
  };
  /** 缩放比例 */
  scale?: number;
}

/** iframe属性 */
export interface IframeProperty {
  component: {
    iframeType?: number;
    url: string;
  };
}

/** Callout属性 */
export interface CalloutProperty {
  backgroundColor?: number;
  borderColor?: number;
  textColor?: number;
  emojiId?: string;
}

/** 文档块（完整版） */
export interface DocumentBlock {
  /** 块ID */
  blockId: string;
  /** 块类型（数值） */
  blockType: number;
  /** 父块ID */
  parentId?: string;
  /** 子块ID列表 */
  children?: string[];
  
  // 各类型块的内容
  /** 页面块 */
  page?: {
    elements?: TextElement[];
    style?: BlockStyle;
  };
  /** 文本块 */
  text?: {
    elements: TextElement[];
    style?: BlockStyle;
  };
  /** 标题块 (heading1-9) */
  heading1?: { elements: TextElement[]; style?: BlockStyle; };
  heading2?: { elements: TextElement[]; style?: BlockStyle; };
  heading3?: { elements: TextElement[]; style?: BlockStyle; };
  heading4?: { elements: TextElement[]; style?: BlockStyle; };
  heading5?: { elements: TextElement[]; style?: BlockStyle; };
  heading6?: { elements: TextElement[]; style?: BlockStyle; };
  heading7?: { elements: TextElement[]; style?: BlockStyle; };
  heading8?: { elements: TextElement[]; style?: BlockStyle; };
  heading9?: { elements: TextElement[]; style?: BlockStyle; };
  /** 无序列表 */
  bullet?: { elements: TextElement[]; style?: BlockStyle; };
  /** 有序列表 */
  ordered?: { elements: TextElement[]; style?: BlockStyle; };
  /** 代码块 */
  code?: { elements: TextElement[]; style?: BlockStyle; };
  /** 引用块 */
  quote?: { elements: TextElement[]; style?: BlockStyle; };
  /** 公式块 */
  equation?: { elements: TextElement[]; style?: BlockStyle; };
  /** 待办事项 */
  todo?: { elements: TextElement[]; style?: BlockStyle; };
  /** 分割线 */
  divider?: Record<string, never>;
  /** 图片 */
  image?: ImageProperty;
  /** 表格 */
  table?: {
    cells?: string[];
    property: TableProperty;
  };
  /** 表格单元格 */
  tableCell?: {
    elements?: TextElement[];
  };
  /** 高亮块 */
  callout?: CalloutProperty;
  /** 内嵌网页 */
  iframe?: IframeProperty;
  /** 文件 */
  file?: {
    token?: string;
    name?: string;
    viewType?: number;
  };
  /** 绘图 */
  diagram?: {
    diagramType?: number;
  };
  /** 画板 */
  board?: {
    token?: string;
    align?: number;
    width?: number;
    height?: number;
  };
}

/** 创建块数据 */
export interface CreateBlockData {
  /** 块类型 */
  blockType: number;
  /** 文本块内容 */
  text?: { elements: TextElement[]; style?: BlockStyle; };
  /** 标题内容 */
  heading1?: { elements: TextElement[]; style?: BlockStyle; };
  heading2?: { elements: TextElement[]; style?: BlockStyle; };
  heading3?: { elements: TextElement[]; style?: BlockStyle; };
  heading4?: { elements: TextElement[]; style?: BlockStyle; };
  heading5?: { elements: TextElement[]; style?: BlockStyle; };
  heading6?: { elements: TextElement[]; style?: BlockStyle; };
  heading7?: { elements: TextElement[]; style?: BlockStyle; };
  heading8?: { elements: TextElement[]; style?: BlockStyle; };
  heading9?: { elements: TextElement[]; style?: BlockStyle; };
  /** 列表 */
  bullet?: { elements: TextElement[]; style?: BlockStyle; };
  ordered?: { elements: TextElement[]; style?: BlockStyle; };
  /** 代码块 */
  code?: { elements: TextElement[]; style?: BlockStyle; };
  /** 引用 */
  quote?: { elements: TextElement[]; style?: BlockStyle; };
  /** 公式 */
  equation?: { elements: TextElement[]; style?: BlockStyle; };
  /** 待办 */
  todo?: { elements: TextElement[]; style?: BlockStyle; };
  /** 分割线 */
  divider?: Record<string, never>;
  /** 图片 */
  image?: Omit<ImageProperty, 'token' | 'width' | 'height'>;
  /** 表格 */
  table?: { property: TableProperty; };
  /** 高亮块 */
  callout?: CalloutProperty;
  /** 内嵌网页 */
  iframe?: IframeProperty;
}

/** 更新块请求 */
export interface UpdateBlockRequest {
  /** 块ID */
  blockId: string;
  /** 更新文本元素 */
  updateTextElements?: { elements: TextElement[] };
  /** 更新文本样式 */
  updateTextStyle?: BlockStyle;
  /** 更新表格属性 */
  updateTableProperty?: Partial<TableProperty>;
  /** 插入表格行 */
  insertTableRow?: { rowIndex: number; };
  /** 插入表格列 */
  insertTableColumn?: { columnIndex: number; };
  /** 删除表格行 */
  deleteTableRows?: { startIndex: number; endIndex: number; };
  /** 删除表格列 */
  deleteTableColumns?: { startIndex: number; endIndex: number; };
  /** 合并表格单元格 */
  mergeTableCells?: { rowStartIndex: number; rowEndIndex: number; columnStartIndex: number; columnEndIndex: number; };
  /** 取消合并单元格 */
  unmergeTableCells?: { rowStartIndex: number; rowEndIndex: number; columnStartIndex: number; columnEndIndex: number; };
  /** 替换图片 */
  replaceImage?: ImageProperty;
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
