/**
 * 飞书卡片格式化模块
 * 提供卡片构建和内容格式化功能
 */

import { 
  type CardTemplate, 
  colors, 
  emoji, 
  labels, 
  getColorForStatus, 
  getEmojiForStatus,
  getEmojiForTaskStatus,
  getEmojiForPriority,
  formatDuration,
  toolDisplayNames,
} from './design-tokens';

export type { CardTemplate };

/** 卡片标题 */
export interface CardHeader {
  title: {
    tag: 'plain_text';
    content: string;
  };
  template?: CardTemplate;
}

/** 飞书卡片结构 */
export interface FeishuCard {
  config?: {
    wide_screen_mode?: boolean;
  };
  header?: CardHeader;
  elements: CardElement[];
}

export type CardElement = MarkdownElement | DivElement | HrElement | NoteElement;

export interface MarkdownElement {
  tag: 'markdown';
  content: string;
}

export interface DivElement {
  tag: 'div';
  text: {
    tag: 'plain_text' | 'lark_md';
    content: string;
  };
}

export interface HrElement {
  tag: 'hr';
}

export interface NoteElement {
  tag: 'note';
  elements: Array<{
    tag: 'plain_text' | 'lark_md';
    content: string;
  }>;
}

// 卡片内容最大长度（飞书限制）
const MAX_CARD_CONTENT_LENGTH = 28000;
const TRUNCATION_SUFFIX = `\n\n... ${labels.contentTruncated}`;

/** 创建卡片 */
export function createCard(content: string, title?: string, template?: CardTemplate): FeishuCard {
  const truncatedContent = truncateContent(content);
  
  const card: FeishuCard = {
    config: { wide_screen_mode: true },
    elements: [{
      tag: 'markdown',
      content: truncatedContent,
    }],
  };

  if (title) {
    card.header = {
      title: { tag: 'plain_text', content: title },
      template: template ?? 'indigo',  // 靛蓝：专业主色调
    };
  }

  return card;
}

/** 创建状态卡片 */
export function createStatusCard(status: string, details?: string): FeishuCard {
  const template = getColorForStatus(status);

  const elements: CardElement[] = [{
    tag: 'markdown',
    content: details ?? status,
  }];

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: status },
      template,
    },
    elements,
  };
}

/** 格式化代码块 */
export function formatCodeBlock(code: string, language?: string): string {
  const lang = language ?? '';
  return `\`\`\`${lang}\n${code}\n\`\`\``;
}

/** 格式化工具输出 */
export function formatToolOutput(toolName: string, status: string, output?: string): string {
  const statusEmoji = getEmojiForStatus(status);
  let result = `**${statusEmoji} ${toolName}**`;
  
  if (output) {
    const truncatedOutput = output.length > 2000 
      ? output.slice(0, 2000) + '... (输出已截断)'
      : output;
    result += `\n${formatCodeBlock(truncatedOutput)}`;
  }
  
  return result;
}

import { resolve, isAbsolute } from 'node:path';

function isPathKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return lowerKey.includes('path') || lowerKey.includes('file') || lowerKey === 'workdir';
}

function ensureAbsolutePath(value: string): string {
  if (isAbsolute(value)) {
    return value;
  }
  return resolve(process.cwd(), value);
}

function formatToolInput(input: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    
    let displayValue: string;
    if (typeof value === 'string') {
      let processedValue = value;
      if (isPathKey(key) && value.trim()) {
        processedValue = ensureAbsolutePath(value);
      }
      displayValue = processedValue.length > 100 ? processedValue.slice(0, 100) + '...' : processedValue;
    } else {
      displayValue = JSON.stringify(value);
      if (displayValue.length > 100) {
        displayValue = displayValue.slice(0, 100) + '...';
      }
    }
    lines.push(`**${key}**: \`${displayValue}\``);
  }
  return lines.join('\n');
}

function escapeCodeBlockContent(text: string): string {
  return text.replace(/```/g, '` ` `');
}

/** 格式化思考块 */
export function formatThinkingBlock(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  
  const lines = trimmed.split('\n');
  const maxLines = 5;
  const maxLineLength = 80;
  
  const formattedLines = lines.slice(0, maxLines).map(line => {
    const truncatedLine = line.length > maxLineLength 
      ? line.slice(0, maxLineLength) + '...' 
      : line;
    return `> ${truncatedLine}`;
  });
  
  if (lines.length > maxLines) {
    formattedLines.push(`> *... ${labels.moreLines.replace('{n}', String(lines.length - maxLines))}*`);
  }
  
  return formattedLines.join('\n');
}

/** 格式化错误信息 */
export function formatError(error: string): string {
  return `**${emoji.error} ${labels.error}**\n${formatCodeBlock(error)}`;
}

/** 截断内容以符合飞书限制 */
export function truncateContent(content: string): string {
  if (content.length <= MAX_CARD_CONTENT_LENGTH) {
    return content;
  }
  
  const availableLength = MAX_CARD_CONTENT_LENGTH - TRUNCATION_SUFFIX.length;
  return content.slice(0, availableLength) + TRUNCATION_SUFFIX;
}

/** 转义 Markdown 特殊字符 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!');
}

/** 格式化消息部分 */
export function formatMessageParts(parts: Array<{ type: string; text?: string; name?: string; state?: string; output?: string }>): string {
  const formattedParts: string[] = [];

  for (const part of parts) {
    switch (part.type) {
      case 'text':
        if (part.text) {
          formattedParts.push(part.text);
        }
        break;
      
      case 'reasoning':
        if (part.text) {
          formattedParts.push(formatThinkingBlock(part.text));
        }
        break;
      
      case 'tool-call':
        if (part.name) {
          formattedParts.push(formatToolOutput(
            part.name,
            part.state ?? 'pending',
            part.output
          ));
        }
        break;
    }
  }

  return formattedParts.join('\n\n');
}

export interface StreamingCardParts {
  textContent: string;
  reasoningContent: string;
  toolCalls: Array<{
    name: string;
    state: string;
    title?: string;
    input?: Record<string, unknown>;
    output?: string;
    error?: string;
  }>;
}

export interface SubtaskMetadata {
  agentType?: string;
  description?: string;
  toolCount?: number;
  currentTool?: string;
  summary?: {
    files: number;
    additions: number;
    deletions: number;
  };
  conclusion?: string;
  prompt?: string;
  /** 子会话的流式文本输出 */
  streamingText?: string;
}

export interface OrderedPart {
  type: 'text' | 'reasoning' | 'tool-call';
  text?: string;
  name?: string;
  state?: string;
  title?: string;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  time?: { start: number; end?: number };
  subtask?: SubtaskMetadata;
}

export function categorizeMessageParts(parts: Array<{ type: string; text?: string; name?: string; state?: string; title?: string; input?: Record<string, unknown>; output?: string; error?: string }>): StreamingCardParts {
  const result: StreamingCardParts = {
    textContent: '',
    reasoningContent: '',
    toolCalls: [],
  };

  const textParts: string[] = [];
  const reasoningParts: string[] = [];

  for (const part of parts) {
    switch (part.type) {
      case 'text':
        if (part.text) textParts.push(part.text);
        break;
      case 'reasoning':
        if (part.text) reasoningParts.push(part.text);
        break;
      case 'tool-call':
        if (part.name) {
          result.toolCalls.push({
            name: part.name,
            state: part.state ?? 'pending',
            title: part.title,
            input: part.input,
            output: part.output,
            error: part.error,
          });
        }
        break;
    }
  }

  result.textContent = textParts.join('\n\n');
  result.reasoningContent = reasoningParts.join('\n\n');
  return result;
}

interface PartGroup {
  type: 'reasoning' | 'tool-call' | 'text';
  parts: OrderedPart[];
}

function groupConsecutiveParts(parts: OrderedPart[]): PartGroup[] {
  const groups: PartGroup[] = [];
  
  for (const part of parts) {
    const lastGroup = groups[groups.length - 1];
    
    if (lastGroup && lastGroup.type === part.type) {
      lastGroup.parts.push(part);
    } else {
      groups.push({
        type: part.type,
        parts: [part],
      });
    }
  }
  
  return groups;
}

function estimateElementSize(element: object): number {
  return JSON.stringify(element).length;
}

const MAX_CARD_SIZE = 25000;
const MAX_REASONING_LENGTH = 3000;
const MAX_TOOL_OUTPUT_LENGTH = 5000;

// ============ 特殊工具格式化 ============

function truncatePath(path: string, maxLen = 40): string {
  if (path.length <= maxLen) return path;
  const parts = path.split('/');
  if (parts.length <= 2) return '...' + path.slice(-maxLen + 3);
  const filename = parts[parts.length - 1] ?? '';
  const parent = parts[parts.length - 2] ?? '';
  return `.../${parent}/${filename}`.slice(-maxLen);
}

function truncateText(text: string, maxLen = 30): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

interface TodoStats {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
}

function getTodoStats(input: Record<string, unknown>): TodoStats | null {
  const todos = input.todos as Array<{ status: string }> | undefined;
  if (!todos || !Array.isArray(todos) || todos.length === 0) return null;
  
  return {
    total: todos.length,
    completed: todos.filter(t => t.status === 'completed').length,
    inProgress: todos.filter(t => t.status === 'in_progress').length,
    pending: todos.filter(t => t.status === 'pending').length,
  };
}

function getToolPanelTitle(
  toolName: string, 
  input?: Record<string, unknown>,
  fallbackTitle?: string
): string {
  const toolInfo = toolDisplayNames[toolName.toLowerCase()];
  const displayEmoji = toolInfo?.emoji ?? emoji.tool;
  const displayName = toolInfo?.name ?? fallbackTitle ?? toolName;
  
  if (!input) return `${displayEmoji} ${displayName}`;
  
  const lowerName = toolName.toLowerCase();
  
  switch (lowerName) {
    case 'read': {
      const filePath = input.filePath as string | undefined;
      if (filePath) {
        const offset = input.offset as number | undefined;
        const limit = input.limit as number | undefined;
        let suffix = '';
        if (offset !== undefined || limit !== undefined) {
          const parts: string[] = [];
          if (offset !== undefined) parts.push(`L${offset + 1}`);
          if (limit !== undefined) parts.push(`${limit}行`);
          suffix = ` (${parts.join(', ')})`;
        }
        return `${displayEmoji} ${truncatePath(filePath)}${suffix}`;
      }
      break;
    }
    
    case 'write': {
      const filePath = input.filePath as string | undefined;
      if (filePath) return `${displayEmoji} ${truncatePath(filePath)}`;
      break;
    }
    
    case 'edit': {
      const filePath = input.filePath as string | undefined;
      const replaceAll = input.replaceAll as boolean | undefined;
      if (filePath) {
        const suffix = replaceAll ? ' (全部)' : '';
        return `${displayEmoji} ${truncatePath(filePath)}${suffix}`;
      }
      break;
    }
    
    case 'bash': {
      const command = input.command as string | undefined;
      const description = input.description as string | undefined;
      if (description) return `${displayEmoji} ${truncateText(description, 35)}`;
      if (command) return `${displayEmoji} ${truncateText(command, 35)}`;
      break;
    }
    
    case 'glob': {
      const pattern = input.pattern as string | undefined;
      if (pattern) return `${displayEmoji} ${truncateText(pattern, 30)}`;
      break;
    }
    
    case 'grep': {
      const pattern = input.pattern as string | undefined;
      if (pattern) return `${displayEmoji} "${truncateText(pattern, 25)}"`;
      break;
    }
    
    case 'todowrite': {
      const stats = getTodoStats(input);
      if (stats) {
        const parts: string[] = [`${stats.completed}/${stats.total}`];
        if (stats.inProgress > 0) parts.push(`${stats.inProgress}进行中`);
        return `${displayEmoji} ${displayName} (${parts.join(', ')})`;
      }
      break;
    }
    
    case 'delegate_task':
    case 'task': {
      const description = input.description as string | undefined;
      const subagentType = input.subagent_type as string | undefined;
      const category = input.category as string | undefined;
      const agent = subagentType || category || 'agent';
      if (description && description !== '子任务') {
        return `${displayEmoji} ${agent}: ${truncateText(description, 25)}`;
      }
      return `${displayEmoji} ${agent}`;
    }
    
    case 'lsp_diagnostics': {
      const filePath = input.filePath as string | undefined;
      if (filePath) return `${displayEmoji} ${truncatePath(filePath)}`;
      break;
    }
    
    case 'lsp_goto_definition':
    case 'lsp_find_references': {
      const filePath = input.filePath as string | undefined;
      const line = input.line as number | undefined;
      if (filePath && line !== undefined) {
        return `${displayEmoji} ${truncatePath(filePath)}:${line}`;
      }
      break;
    }
    
    case 'webfetch': {
      const url = input.url as string | undefined;
      if (url) {
        try {
          const hostname = new URL(url).hostname;
          return `${displayEmoji} ${hostname}`;
        } catch {
          return `${displayEmoji} ${truncateText(url, 30)}`;
        }
      }
      break;
    }
    
    case 'websearch_web_search_exa': {
      const query = input.query as string | undefined;
      if (query) return `${displayEmoji} "${truncateText(query, 25)}"`;
      break;
    }
    
    case 'look_at': {
      const filePath = input.file_path as string | undefined;
      if (filePath) return `${displayEmoji} ${truncatePath(filePath)}`;
      break;
    }
    
    case 'ast_grep_search':
    case 'ast_grep_replace': {
      const pattern = input.pattern as string | undefined;
      if (pattern) return `${displayEmoji} ${truncateText(pattern, 25)}`;
      break;
    }
    
    case 'question': {
      const questions = input.questions as Array<{ question?: string }> | undefined;
      if (questions && questions[0]?.question) {
        return `${displayEmoji} ${truncateText(questions[0].question, 30)}`;
      }
      break;
    }
    
    case 'skill':
    case 'slashcommand': {
      const name = (input.name as string) || (input.command as string);
      if (name) return `${displayEmoji} ${name}`;
      break;
    }
  }
  
  return `${displayEmoji} ${displayName}`;
}

/** Todo 项目接口 */
interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
}

/** 格式化 Todo 工具输出 */
function formatTodoTool(input: Record<string, unknown>): object[] {
  const todos = input.todos as TodoItem[] | undefined;
  if (!todos || !Array.isArray(todos) || todos.length === 0) {
    return [{ tag: 'markdown', content: `*${labels.noTasks}*` }];
  }

  const stats = getTodoStats(input);
  const lines: string[] = [];
  
  if (stats) {
    const progressParts: string[] = [];
    if (stats.completed > 0) progressParts.push(`✅ ${stats.completed}`);
    if (stats.inProgress > 0) progressParts.push(`🔄 ${stats.inProgress}`);
    if (stats.pending > 0) progressParts.push(`⬜ ${stats.pending}`);
    lines.push(`**进度: ${stats.completed}/${stats.total}** (${progressParts.join(' | ')})\n`);
  }

  for (const todo of todos) {
    const statusIcon = getEmojiForTaskStatus(todo.status);
    const priorityIcon = getEmojiForPriority(todo.priority);
    const strikethrough = todo.status === 'completed' || todo.status === 'cancelled';
    const content = strikethrough ? `~~${todo.content}~~` : todo.content;
    lines.push(`${statusIcon} ${priorityIcon} ${content}`);
  }

  return [{ tag: 'markdown', content: lines.join('\n') }];
}

/** 格式化 Edit 工具为 Diff 视图 */
function formatEditTool(input: Record<string, unknown>, output?: string, error?: string): object[] {
  const elements: object[] = [];
  
  const filePath = input.filePath as string | undefined;
  const oldString = input.oldString as string | undefined;
  const newString = input.newString as string | undefined;
  const replaceAll = input.replaceAll as boolean | undefined;
  
  if (filePath) {
    elements.push({
      tag: 'markdown',
      content: `**${emoji.file} ${filePath}**${replaceAll ? ' *(全部替换)*' : ''}`,
    });
  }
  
  if (oldString !== undefined && newString !== undefined) {
    const diffLines: string[] = [];
    
    const oldLines = oldString.split('\n');
    for (const line of oldLines) {
      diffLines.push(`- ${line}`);
    }
    
    const newLines = newString.split('\n');
    for (const line of newLines) {
      diffLines.push(`+ ${line}`);
    }
    
    const diffContent = diffLines.join('\n');
    const truncatedDiff = diffContent.length > 2000 
      ? diffContent.slice(0, 2000) + `\n... ${labels.diffTruncated}`
      : diffContent;
    
    elements.push({
      tag: 'markdown',
      content: '```diff\n' + escapeCodeBlockContent(truncatedDiff) + '\n```',
    });
  }
  
  // 错误信息
  if (error) {
    elements.push({
      tag: 'markdown',
      content: `**${emoji.error} ${labels.errorPrefix}** ${error}`,
    });
  }
  
  return elements.length > 0 ? elements : [{ tag: 'markdown', content: `*${labels.executing}*` }];
}

function formatReadTool(input: Record<string, unknown>, output?: string): object[] {
  const elements: object[] = [];
  
  const filePath = input.filePath as string | undefined;
  const offset = input.offset as number | undefined;
  const limit = input.limit as number | undefined;
  
  if (filePath) {
    let pathInfo = `**${emoji.fileRead} ${filePath}**`;
    if (offset !== undefined || limit !== undefined) {
      const rangeInfo: string[] = [];
      if (offset !== undefined) rangeInfo.push(`从第 ${offset + 1} 行`);
      if (limit !== undefined) rangeInfo.push(`读取 ${limit} 行`);
      pathInfo += ` *(${rangeInfo.join(', ')})*`;
    }
    elements.push({ tag: 'markdown', content: pathInfo });
  }
  
  if (output) {
    const lines = output.split('\n');
    const preview = lines.slice(0, 10).join('\n');
    const truncated = lines.length > 10 ? `\n... ${labels.moreLines.replace('{n}', String(lines.length - 10))}` : '';
    elements.push({
      tag: 'markdown', 
      content: '```\n' + escapeCodeBlockContent(preview + truncated) + '\n```',
    });
  }
  
  return elements.length > 0 ? elements : [{ tag: 'markdown', content: `*${labels.reading}*` }];
}

function formatBashTool(input: Record<string, unknown>, output?: string, error?: string): object[] {
  const elements: object[] = [];
  
  const command = input.command as string | undefined;
  const workdir = input.workdir as string | undefined;
  const description = input.description as string | undefined;
  
  if (description) {
    elements.push({ tag: 'markdown', content: `**${description}**` });
  }
  
  if (command) {
    const cmdDisplay = workdir ? `cd ${workdir} && ${command}` : command;
    const truncatedCmd = cmdDisplay.length > 200 ? cmdDisplay.slice(0, 200) + '...' : cmdDisplay;
    elements.push({
      tag: 'markdown',
      content: '```bash\n$ ' + escapeCodeBlockContent(truncatedCmd) + '\n```',
    });
  }
  
  if (error) {
    elements.push({
      tag: 'markdown',
      content: `**${emoji.error} ${labels.errorPrefix}**\n\`\`\`\n` + escapeCodeBlockContent(error.slice(0, 500)) + '\n```',
    });
  } else if (output) {
    const truncatedOutput = output.length > 1000 ? output.slice(0, 1000) + `\n... ${labels.outputTruncated}` : output;
    elements.push({
      tag: 'markdown',
      content: '```\n' + escapeCodeBlockContent(truncatedOutput) + '\n```',
    });
  }
  
  return elements.length > 0 ? elements : [{ tag: 'markdown', content: `*${labels.executing}*` }];
}

function formatSearchTool(toolName: string, input: Record<string, unknown>, output?: string): object[] {
  const elements: object[] = [];
  
  const pattern = input.pattern as string | undefined;
  const path = input.path as string | undefined;
  const include = input.include as string | undefined;
  
  const searchInfo: string[] = [];
  if (pattern) searchInfo.push(`**pattern:** \`${pattern}\``);
  if (path) searchInfo.push(`**path:** \`${path}\``);
  if (include) searchInfo.push(`**include:** \`${include}\``);
  
  if (searchInfo.length > 0) {
    elements.push({ tag: 'markdown', content: searchInfo.join(' | ') });
  }
  
  if (output) {
    const lines = output.split('\n').filter(l => l.trim());
    const fileCount = lines.length;
    const preview = lines.slice(0, 15).join('\n');
    const hasMore = fileCount > 15 ? `\n... ${labels.moreResults.replace('{n}', String(fileCount - 15))}` : '';
    elements.push({
      tag: 'markdown',
      content: `*${labels.foundResults.replace('{n}', String(fileCount))}*\n\`\`\`\n${escapeCodeBlockContent(preview + hasMore)}\n\`\`\``,
    });
  }
  
  return elements.length > 0 ? elements : [{ tag: 'markdown', content: `*${labels.searching}*` }];
}

function formatDelegateTaskTool(
  input: Record<string, unknown>, 
  output?: string, 
  state?: string,
  subtask?: SubtaskMetadata
): object[] {
  const elements: object[] = [];
  
  const description = subtask?.description || (input.description as string | undefined);
  const category = input.category as string | undefined;
  const subagentType = subtask?.agentType || (input.subagent_type as string | undefined);
  const runInBackground = input.run_in_background as boolean | undefined;
  
  const headerLine = subagentType 
    ? `${emoji.agent} **${subagentType}**` 
    : category 
      ? `${emoji.task} **${category}**` 
      : `${emoji.agent} **agent**`;
  const descLine = description && description !== '子任务' ? description : '';
  elements.push({
    tag: 'markdown',
    content: descLine ? `${headerLine}\n${descLine}` : headerLine,
  });
  
  const rawCompleted = state === 'completed' || state === 'complete' || state === 'success';
  const isBackgroundAndJustLaunched = runInBackground && rawCompleted && !subtask?.summary && !subtask?.conclusion;
  
  const isRunning = state === 'running' || state === 'pending' || isBackgroundAndJustLaunched;
  const isCompleted = rawCompleted && !isBackgroundAndJustLaunched;
  const isError = state === 'error' || state === 'failed';
  
  if (isRunning) {
    const statusLines: string[] = [];
    
    if (subtask?.currentTool) {
      statusLines.push(`${emoji.tool} ${labels.subtaskExecuting}: **${subtask.currentTool}**`);
    }
    
    if (subtask?.toolCount && subtask.toolCount > 0) {
      statusLines.push(`${emoji.tools} ${labels.subtaskToolsUsed.replace('{n}', String(subtask.toolCount))}`);
    }
    
    if (statusLines.length === 0) {
      statusLines.push(`${emoji.running} ${labels.subTaskRunning.split(' - ')[1]}...`);
    }
    
    if (runInBackground) {
      statusLines.push(`*${labels.backgroundRunning}*`);
    }
    
    elements.push({
      tag: 'markdown',
      content: `*${statusLines.join(' | ')}*`,
    });
    
    // 显示子会话的流式文本输出
    if (subtask?.streamingText) {
      const truncatedText = subtask.streamingText.length > 500 
        ? subtask.streamingText.slice(0, 500) + '...' 
        : subtask.streamingText;
      elements.push({
        tag: 'markdown',
        content: truncatedText,
      });
    }
    
    const prompt = subtask?.prompt || (input.prompt as string | undefined);
    if (prompt && prompt.length > 0) {
      const truncatedPrompt = prompt.length > 200 ? prompt.slice(0, 200) + '...' : prompt;
      elements.push({
        tag: 'collapsible_panel',
        expanded: false,
        header: { title: { tag: 'plain_text', content: `${emoji.task} ${labels.subtaskPrompt}` } },
        elements: [{
          tag: 'markdown',
          content: truncatedPrompt,
        }],
      });
    }
  }
  
  if (isCompleted && subtask?.summary) {
    const summaryLines: string[] = [];
    
    if (subtask.summary.files > 0) {
      const filesText = labels.filesModified.replace('{n}', String(subtask.summary.files));
      const changesText = labels.linesChanged
        .replace('{add}', String(subtask.summary.additions))
        .replace('{del}', String(subtask.summary.deletions));
      summaryLines.push(`${emoji.folder} ${filesText} (${changesText})`);
    } else {
      summaryLines.push(`${emoji.folder} ${labels.noChanges}`);
    }
    
    if (subtask.toolCount && subtask.toolCount > 0) {
      summaryLines.push(`${emoji.tools} ${labels.toolsCalled.replace('{n}', String(subtask.toolCount))}`);
    }
    
    if (subtask.conclusion) {
      const truncatedConclusion = subtask.conclusion.length > 100 
        ? subtask.conclusion.slice(0, 100) + '...' 
        : subtask.conclusion;
      summaryLines.push(`${emoji.conclusion} ${truncatedConclusion}`);
    }
    
    if (summaryLines.length > 0) {
      elements.push({
        tag: 'collapsible_panel',
        expanded: true,
        header: { title: { tag: 'plain_text', content: `${emoji.summary} ${labels.subtaskSummary}` } },
        elements: [{
          tag: 'markdown',
          content: summaryLines.join('\n'),
        }],
      });
    }
  }
  
  if (isError && output) {
    elements.push({
      tag: 'collapsible_panel',
      expanded: true,
      header: { title: { tag: 'plain_text', content: `${emoji.error} ${labels.error}` } },
      elements: [{
        tag: 'markdown',
        content: '```\n' + escapeCodeBlockContent(output.slice(0, 2000)) + '\n```',
      }],
    });
  } else if (isCompleted && output) {
    const truncatedOutput = output.length > 3000 ? output.slice(0, 3000) + `\n... ${labels.outputTruncated}` : output;
    elements.push({
      tag: 'collapsible_panel',
      expanded: false,
      header: { title: { tag: 'plain_text', content: `${emoji.task} ${labels.subtaskDetail}` } },
      elements: [{
        tag: 'markdown',
        content: '```\n' + escapeCodeBlockContent(truncatedOutput) + '\n```',
      }],
    });
  }
  
  return elements;
}

function getSpecialToolElements(
  toolName: string, 
  input?: Record<string, unknown>, 
  output?: string, 
  error?: string,
  state?: string,
  subtask?: SubtaskMetadata
): object[] | null {
  if (!input) return null;
  
  switch (toolName.toLowerCase()) {
    case 'todowrite':
      return formatTodoTool(input);
    case 'edit':
      return formatEditTool(input, output, error);
    case 'read':
      return formatReadTool(input, output);
    case 'bash':
      return formatBashTool(input, output, error);
    case 'glob':
    case 'grep':
      return formatSearchTool(toolName, input, output);
    case 'delegate_task':
    case 'task':
      return formatDelegateTaskTool(input, output, state, subtask);
    default:
      return null;
  }
}

interface CardBuildResult {
  cards: object[];
  hasMore: boolean;
}

function getDynamicTitle(parts: OrderedPart[]): string {
  const runningTools = parts.filter(p => 
    p.type === 'tool-call' && 
    (p.state === 'running' || p.state === 'pending')
  );
  
  if (runningTools.length > 0) {
    const tool = runningTools[runningTools.length - 1];
    if (tool && tool.name) {
      return `${emoji.running} ${getToolPanelTitle(tool.name, tool.input, tool.title)}`;
    }
  }
  
  return labels.processing;
}

export function buildStreamingCardsV2(
  parts: OrderedPart[],
  isComplete: boolean,
  title?: string
): CardBuildResult {
  const groups = groupConsecutiveParts(parts);
  const cards: object[] = [];
  let currentElements: object[] = [];
  let currentSize = 0;
  let cardIndex = 0;
  let reasoningIndex = 0;
  
  const dynamicTitle = title ?? getDynamicTitle(parts);
  
  const createCard = (elements: object[], isFinal: boolean): object => {
    const template = isFinal && isComplete ? 'turquoise' : 'violet';  // 青绿/紫罗兰
    const headerTitle = isFinal && isComplete ? labels.complete : dynamicTitle;
    const cardTitle = cardIndex > 0 ? `${headerTitle} (续${cardIndex})` : headerTitle;
    
    return {
      schema: '2.0',
      header: {
        title: { tag: 'plain_text', content: cardTitle },
        template,
      },
      body: { elements },
    };
  };
  
  const flushCard = () => {
    if (currentElements.length > 0) {
      cards.push(createCard(currentElements, false));
      cardIndex++;
      currentElements = [];
      currentSize = 0;
    }
  };
  
  const addElement = (element: object) => {
    const elementSize = estimateElementSize(element);
    
    if (currentSize + elementSize > MAX_CARD_SIZE && currentElements.length > 0) {
      flushCard();
    }
    
    currentElements.push(element);
    currentSize += elementSize;
  };
  
  for (const group of groups) {
    switch (group.type) {
      case 'reasoning': {
        reasoningIndex++;
        const reasoningTexts = group.parts
          .map(p => p.text)
          .filter((t): t is string => !!t);
        
        if (reasoningTexts.length === 0) break;
        
        let combinedText = reasoningTexts.join('\n\n');
        if (combinedText.length > MAX_REASONING_LENGTH) {
          combinedText = combinedText.slice(0, MAX_REASONING_LENGTH) + `\n... ${labels.thinkingTruncated}`;
        }
        
        const reasoningTime = group.parts[0]?.time;
        const duration = formatDuration(reasoningTime);
        const baseTitle = groups.filter(g => g.type === 'reasoning').length > 1
          ? `${emoji.thinking} ${labels.thinkingProcess} ${reasoningIndex}`
          : `${emoji.thinking} ${labels.thinkingProcess}`;
        const panelTitle = `${baseTitle}${duration}`;
        
        addElement({
          tag: 'collapsible_panel',
          expanded: false,
          header: {
            title: { tag: 'plain_text', content: panelTitle },
          },
          elements: [{
            tag: 'markdown',
            content: '```\n' + escapeCodeBlockContent(combinedText) + '\n```',
          }],
        });
        break;
      }
      
      case 'tool-call': {
        for (const tool of group.parts) {
          if (!tool.name) continue;
          
          let statusEmoji = getEmojiForStatus(tool.state ?? 'pending');
          let isBackgroundAndJustLaunched = false;
          
          const isSubAgentTool = tool.name.toLowerCase() === 'delegate_task' || tool.name.toLowerCase() === 'task';
          if (isSubAgentTool && tool.input) {
            const runInBackground = tool.input.run_in_background as boolean | undefined;
            const rawCompleted = tool.state === 'completed' || tool.state === 'complete' || tool.state === 'success';
            isBackgroundAndJustLaunched = !!(runInBackground && rawCompleted && !tool.subtask?.summary && !tool.subtask?.conclusion);
            if (isBackgroundAndJustLaunched) {
              statusEmoji = emoji.pending;
            }
          }
          
          const toolTime = isBackgroundAndJustLaunched && tool.time
            ? { start: tool.time.start }
            : tool.time;
          const toolDuration = formatDuration(toolTime);
          let toolElements: object[] = [];
          
          const specialElements = getSpecialToolElements(
            tool.name, 
            tool.input, 
            tool.output, 
            tool.error,
            tool.state,
            tool.subtask
          );
          
          if (specialElements) {
            toolElements = specialElements;
          } else {
            if (tool.input && Object.keys(tool.input).length > 0) {
              const inputLines = formatToolInput(tool.input);
              if (inputLines) {
                toolElements.push({
                  tag: 'markdown',
                  content: inputLines,
                });
              }
            }
            
            if (tool.error) {
              toolElements.push({
                tag: 'markdown',
                content: `**${labels.errorPrefix}**\n\`\`\`\n${escapeCodeBlockContent(tool.error)}\n\`\`\``,
              });
            } else if (tool.output) {
              let outputText = tool.output;
              if (outputText.length > MAX_TOOL_OUTPUT_LENGTH) {
                outputText = outputText.slice(0, MAX_TOOL_OUTPUT_LENGTH) + `\n... ${labels.outputTruncated}`;
              }
              toolElements.push({
                tag: 'markdown',
                content: '```\n' + escapeCodeBlockContent(outputText) + '\n```',
              });
            }
          }
          
          const panelTitle = `${statusEmoji} ${getToolPanelTitle(tool.name, tool.input, tool.title)}${toolDuration}`;
          const shouldExpand = tool.name.toLowerCase() === 'todowrite';
          
          addElement({
            tag: 'collapsible_panel',
            expanded: shouldExpand,
            header: {
              title: { tag: 'plain_text', content: panelTitle },
            },
            elements: toolElements.length > 0 ? toolElements : [{
              tag: 'markdown',
              content: `*${labels.executing}*`,
            }],
          });
        }
        break;
      }
      
      case 'text': {
        const textContents = group.parts
          .map(p => p.text)
          .filter((t): t is string => !!t);
        
        if (textContents.length === 0) break;
        
        if (currentElements.length > 0) {
          addElement({ tag: 'hr' });
        }
        
        const combinedText = textContents.join('\n\n');
        addElement({
          tag: 'markdown',
          content: truncateContent(combinedText),
        });
        break;
      }
    }
  }
  
  if (currentElements.length === 0) {
    currentElements.push({
      tag: 'markdown',
      content: isComplete ? labels.noContent : '...',
    });
  }
  
  cards.push(createCard(currentElements, true));
  
  return { cards, hasMore: false };
}

export function buildStreamingCardV2(
  parts: StreamingCardParts,
  isComplete: boolean,
  title?: string
): object {
  const orderedParts: OrderedPart[] = [];
  
  if (parts.reasoningContent) {
    orderedParts.push({ type: 'reasoning', text: parts.reasoningContent });
  }
  
  for (const tool of parts.toolCalls) {
    orderedParts.push({
      type: 'tool-call',
      name: tool.name,
      state: tool.state,
      title: tool.title,
      input: tool.input,
      output: tool.output,
      error: tool.error,
    });
  }
  
  if (parts.textContent) {
    orderedParts.push({ type: 'text', text: parts.textContent });
  }
  
  const result = buildStreamingCardsV2(orderedParts, isComplete, title);
  return result.cards[0] ?? {
    schema: '2.0',
    header: {
      title: { tag: 'plain_text', content: title ?? labels.processing },
      template: colors.processing,
    },
    body: {
      elements: [{ tag: 'markdown', content: '...' }],
    },
  };
}

export function buildStreamingCard(
  content: string,
  isComplete: boolean,
  title?: string
): FeishuCard {
  const template: CardTemplate = isComplete ? colors.complete : colors.processing;
  const headerTitle = title ?? (isComplete ? labels.complete : labels.processing);
  
  return createCard(content, headerTitle, template);
}
