/**
 * 命令解析模块
 * 定义和解析机器人命令
 */

export interface Command {
  name: string;
  description: string;
  usage: string;
  adminOnly: boolean;
}

export interface ParsedCommand {
  command: string;
  args: string[];
  rawArgs: string;
}

const COMMAND_PREFIX = '/';

export const COMMANDS: Record<string, Command> = {
  new: {
    name: 'new',
    description: '创建新会话（从预配置项目中选择）',
    usage: '/new <项目编号>',
    adminOnly: false,
  },
  model: {
    name: 'model',
    description: '切换 AI 模型',
    usage: '/model <编号或模型ID>',
    adminOnly: false,
  },
  compact: {
    name: 'compact',
    description: '压缩当前会话上下文',
    usage: '/compact',
    adminOnly: false,
  },
  clear: {
    name: 'clear',
    description: '清除历史，创建新会话',
    usage: '/clear',
    adminOnly: false,
  },
  exit: {
    name: 'exit',
    description: '退出并删除当前会话群',
    usage: '/exit',
    adminOnly: false,
  },
  switch_project: {
    name: 'switch_project',
    description: '切换到不同的项目目录',
    usage: '/switch_project <路径>',
    adminOnly: false,
  },
  new_session: {
    name: 'new_session',
    description: '创建新的 OpenCode 会话',
    usage: '/new_session',
    adminOnly: false,
  },
  help: {
    name: 'help',
    description: '显示可用命令',
    usage: '/help',
    adminOnly: false,
  },
  abort: {
    name: 'abort',
    description: '中止当前运行的任务',
    usage: '/abort',
    adminOnly: false,
  },
  status: {
    name: 'status',
    description: '显示当前会话状态',
    usage: '/status',
    adminOnly: false,
  },
  whitelist_add: {
    name: 'whitelist_add',
    description: '将用户添加到白名单',
    usage: '/whitelist_add <用户ID>',
    adminOnly: true,
  },
  whitelist_remove: {
    name: 'whitelist_remove',
    description: '从白名单移除用户',
    usage: '/whitelist_remove <用户ID>',
    adminOnly: true,
  },
  whitelist_list: {
    name: 'whitelist_list',
    description: '列出所有白名单用户',
    usage: '/whitelist_list',
    adminOnly: true,
  },
  doc_read: {
    name: 'doc_read',
    description: '读取飞书文档内容',
    usage: '/doc_read <文档URL或token>',
    adminOnly: false,
  },
  doc_create: {
    name: 'doc_create',
    description: '创建新的飞书文档',
    usage: '/doc_create <标题>',
    adminOnly: false,
  },
};

export function isCommand(text: string): boolean {
  return text.trim().startsWith(COMMAND_PREFIX);
}

export function parseCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  
  if (!trimmed.startsWith(COMMAND_PREFIX)) {
    return null;
  }

  const withoutPrefix = trimmed.slice(COMMAND_PREFIX.length);
  const parts = withoutPrefix.split(/\s+/);
  const command = parts[0]?.toLowerCase() ?? '';
  const args = parts.slice(1);
  const rawArgs = withoutPrefix.slice(command.length).trim();

  if (!command) {
    return null;
  }

  return {
    command,
    args,
    rawArgs,
  };
}

export function getCommand(name: string): Command | null {
  return COMMANDS[name] ?? null;
}

export function getAvailableCommands(isAdmin: boolean): Command[] {
  return Object.values(COMMANDS).filter(cmd => !cmd.adminOnly || isAdmin);
}

export function formatHelpMessage(isAdmin: boolean): string {
  const commands = getAvailableCommands(isAdmin);
  
  let message = '**可用命令：**\n\n';
  
  for (const cmd of commands) {
    message += `\`${cmd.usage}\`\n${cmd.description}\n\n`;
  }

  return message;
}

export function formatCommandError(message: string): string {
  return `**命令错误：** ${message}`;
}

export function formatCommandSuccess(message: string): string {
  return `**成功：** ${message}`;
}
