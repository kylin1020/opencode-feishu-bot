/**
 * 飞书文档块类型常量定义
 * 
 * 参考文档: https://open.feishu.cn/document/server-docs/docs/docx-v1/document-block
 */

/** 块类型数值枚举 */
export const BLOCK_TYPE = {
  /** 文档根节点 */
  PAGE: 1,
  /** 文本段落 */
  TEXT: 2,
  /** 一级标题 */
  HEADING1: 3,
  /** 二级标题 */
  HEADING2: 4,
  /** 三级标题 */
  HEADING3: 5,
  /** 四级标题 */
  HEADING4: 6,
  /** 五级标题 */
  HEADING5: 7,
  /** 六级标题 */
  HEADING6: 8,
  /** 七级标题 */
  HEADING7: 9,
  /** 八级标题 */
  HEADING8: 10,
  /** 九级标题 */
  HEADING9: 11,
  /** 无序列表 */
  BULLET: 12,
  /** 有序列表 */
  ORDERED: 13,
  /** 代码块 */
  CODE: 14,
  /** 引用块 */
  QUOTE: 15,
  /** 公式块 (LaTeX) */
  EQUATION: 16,
  /** 待办事项 */
  TODO: 17,
  /** 多维表格 */
  BITABLE: 18,
  /** 高亮块 */
  CALLOUT: 19,
  /** 会话卡片 */
  CHAT_CARD: 20,
  /** 绘图/图表 */
  DIAGRAM: 21,
  /** 分割线 */
  DIVIDER: 22,
  /** 文件 */
  FILE: 23,
  /** 分栏布局 */
  GRID: 24,
  /** 分栏列 */
  GRID_COLUMN: 25,
  /** 内嵌网页 */
  IFRAME: 26,
  /** 图片 */
  IMAGE: 27,
  /** ISV应用块 */
  ISV: 28,
  /** 思维笔记 */
  MINDNOTE: 29,
  /** 电子表格 */
  SHEET: 30,
  /** 表格 */
  TABLE: 31,
  /** 表格单元格 */
  TABLE_CELL: 32,
  /** 视图块 */
  VIEW: 33,
  /** 未定义 */
  UNDEFINED: 34,
  /** 引用容器 */
  QUOTE_CONTAINER: 35,
  /** 任务块 */
  TASK: 36,
  /** OKR块 */
  OKR: 37,
  /** OKR目标 */
  OKR_OBJECTIVE: 38,
  /** OKR关键结果 */
  OKR_KEY_RESULT: 39,
  /** OKR进度 */
  OKR_PROGRESS: 40,
  /** 小组件 */
  ADD_ONS: 41,
  /** Jira Issue */
  JIRA_ISSUE: 42,
  /** 知识库目录 */
  WIKI_CATALOG: 43,
  /** 画板 */
  BOARD: 44,
  /** 议程 */
  AGENDA: 45,
  /** 议程项 */
  AGENDA_ITEM: 46,
  /** 链接预览 */
  LINK_PREVIEW: 47,
} as const;

export type BlockTypeValue = typeof BLOCK_TYPE[keyof typeof BLOCK_TYPE];

/** 块类型名称映射 (数值 -> 字符串) */
export const BLOCK_TYPE_NAME: Record<number, string> = {
  [BLOCK_TYPE.PAGE]: 'page',
  [BLOCK_TYPE.TEXT]: 'text',
  [BLOCK_TYPE.HEADING1]: 'heading1',
  [BLOCK_TYPE.HEADING2]: 'heading2',
  [BLOCK_TYPE.HEADING3]: 'heading3',
  [BLOCK_TYPE.HEADING4]: 'heading4',
  [BLOCK_TYPE.HEADING5]: 'heading5',
  [BLOCK_TYPE.HEADING6]: 'heading6',
  [BLOCK_TYPE.HEADING7]: 'heading7',
  [BLOCK_TYPE.HEADING8]: 'heading8',
  [BLOCK_TYPE.HEADING9]: 'heading9',
  [BLOCK_TYPE.BULLET]: 'bullet',
  [BLOCK_TYPE.ORDERED]: 'ordered',
  [BLOCK_TYPE.CODE]: 'code',
  [BLOCK_TYPE.QUOTE]: 'quote',
  [BLOCK_TYPE.EQUATION]: 'equation',
  [BLOCK_TYPE.TODO]: 'todo',
  [BLOCK_TYPE.BITABLE]: 'bitable',
  [BLOCK_TYPE.CALLOUT]: 'callout',
  [BLOCK_TYPE.CHAT_CARD]: 'chat_card',
  [BLOCK_TYPE.DIAGRAM]: 'diagram',
  [BLOCK_TYPE.DIVIDER]: 'divider',
  [BLOCK_TYPE.FILE]: 'file',
  [BLOCK_TYPE.GRID]: 'grid',
  [BLOCK_TYPE.GRID_COLUMN]: 'grid_column',
  [BLOCK_TYPE.IFRAME]: 'iframe',
  [BLOCK_TYPE.IMAGE]: 'image',
  [BLOCK_TYPE.ISV]: 'isv',
  [BLOCK_TYPE.MINDNOTE]: 'mindnote',
  [BLOCK_TYPE.SHEET]: 'sheet',
  [BLOCK_TYPE.TABLE]: 'table',
  [BLOCK_TYPE.TABLE_CELL]: 'table_cell',
  [BLOCK_TYPE.VIEW]: 'view',
  [BLOCK_TYPE.UNDEFINED]: 'undefined',
  [BLOCK_TYPE.QUOTE_CONTAINER]: 'quote_container',
  [BLOCK_TYPE.TASK]: 'task',
  [BLOCK_TYPE.OKR]: 'okr',
  [BLOCK_TYPE.OKR_OBJECTIVE]: 'okr_objective',
  [BLOCK_TYPE.OKR_KEY_RESULT]: 'okr_key_result',
  [BLOCK_TYPE.OKR_PROGRESS]: 'okr_progress',
  [BLOCK_TYPE.ADD_ONS]: 'add_ons',
  [BLOCK_TYPE.JIRA_ISSUE]: 'jira_issue',
  [BLOCK_TYPE.WIKI_CATALOG]: 'wiki_catalog',
  [BLOCK_TYPE.BOARD]: 'board',
  [BLOCK_TYPE.AGENDA]: 'agenda',
  [BLOCK_TYPE.AGENDA_ITEM]: 'agenda_item',
  [BLOCK_TYPE.LINK_PREVIEW]: 'link_preview',
};

/** 代码块语言枚举 */
export const CODE_LANGUAGE = {
  PLAIN_TEXT: 1,
  ABAP: 2,
  ADA: 3,
  APACHE: 4,
  APEX: 5,
  ASSEMBLY: 6,
  BASH: 7,
  CSHARP: 8,
  CPP: 9,
  C: 10,
  COBOL: 11,
  CSS: 12,
  COFFEESCRIPT: 13,
  D: 14,
  DART: 15,
  DELPHI: 16,
  DJANGO: 17,
  DOCKERFILE: 18,
  ERLANG: 19,
  FORTRAN: 20,
  FOXPRO: 21,
  GO: 22,
  GROOVY: 23,
  HTML: 24,
  HTMLBARS: 25,
  HTTP: 26,
  HASKELL: 27,
  JSON: 28,
  JAVA: 29,
  JAVASCRIPT: 30,
  JULIA: 31,
  KOTLIN: 32,
  LATEX: 33,
  LISP: 34,
  LOGO: 35,
  LUA: 36,
  MATLAB: 37,
  MAKEFILE: 38,
  MARKDOWN: 39,
  NGINX: 40,
  OBJECTIVE_C: 41,
  OPENEDGE_ABL: 42,
  PHP: 43,
  PERL: 44,
  POSTSCRIPT: 45,
  POWERSHELL: 46,
  PROLOG: 47,
  PROTOBUF: 48,
  PYTHON: 49,
  R: 50,
  RPG: 51,
  RUBY: 52,
  RUST: 53,
  SAS: 54,
  SCSS: 55,
  SQL: 56,
  SCALA: 57,
  SCHEME: 58,
  SCRATCH: 59,
  SHELL: 60,
  SWIFT: 61,
  THRIFT: 62,
  TYPESCRIPT: 63,
  VBSCRIPT: 64,
  VISUAL_BASIC: 65,
  XML: 66,
  YAML: 67,
} as const;

export type CodeLanguageValue = typeof CODE_LANGUAGE[keyof typeof CODE_LANGUAGE];

/** 代码语言名称映射 (数值 -> 字符串) */
export const CODE_LANGUAGE_NAME: Record<number, string> = {
  [CODE_LANGUAGE.PLAIN_TEXT]: 'PlainText',
  [CODE_LANGUAGE.ABAP]: 'ABAP',
  [CODE_LANGUAGE.ADA]: 'Ada',
  [CODE_LANGUAGE.APACHE]: 'Apache',
  [CODE_LANGUAGE.APEX]: 'Apex',
  [CODE_LANGUAGE.ASSEMBLY]: 'Assembly',
  [CODE_LANGUAGE.BASH]: 'Bash',
  [CODE_LANGUAGE.CSHARP]: 'C#',
  [CODE_LANGUAGE.CPP]: 'C++',
  [CODE_LANGUAGE.C]: 'C',
  [CODE_LANGUAGE.COBOL]: 'COBOL',
  [CODE_LANGUAGE.CSS]: 'CSS',
  [CODE_LANGUAGE.COFFEESCRIPT]: 'CoffeeScript',
  [CODE_LANGUAGE.D]: 'D',
  [CODE_LANGUAGE.DART]: 'Dart',
  [CODE_LANGUAGE.DELPHI]: 'Delphi',
  [CODE_LANGUAGE.DJANGO]: 'Django',
  [CODE_LANGUAGE.DOCKERFILE]: 'Dockerfile',
  [CODE_LANGUAGE.ERLANG]: 'Erlang',
  [CODE_LANGUAGE.FORTRAN]: 'Fortran',
  [CODE_LANGUAGE.FOXPRO]: 'FoxPro',
  [CODE_LANGUAGE.GO]: 'Go',
  [CODE_LANGUAGE.GROOVY]: 'Groovy',
  [CODE_LANGUAGE.HTML]: 'HTML',
  [CODE_LANGUAGE.HTMLBARS]: 'HTMLBars',
  [CODE_LANGUAGE.HTTP]: 'HTTP',
  [CODE_LANGUAGE.HASKELL]: 'Haskell',
  [CODE_LANGUAGE.JSON]: 'JSON',
  [CODE_LANGUAGE.JAVA]: 'Java',
  [CODE_LANGUAGE.JAVASCRIPT]: 'JavaScript',
  [CODE_LANGUAGE.JULIA]: 'Julia',
  [CODE_LANGUAGE.KOTLIN]: 'Kotlin',
  [CODE_LANGUAGE.LATEX]: 'LaTeX',
  [CODE_LANGUAGE.LISP]: 'Lisp',
  [CODE_LANGUAGE.LOGO]: 'Logo',
  [CODE_LANGUAGE.LUA]: 'Lua',
  [CODE_LANGUAGE.MATLAB]: 'MATLAB',
  [CODE_LANGUAGE.MAKEFILE]: 'Makefile',
  [CODE_LANGUAGE.MARKDOWN]: 'Markdown',
  [CODE_LANGUAGE.NGINX]: 'Nginx',
  [CODE_LANGUAGE.OBJECTIVE_C]: 'Objective-C',
  [CODE_LANGUAGE.OPENEDGE_ABL]: 'OpenEdge ABL',
  [CODE_LANGUAGE.PHP]: 'PHP',
  [CODE_LANGUAGE.PERL]: 'Perl',
  [CODE_LANGUAGE.POSTSCRIPT]: 'PostScript',
  [CODE_LANGUAGE.POWERSHELL]: 'PowerShell',
  [CODE_LANGUAGE.PROLOG]: 'Prolog',
  [CODE_LANGUAGE.PROTOBUF]: 'ProtoBuf',
  [CODE_LANGUAGE.PYTHON]: 'Python',
  [CODE_LANGUAGE.R]: 'R',
  [CODE_LANGUAGE.RPG]: 'RPG',
  [CODE_LANGUAGE.RUBY]: 'Ruby',
  [CODE_LANGUAGE.RUST]: 'Rust',
  [CODE_LANGUAGE.SAS]: 'SAS',
  [CODE_LANGUAGE.SCSS]: 'SCSS',
  [CODE_LANGUAGE.SQL]: 'SQL',
  [CODE_LANGUAGE.SCALA]: 'Scala',
  [CODE_LANGUAGE.SCHEME]: 'Scheme',
  [CODE_LANGUAGE.SCRATCH]: 'Scratch',
  [CODE_LANGUAGE.SHELL]: 'Shell',
  [CODE_LANGUAGE.SWIFT]: 'Swift',
  [CODE_LANGUAGE.THRIFT]: 'Thrift',
  [CODE_LANGUAGE.TYPESCRIPT]: 'TypeScript',
  [CODE_LANGUAGE.VBSCRIPT]: 'VBScript',
  [CODE_LANGUAGE.VISUAL_BASIC]: 'Visual Basic',
  [CODE_LANGUAGE.XML]: 'XML',
  [CODE_LANGUAGE.YAML]: 'YAML',
};

/** 文本对齐方式 */
export const TEXT_ALIGN = {
  LEFT: 1,
  CENTER: 2,
  RIGHT: 3,
} as const;

/** 背景颜色 */
export const BACKGROUND_COLOR = {
  LIGHT_GRAY: 'LightGrayBackground',
  LIGHT_RED: 'LightRedBackground',
  LIGHT_ORANGE: 'LightOrangeBackground',
  LIGHT_YELLOW: 'LightYellowBackground',
  LIGHT_GREEN: 'LightGreenBackground',
  LIGHT_BLUE: 'LightBlueBackground',
  LIGHT_PURPLE: 'LightPurpleBackground',
  PALE_GRAY: 'PaleGrayBackground',
  DARK_GRAY: 'DarkGrayBackground',
  DARK_RED: 'DarkRedBackground',
  DARK_ORANGE: 'DarkOrangeBackground',
  DARK_YELLOW: 'DarkYellowBackground',
  DARK_GREEN: 'DarkGreenBackground',
  DARK_BLUE: 'DarkBlueBackground',
  DARK_PURPLE: 'DarkPurpleBackground',
} as const;

/** 缩进级别 */
export const INDENTATION_LEVEL = {
  NO_INDENT: 'NoIndent',
  ONE_LEVEL: 'OneLevelIndent',
} as const;

/** iframe 类型 */
export const IFRAME_TYPE = {
  GENERAL: 1,
  BILIBILI: 2,
  XIGUA: 3,
  YOUTUBE: 4,
  YOUKU: 5,
} as const;

// ============ 辅助函数 ============

/**
 * 获取块类型名称
 */
export function getBlockTypeName(type: number): string {
  return BLOCK_TYPE_NAME[type] || 'unknown';
}

/**
 * 获取代码语言名称
 */
export function getCodeLanguageName(lang: number): string {
  return CODE_LANGUAGE_NAME[lang] || 'PlainText';
}

/**
 * 根据文件扩展名推断代码语言
 */
export function inferCodeLanguage(filename: string): CodeLanguageValue {
  const ext = filename.split('.').pop()?.toLowerCase();
  const extMap: Record<string, CodeLanguageValue> = {
    'js': CODE_LANGUAGE.JAVASCRIPT,
    'mjs': CODE_LANGUAGE.JAVASCRIPT,
    'cjs': CODE_LANGUAGE.JAVASCRIPT,
    'ts': CODE_LANGUAGE.TYPESCRIPT,
    'tsx': CODE_LANGUAGE.TYPESCRIPT,
    'jsx': CODE_LANGUAGE.JAVASCRIPT,
    'py': CODE_LANGUAGE.PYTHON,
    'rb': CODE_LANGUAGE.RUBY,
    'go': CODE_LANGUAGE.GO,
    'rs': CODE_LANGUAGE.RUST,
    'java': CODE_LANGUAGE.JAVA,
    'kt': CODE_LANGUAGE.KOTLIN,
    'swift': CODE_LANGUAGE.SWIFT,
    'c': CODE_LANGUAGE.C,
    'cpp': CODE_LANGUAGE.CPP,
    'cc': CODE_LANGUAGE.CPP,
    'cxx': CODE_LANGUAGE.CPP,
    'h': CODE_LANGUAGE.C,
    'hpp': CODE_LANGUAGE.CPP,
    'cs': CODE_LANGUAGE.CSHARP,
    'php': CODE_LANGUAGE.PHP,
    'sql': CODE_LANGUAGE.SQL,
    'html': CODE_LANGUAGE.HTML,
    'htm': CODE_LANGUAGE.HTML,
    'css': CODE_LANGUAGE.CSS,
    'scss': CODE_LANGUAGE.SCSS,
    'json': CODE_LANGUAGE.JSON,
    'xml': CODE_LANGUAGE.XML,
    'yaml': CODE_LANGUAGE.YAML,
    'yml': CODE_LANGUAGE.YAML,
    'md': CODE_LANGUAGE.MARKDOWN,
    'sh': CODE_LANGUAGE.SHELL,
    'bash': CODE_LANGUAGE.BASH,
    'zsh': CODE_LANGUAGE.SHELL,
    'dockerfile': CODE_LANGUAGE.DOCKERFILE,
    'makefile': CODE_LANGUAGE.MAKEFILE,
    'lua': CODE_LANGUAGE.LUA,
    'r': CODE_LANGUAGE.R,
    'scala': CODE_LANGUAGE.SCALA,
    'dart': CODE_LANGUAGE.DART,
    'groovy': CODE_LANGUAGE.GROOVY,
    'perl': CODE_LANGUAGE.PERL,
    'pl': CODE_LANGUAGE.PERL,
  };
  return extMap[ext || ''] || CODE_LANGUAGE.PLAIN_TEXT;
}

/**
 * 判断是否为标题块类型
 */
export function isHeadingBlock(type: number): boolean {
  return type >= BLOCK_TYPE.HEADING1 && type <= BLOCK_TYPE.HEADING9;
}

/**
 * 判断是否为列表块类型
 */
export function isListBlock(type: number): boolean {
  return type === BLOCK_TYPE.BULLET || type === BLOCK_TYPE.ORDERED;
}

/**
 * 判断是否为容器块类型（可以包含子块）
 */
export function isContainerBlock(type: number): boolean {
  const containerTypes: number[] = [
    BLOCK_TYPE.PAGE,
    BLOCK_TYPE.QUOTE_CONTAINER,
    BLOCK_TYPE.CALLOUT,
    BLOCK_TYPE.GRID,
    BLOCK_TYPE.GRID_COLUMN,
    BLOCK_TYPE.TABLE,
    BLOCK_TYPE.TABLE_CELL,
  ];
  return containerTypes.includes(type);
}
