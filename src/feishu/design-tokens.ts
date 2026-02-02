/**
 * 飞书卡片设计令牌系统
 * 集中管理颜色、emoji、标签等设计元素
 * 对齐 OpenCode Web 样式
 */

/** 飞书卡片模板颜色 */
export type CardTemplate = 
  | 'blue' 
  | 'wathet' 
  | 'turquoise' 
  | 'green' 
  | 'yellow' 
  | 'orange' 
  | 'red' 
  | 'carmine' 
  | 'violet' 
  | 'purple' 
  | 'indigo' 
  | 'grey';

/** 
 * 语义化颜色映射 - 现代专业风配色方案
 * 
 * 设计理念：
 * - 使用更沉稳、精致的色彩替代传统的红绿蓝
 * - indigo(靛蓝) 作为主色调，传达专业与可靠
 * - turquoise(青绿) 用于成功状态，清新而不刺眼
 * - carmine(洋红) 用于错误，警示但不压抑
 * - violet(紫罗兰) 用于处理中状态，有科技感
 */
export const colors = {
  // 状态颜色
  success: 'turquoise' as CardTemplate,    // 青绿：清新现代的成功色
  error: 'carmine' as CardTemplate,         // 洋红：精致的错误警示
  warning: 'orange' as CardTemplate,        // 橙色：保持经典警告色
  info: 'indigo' as CardTemplate,           // 靛蓝：沉稳专业的信息色
  
  // 进程状态
  processing: 'violet' as CardTemplate,     // 紫罗兰：科技感的处理中
  pending: 'violet' as CardTemplate,        // 紫罗兰：等待状态
  running: 'violet' as CardTemplate,        // 紫罗兰：运行中
  complete: 'turquoise' as CardTemplate,    // 青绿：与成功一致
  
  // 中性色
  neutral: 'grey' as CardTemplate,          // 灰色：中性背景
  primary: 'indigo' as CardTemplate,        // 靛蓝：主色调
  
  // 特殊用途
  question: 'yellow' as CardTemplate,       // 黄色：明快的询问提示
  welcome: 'violet' as CardTemplate,        // 紫罗兰：优雅的欢迎
} as const;

/** 状态 Emoji 映射 */
export const emoji = {
  // 状态指示
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  
  // 进程状态
  pending: '⏳',
  running: '🔄',
  complete: '✅',
  
  // 工具类型
  tool: '🔧',
  thinking: '💭',
  
  // 文件操作
  file: '📄',
  fileRead: '📖',
  folder: '📁',
  
  // 搜索
  search: '🔍',
  
  // 任务
  task: '📋',
  taskPending: '⬜',
  taskInProgress: '🔄',
  taskComplete: '✅',
  taskCancelled: '❌',
  
  // 优先级
  priorityHigh: '🔴',
  priorityMedium: '🟡',
  priorityLow: '🟢',
  
  // 代理
  agent: '🤖',
  
  // 命令
  bash: '💻',
  
  // 编辑
  edit: '✏️',
  
  // 子任务摘要
  summary: '📊',
  changes: '📝',
  tools: '🔧',
  conclusion: '💬',
} as const;

/** 工具友好名称映射 - 用于面板标题显示 */
export const toolDisplayNames: Record<string, { name: string; emoji: string }> = {
  // 文件操作
  read: { name: '读取文件', emoji: '📖' },
  write: { name: '写入文件', emoji: '📝' },
  edit: { name: '编辑文件', emoji: '✏️' },
  
  // 搜索
  glob: { name: '搜索文件', emoji: '🔍' },
  grep: { name: '搜索内容', emoji: '🔎' },
  
  // 执行
  bash: { name: '执行命令', emoji: '💻' },
  
  // 任务管理
  todowrite: { name: '任务列表', emoji: '📋' },
  todoread: { name: '查看任务', emoji: '📋' },
  
  // 代理/子任务
  delegate_task: { name: '子任务', emoji: '🤖' },
  task: { name: '子任务', emoji: '🤖' },
  
  // LSP 工具
  lsp_diagnostics: { name: '代码诊断', emoji: '🔬' },
  lsp_goto_definition: { name: '跳转定义', emoji: '🔗' },
  lsp_find_references: { name: '查找引用', emoji: '🔗' },
  lsp_symbols: { name: '符号列表', emoji: '📑' },
  lsp_rename: { name: '重命名', emoji: '✏️' },
  lsp_prepare_rename: { name: '准备重命名', emoji: '✏️' },
  
  // AST 工具
  ast_grep_search: { name: 'AST搜索', emoji: '🌳' },
  ast_grep_replace: { name: 'AST替换', emoji: '🌳' },
  
  // 网络
  webfetch: { name: '获取网页', emoji: '🌐' },
  websearch_web_search_exa: { name: '网页搜索', emoji: '🔍' },
  
  // 问题交互
  question: { name: '询问用户', emoji: '❓' },
  
  // 技能
  skill: { name: '加载技能', emoji: '🎯' },
  slashcommand: { name: '执行命令', emoji: '⚡' },
  
  // 会话
  session_list: { name: '会话列表', emoji: '📂' },
  session_read: { name: '读取会话', emoji: '📖' },
  session_search: { name: '搜索会话', emoji: '🔍' },
  session_info: { name: '会话信息', emoji: 'ℹ️' },
  
  // 后台任务
  background_output: { name: '后台输出', emoji: '📤' },
  background_cancel: { name: '取消后台', emoji: '🚫' },
  
  // 媒体
  look_at: { name: '查看文件', emoji: '👁️' },
  
  // Context7
  'context7_resolve-library-id': { name: '解析库ID', emoji: '📚' },
  'context7_query-docs': { name: '查询文档', emoji: '📚' },
  
  // GitHub
  grep_app_searchGitHub: { name: 'GitHub搜索', emoji: '🐙' },
  
  // 交互式
  interactive_bash: { name: '交互终端', emoji: '🖥️' },
  
  // MCP
  skill_mcp: { name: 'MCP调用', emoji: '🔌' },
};

/** 中文标签映射 */
export const labels = {
  // 卡片状态标题
  processing: '处理中...',
  thinking: '思考中...',
  complete: '响应完成',
  error: '错误',
  
  // 面板标题
  thinkingProcess: '思考过程',
  outputResult: '输出结果',
  subTaskRunning: '子任务 - 执行中',
  subTaskComplete: '子任务 - 完成',
  subTaskError: '子任务 - 错误',
  
  // 子任务摘要
  subtaskSummary: '执行摘要',
  subtaskDetail: '详细输出',
  subtaskPrompt: '任务详情',
  subtaskExecuting: '正在执行',
  subtaskToolsUsed: '已调用 {n} 个工具',
  filesModified: '修改 {n} 个文件',
  linesChanged: '+{add} / -{del}',
  toolsCalled: '调用 {n} 个工具',
  noChanges: '无文件变更',
  
  // 内容提示
  executing: '执行中...',
  reading: '读取中...',
  searching: '搜索中...',
  noContent: '（无内容）',
  contentTruncated: '(内容已截断)',
  thinkingTruncated: '(思考内容已截断)',
  outputTruncated: '(输出已截断)',
  diffTruncated: '(diff 已截断)',
  
  // 任务状态
  noTasks: '暂无任务',
  moreLines: '还有 {n} 行',
  moreResults: '还有 {n} 个结果',
  foundResults: '找到 {n} 个结果',
  
  // 错误
  errorPrefix: '错误：',
  
  // 提示
  backgroundRunning: '(后台运行)',
} as const;

/** 设计令牌集合 */
export const tokens = {
  colors,
  emoji,
  labels,
} as const;

export function getColorForStatus(status: string): CardTemplate {
  const normalizedStatus = status.toLowerCase();
  
  if (normalizedStatus.includes('error') || normalizedStatus.includes('failed') || normalizedStatus === '错误') {
    return colors.error;
  }
  
  if (normalizedStatus.includes('complete') || normalizedStatus.includes('success') || 
      normalizedStatus.includes('done') || normalizedStatus === '完成') {
    return colors.complete;
  }
  
  if (normalizedStatus.includes('running') || normalizedStatus.includes('processing') || 
      normalizedStatus.includes('pending') || normalizedStatus === '处理中') {
    return colors.processing;
  }
  
  if (normalizedStatus.includes('warning') || normalizedStatus.includes('warn')) {
    return colors.warning;
  }
  
  return colors.info;
}

export function getEmojiForStatus(status: string): string {
  const normalizedStatus = status.toLowerCase();
  
  switch (normalizedStatus) {
    case 'running':
    case 'pending':
    case 'in_progress':
      return emoji.pending;
    
    case 'completed':
    case 'complete':
    case 'success':
    case 'done':
      return emoji.success;
    
    case 'error':
    case 'failed':
    case 'failure':
      return emoji.error;
    
    case 'warning':
    case 'warn':
      return emoji.warning;
    
    default:
      return emoji.tool;
  }
}

/** @param time 时间对象含 start/end 毫秒时间戳，返回如 " (1.2s)" */
export function formatDuration(time?: { start: number; end?: number }): string {
  if (!time || !time.start) return '';
  
  const endTime = time.end ?? Date.now();
  const durationMs = endTime - time.start;
  const durationSec = durationMs / 1000;
  
  if (durationSec < 0.1) return '';
  
  return ` (${durationSec.toFixed(1)}s)`;
}

export function getEmojiForPriority(priority: string): string {
  switch (priority.toLowerCase()) {
    case 'high':
      return emoji.priorityHigh;
    case 'medium':
      return emoji.priorityMedium;
    case 'low':
      return emoji.priorityLow;
    default:
      return '';
  }
}

export function getEmojiForTaskStatus(status: string): string {
  switch (status.toLowerCase()) {
    case 'pending':
      return emoji.taskPending;
    case 'in_progress':
      return emoji.taskInProgress;
    case 'completed':
      return emoji.taskComplete;
    case 'cancelled':
      return emoji.taskCancelled;
    default:
      return emoji.taskPending;
  }
}

export function formatLabel(template: string, values: Record<string, string | number>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(`{${key}}`, String(value));
  }
  return result;
}
