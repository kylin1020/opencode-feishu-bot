import type { FeishuChannel } from '../channels/feishu';
import type { OpencodeAgent } from '../agent/opencode';
import type { ProjectConfig, ModelConfig } from '../config';
import {
  parseCommand,
  getCommand,
  formatHelpMessage,
  formatCommandError,
  formatCommandSuccess,
} from './parser';
import { logger } from '../utils/logger';

export interface CommandContext {
  chatId: string;
  userId: string;
  isAdmin: boolean;
}

export interface CommandResult {
  handled: boolean;
  message?: string;
}

export interface SessionState {
  projectPath: string;
  model?: string;
  sessionId?: string;
}

export interface CommandHandlerConfig {
  projects: ProjectConfig[];
  availableModels: ModelConfig[];
  defaultProjectPath: string;
  defaultModel?: string;
  adminUserIds: string[];
  whitelist?: Set<string>;
  onWhitelistChange?: (whitelist: Set<string>) => void;
}

export class CommandHandler {
  private channel: FeishuChannel;
  private agent: OpencodeAgent;
  private config: CommandHandlerConfig;
  private sessions = new Map<string, SessionState>();
  private whitelist: Set<string>;

  constructor(
    channel: FeishuChannel,
    agent: OpencodeAgent,
    config: CommandHandlerConfig
  ) {
    this.channel = channel;
    this.agent = agent;
    this.config = config;
    this.whitelist = config.whitelist ?? new Set();
  }

  async handle(text: string, context: CommandContext): Promise<CommandResult> {
    const parsed = parseCommand(text);
    if (!parsed) {
      return { handled: false };
    }

    const command = getCommand(parsed.command);
    if (!command) {
      await this.sendMessage(context.chatId, formatCommandError(`未知命令: ${parsed.command}`));
      return { handled: true };
    }

    if (command.adminOnly && !context.isAdmin) {
      await this.sendMessage(context.chatId, formatCommandError('此命令需要管理员权限'));
      return { handled: true };
    }

    try {
      switch (parsed.command) {
        case 'help':
          return this.handleHelp(context);
        case 'new':
          return this.handleNew(parsed.args, context);
        case 'model':
          return this.handleModel(parsed.args, context);
        case 'clear':
          return this.handleClear(context);
        case 'status':
          return this.handleStatus(context);
        case 'abort':
          return this.handleAbort(context);
        case 'compact':
          return this.handleCompact(context);
        case 'whitelist_add':
          return this.handleWhitelistAdd(parsed.args, context);
        case 'whitelist_remove':
          return this.handleWhitelistRemove(parsed.args, context);
        case 'whitelist_list':
          return this.handleWhitelistList(context);
        default:
          await this.sendMessage(context.chatId, formatCommandError(`命令 ${parsed.command} 暂未实现`));
          return { handled: true };
      }
    } catch (error) {
      logger.error('Command execution failed', { command: parsed.command, error });
      await this.sendMessage(context.chatId, formatCommandError(`执行失败: ${error instanceof Error ? error.message : '未知错误'}`));
      return { handled: true };
    }
  }

  getSession(chatId: string): SessionState {
    let session = this.sessions.get(chatId);
    if (!session) {
      session = {
        projectPath: this.config.defaultProjectPath,
        model: this.config.defaultModel,
      };
      this.sessions.set(chatId, session);
    }
    return session;
  }

  setSessionId(chatId: string, sessionId: string): void {
    const session = this.getSession(chatId);
    session.sessionId = sessionId;
  }

  isAdmin(userId: string): boolean {
    return this.config.adminUserIds.includes(userId);
  }

  private async handleHelp(context: CommandContext): Promise<CommandResult> {
    const help = formatHelpMessage(context.isAdmin);
    await this.sendMessage(context.chatId, help);
    return { handled: true };
  }

  private async handleNew(args: string[], context: CommandContext): Promise<CommandResult> {
    if (this.config.projects.length === 0) {
      await this.sendMessage(context.chatId, formatCommandError('没有配置可用项目'));
      return { handled: true };
    }

    if (args.length === 0) {
      let message = '**可用项目：**\n\n';
      this.config.projects.forEach((project, index) => {
        message += `${index + 1}. ${project.name}\n   \`${project.path}\`\n\n`;
      });
      message += '使用 `/new <编号>` 选择项目';
      await this.sendMessage(context.chatId, message);
      return { handled: true };
    }

    const index = parseInt(args[0]!, 10) - 1;
    if (isNaN(index) || index < 0 || index >= this.config.projects.length) {
      await this.sendMessage(context.chatId, formatCommandError('无效的项目编号'));
      return { handled: true };
    }

    const project = this.config.projects[index]!;
    const session = this.getSession(context.chatId);
    session.projectPath = project.path;
    session.sessionId = undefined;

    await this.sendMessage(context.chatId, formatCommandSuccess(`已切换到项目: ${project.name}`));
    return { handled: true };
  }

  private async handleModel(args: string[], context: CommandContext): Promise<CommandResult> {
    if (args.length === 0) {
      const models = await this.agent.listModels();
      let message = '**可用模型：**\n\n';
      
      const filtered = this.config.availableModels.length > 0
        ? models.filter(m => this.config.availableModels.some(am => am.id === m.id))
        : models.slice(0, 20);
      
      filtered.forEach((model, index) => {
        message += `${index + 1}. ${model.name}\n   \`${model.id}\`\n\n`;
      });
      message += '使用 `/model <编号>` 选择模型';
      await this.sendMessage(context.chatId, message);
      return { handled: true };
    }

    const models = await this.agent.listModels();
    const filtered = this.config.availableModels.length > 0
      ? models.filter(m => this.config.availableModels.some(am => am.id === m.id))
      : models;

    let selectedModel: typeof models[0] | undefined;
    
    const index = parseInt(args[0]!, 10) - 1;
    if (!isNaN(index) && index >= 0 && index < filtered.length) {
      selectedModel = filtered[index];
    } else {
      selectedModel = filtered.find(m => m.id === args[0] || m.name === args[0]);
    }

    if (!selectedModel) {
      await this.sendMessage(context.chatId, formatCommandError('无效的模型'));
      return { handled: true };
    }

    const session = this.getSession(context.chatId);
    session.model = selectedModel.id;

    if (session.sessionId) {
      await this.agent.switchModel(session.sessionId, selectedModel.id);
    }

    await this.sendMessage(context.chatId, formatCommandSuccess(`已切换到模型: ${selectedModel.name}`));
    return { handled: true };
  }

  private async handleClear(context: CommandContext): Promise<CommandResult> {
    const session = this.getSession(context.chatId);
    session.sessionId = undefined;
    await this.sendMessage(context.chatId, formatCommandSuccess('会话已清除，下次发消息将创建新会话'));
    return { handled: true };
  }

  private async handleStatus(context: CommandContext): Promise<CommandResult> {
    const session = this.getSession(context.chatId);
    let message = '**当前状态：**\n\n';
    message += `项目: \`${session.projectPath}\`\n`;
    message += `模型: \`${session.model || '默认'}\`\n`;
    message += `会话: ${session.sessionId ? `\`${session.sessionId.slice(0, 20)}...\`` : '无'}\n`;
    await this.sendMessage(context.chatId, message);
    return { handled: true };
  }

  private async handleAbort(context: CommandContext): Promise<CommandResult> {
    const session = this.getSession(context.chatId);
    if (!session.sessionId) {
      await this.sendMessage(context.chatId, formatCommandError('没有活动的会话'));
      return { handled: true };
    }

    const success = await this.agent.abort(session.sessionId);
    if (success) {
      await this.sendMessage(context.chatId, formatCommandSuccess('已中止当前任务'));
    } else {
      await this.sendMessage(context.chatId, formatCommandError('中止失败'));
    }
    return { handled: true };
  }

  private async handleCompact(context: CommandContext): Promise<CommandResult> {
    const session = this.getSession(context.chatId);
    if (!session.sessionId) {
      await this.sendMessage(context.chatId, formatCommandError('没有活动的会话'));
      return { handled: true };
    }

    const success = await this.agent.summarize(session.sessionId);
    if (success) {
      await this.sendMessage(context.chatId, formatCommandSuccess('正在压缩会话上下文...'));
    } else {
      await this.sendMessage(context.chatId, formatCommandError('压缩失败'));
    }
    return { handled: true };
  }

  private async handleWhitelistAdd(args: string[], context: CommandContext): Promise<CommandResult> {
    if (args.length === 0) {
      await this.sendMessage(context.chatId, formatCommandError('请提供用户 ID'));
      return { handled: true };
    }

    const userId = args[0]!;
    
    if (this.whitelist.has(userId)) {
      await this.sendMessage(context.chatId, formatCommandError(`用户 ${userId} 已在白名单中`));
      return { handled: true };
    }

    this.whitelist.add(userId);
    this.config.onWhitelistChange?.(this.whitelist);
    
    await this.sendMessage(context.chatId, formatCommandSuccess(`已将用户 ${userId} 添加到白名单`));
    return { handled: true };
  }

  private async handleWhitelistRemove(args: string[], context: CommandContext): Promise<CommandResult> {
    if (args.length === 0) {
      await this.sendMessage(context.chatId, formatCommandError('请提供用户 ID'));
      return { handled: true };
    }

    const userId = args[0]!;
    
    if (!this.whitelist.has(userId)) {
      await this.sendMessage(context.chatId, formatCommandError(`用户 ${userId} 不在白名单中`));
      return { handled: true };
    }

    this.whitelist.delete(userId);
    this.config.onWhitelistChange?.(this.whitelist);
    
    await this.sendMessage(context.chatId, formatCommandSuccess(`已将用户 ${userId} 从白名单移除`));
    return { handled: true };
  }

  private async handleWhitelistList(context: CommandContext): Promise<CommandResult> {
    if (this.whitelist.size === 0) {
      await this.sendMessage(context.chatId, '**白名单为空**');
      return { handled: true };
    }

    let message = '**白名单用户：**\n\n';
    let index = 1;
    for (const userId of this.whitelist) {
      message += `${index}. \`${userId}\`\n`;
      index++;
    }
    message += `\n共 ${this.whitelist.size} 个用户`;
    
    await this.sendMessage(context.chatId, message);
    return { handled: true };
  }

  isWhitelisted(userId: string): boolean {
    return this.whitelist.has(userId);
  }

  getWhitelist(): Set<string> {
    return new Set(this.whitelist);
  }

  private async sendMessage(chatId: string, text: string): Promise<void> {
    await this.channel.sendTextMessage(chatId, text);
  }
}

export function createCommandHandler(
  channel: FeishuChannel,
  agent: OpencodeAgent,
  config: CommandHandlerConfig
): CommandHandler {
  return new CommandHandler(channel, agent, config);
}
