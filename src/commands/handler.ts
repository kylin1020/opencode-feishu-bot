/**
 * 命令处理模块
 * 处理用户命令并执行相应操作
 */
import type { BotDatabase } from '../database';
import type { FeishuClient } from '../feishu/client';
import type { SessionManager } from '../session/manager';
import type { OpencodeWrapper } from '../opencode/client';
import type { ProjectConfig } from '../config';
import type { ModelConfig } from '../config';
import { filterModels } from '../config';
import { createSessionChatCreatedCard, createSessionChatWelcomeCard } from '../feishu/menu';
import {
  isCommand,
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
  success: boolean;
  message: string;
  handled: boolean;
}

export interface CommandHandlerConfig {
  projects: ProjectConfig[];
  availableModels: ModelConfig[];
}

export class CommandHandler {
  private db: BotDatabase;
  private feishuClient: FeishuClient;
  private sessionManager: SessionManager;
  private opencodeClient: OpencodeWrapper;
  private projects: ProjectConfig[];
  private availableModels: ModelConfig[];
  private cachedModels: Array<{ id: string; name: string; providerId: string }> | null = null;

  constructor(
    db: BotDatabase,
    feishuClient: FeishuClient,
    sessionManager: SessionManager,
    opencodeClient: OpencodeWrapper,
    config: CommandHandlerConfig
  ) {
    this.db = db;
    this.feishuClient = feishuClient;
    this.sessionManager = sessionManager;
    this.opencodeClient = opencodeClient;
    this.projects = config.projects;
    this.availableModels = config.availableModels;
  }

  private async getModels(): Promise<Array<{ id: string; name: string }>> {
    if (!this.cachedModels) {
      this.cachedModels = await this.opencodeClient.listModels();
    }
    const allModels = this.cachedModels.map(m => ({ id: m.id, name: m.name }));
    return filterModels(allModels, this.availableModels);
  }

  async handleIfCommand(text: string, context: CommandContext): Promise<CommandResult> {
    if (!isCommand(text)) {
      return { success: true, message: '', handled: false };
    }

    const parsed = parseCommand(text);
    if (!parsed) {
      return {
        success: false,
        message: formatCommandError('无效的命令格式'),
        handled: true,
      };
    }

    const command = getCommand(parsed.command);
    if (!command) {
      return {
        success: false,
        message: formatCommandError(`未知命令：${parsed.command}`),
        handled: true,
      };
    }

    if (command.adminOnly && !context.isAdmin) {
      return {
        success: false,
        message: formatCommandError('此命令需要管理员权限'),
        handled: true,
      };
    }

    const result = await this.executeCommand(parsed.command, parsed.args, parsed.rawArgs, context);
    
    if (result.message) {
      await this.feishuClient.sendTextMessage(context.chatId, result.message);
    }
    
    return result;
  }

  private async executeCommand(
    command: string,
    args: string[],
    rawArgs: string,
    context: CommandContext
  ): Promise<CommandResult> {
    try {
      switch (command) {
        case 'help':
          return this.handleHelp(context);
        
        case 'switch_project':
          return await this.handleSwitchProject(rawArgs, context);
        
        case 'new_session':
          return await this.handleNewSession(context);
        
        case 'abort':
          return await this.handleAbort(context);
        
        case 'status':
          return await this.handleStatus(context);
        
        case 'new':
          return await this.handleNew(args, context);
        
        case 'model':
          return await this.handleModel(args, rawArgs, context);
        
        case 'compact':
          return await this.handleCompact(context);
        
        case 'clear':
          return await this.handleClear(context);
        
        case 'exit':
          return await this.handleExit(context);
        
        case 'whitelist_add':
          return await this.handleWhitelistAdd(args, context);
        
        case 'whitelist_remove':
          return await this.handleWhitelistRemove(args, context);
        
        case 'whitelist_list':
          return await this.handleWhitelistList(context);
        
        case 'doc_read':
          return await this.handleDocRead(rawArgs, context);
        
        case 'doc_create':
          return await this.handleDocCreate(rawArgs, context);
        
        default:
          return {
            success: false,
            message: formatCommandError(`命令未实现：${command}`),
            handled: true,
          };
      }
    } catch (error) {
      logger.error('命令执行错误', { command, error });
      return {
        success: false,
        message: formatCommandError(error instanceof Error ? error.message : '未知错误'),
        handled: true,
      };
    }
  }

  private handleHelp(context: CommandContext): CommandResult {
    const message = formatHelpMessage(context.isAdmin);
    return { success: true, message, handled: true };
  }

  private async handleSwitchProject(path: string, context: CommandContext): Promise<CommandResult> {
    if (!path.trim()) {
      return {
        success: false,
        message: formatCommandError('请提供项目路径。用法：/switch_project <路径>'),
        handled: true,
      };
    }

    await this.sessionManager.switchProject(context.chatId, path.trim());
    
    return {
      success: true,
      message: formatCommandSuccess(`已切换到项目：${path.trim()}\n下次发消息时将创建新会话。`),
      handled: true,
    };
  }

  private async handleNewSession(context: CommandContext): Promise<CommandResult> {
    const sessionId = await this.sessionManager.createNewSession(context.chatId);
    
    return {
      success: true,
      message: formatCommandSuccess(`新会话已创建：${sessionId.slice(0, 8)}...`),
      handled: true,
    };
  }

  private async handleAbort(context: CommandContext): Promise<CommandResult> {
    const aborted = await this.sessionManager.abortCurrentSession(context.chatId);
    
    if (aborted) {
      return {
        success: true,
        message: formatCommandSuccess('当前任务已中止'),
        handled: true,
      };
    } else {
      return {
        success: false,
        message: formatCommandError('没有正在运行的任务'),
        handled: true,
      };
    }
  }

  private async handleStatus(context: CommandContext): Promise<CommandResult> {
    const session = this.db.getSession(context.chatId);
    const projectPath = this.db.getProjectPath(context.chatId);
    const activeCount = this.sessionManager.getActiveSessionCount();
    
    let message = '**会话状态：**\n\n';
    
    if (session) {
      message += `会话 ID：\`${session.session_id.slice(0, 8)}...\`\n`;
      message += `项目：\`${session.project_path}\`\n`;
      message += `创建时间：${session.created_at}\n`;
    } else {
      message += '无活动会话\n';
    }
    
    if (projectPath) {
      message += `\n配置的项目：\`${projectPath}\`\n`;
    }
    
    message += `\n活动会话数（所有用户）：${activeCount}`;
    
    return { success: true, message, handled: true };
  }

  private async handleWhitelistAdd(args: string[], context: CommandContext): Promise<CommandResult> {
    const userId = args[0];
    
    if (!userId) {
      return {
        success: false,
        message: formatCommandError('请提供用户 ID。用法：/whitelist_add <用户ID>'),
        handled: true,
      };
    }

    const added = this.db.addToWhitelist(userId, context.userId);
    
    if (added) {
      return {
        success: true,
        message: formatCommandSuccess(`用户 ${userId} 已添加到白名单`),
        handled: true,
      };
    } else {
      return {
        success: false,
        message: formatCommandError('用户已在白名单中'),
        handled: true,
      };
    }
  }

  private async handleWhitelistRemove(args: string[], context: CommandContext): Promise<CommandResult> {
    const userId = args[0];
    
    if (!userId) {
      return {
        success: false,
        message: formatCommandError('请提供用户 ID。用法：/whitelist_remove <用户ID>'),
        handled: true,
      };
    }

    const removed = this.db.removeFromWhitelist(userId);
    
    if (removed) {
      return {
        success: true,
        message: formatCommandSuccess(`用户 ${userId} 已从白名单移除`),
        handled: true,
      };
    } else {
      return {
        success: false,
        message: formatCommandError('用户不在白名单中'),
        handled: true,
      };
    }
  }

  private async handleWhitelistList(context: CommandContext): Promise<CommandResult> {
    const users = this.db.getWhitelistedUsers();
    
    if (users.length === 0) {
      return {
        success: true,
        message: '**白名单：** 无用户',
        handled: true,
      };
    }

    let message = '**白名单用户：**\n\n';
    for (const user of users) {
      message += `- \`${user.user_id}\`（由 ${user.added_by} 于 ${user.added_at} 添加）\n`;
    }
    
    return { success: true, message, handled: true };
  }

  private async handleNew(args: string[], context: CommandContext): Promise<CommandResult> {
    if (this.projects.length === 0) {
      const sessionChat = this.sessionManager.getSessionChat(context.chatId);
      if (sessionChat) {
        const sessionId = await this.sessionManager.createNewSession(context.chatId);
        return {
          success: true,
          message: formatCommandSuccess(`已创建新会话\n会话 ID：${sessionId.slice(0, 8)}...`),
          handled: true,
        };
      }
      
      const loadingMsgId = await this.feishuClient.sendTextMessage(context.chatId, '正在创建会话群，请稍候...');
      const defaultPath = this.sessionManager.getDefaultProjectPath();
      const result = await this.sessionManager.createSessionChat(context.userId, defaultPath);
      
      if (loadingMsgId) {
        await this.feishuClient.deleteMessage(loadingMsgId);
      }
      
      if (!result) {
        return {
          success: false,
          message: formatCommandError('创建会话群失败，请检查机器人权限'),
          handled: true,
        };
      }
      
      const welcomeCard = createSessionChatWelcomeCard({
        sessionId: result.sessionId,
        projectPath: defaultPath,
        projects: this.projects,
        chatId: result.chatId,
        models: await this.getModels(),
        currentModel: this.sessionManager.getDefaultModel(),
      });
      await this.feishuClient.sendCard(result.chatId, welcomeCard);
      
      const card = createSessionChatCreatedCard(result.chatId, result.sessionId, defaultPath);
      await this.feishuClient.sendCard(context.chatId, card);
      
      return {
        success: true,
        message: '',
        handled: true,
      };
    }

    const indexStr = args[0];
    if (!indexStr) {
      const projectList = this.projects.map((p, i) => `${i + 1}. ${p.name} - ${p.path}`).join('\n');
      return {
        success: false,
        message: formatCommandError(`请提供项目编号。\n\n可用项目：\n${projectList}\n\n用法：/new <编号>`),
        handled: true,
      };
    }

    const index = parseInt(indexStr, 10);
    if (isNaN(index) || index < 1 || index > this.projects.length) {
      return {
        success: false,
        message: formatCommandError(`无效的项目编号。请输入 1-${this.projects.length} 之间的数字`),
        handled: true,
      };
    }

    const project = this.projects[index - 1];
    if (!project) {
      return {
        success: false,
        message: formatCommandError(`项目不存在`),
        handled: true,
      };
    }
    
    const sessionChat = this.sessionManager.getSessionChat(context.chatId);
    
    if (sessionChat) {
      await this.sessionManager.switchProject(context.chatId, project.path);
      const sessionId = await this.sessionManager.createNewSession(context.chatId);
      return {
        success: true,
        message: formatCommandSuccess(`已切换到项目 "${project.name}"\n会话 ID：${sessionId.slice(0, 8)}...`),
        handled: true,
      };
    }

    const loadingMsgId = await this.feishuClient.sendTextMessage(context.chatId, '正在创建会话群，请稍候...');
    
    const result = await this.sessionManager.createSessionChat(context.userId, project.path);
    
    if (loadingMsgId) {
      await this.feishuClient.deleteMessage(loadingMsgId);
    }
    
    if (!result) {
      return {
        success: false,
        message: formatCommandError('创建会话群失败，请检查机器人权限'),
        handled: true,
      };
    }

    const welcomeCard = createSessionChatWelcomeCard({
      sessionId: result.sessionId,
      projectPath: project.path,
      projects: this.projects,
      chatId: result.chatId,
      models: await this.getModels(),
      currentModel: this.sessionManager.getDefaultModel(),
    });
    await this.feishuClient.sendCard(result.chatId, welcomeCard);

    const card = createSessionChatCreatedCard(result.chatId, result.sessionId, project.path);
    await this.feishuClient.sendCard(context.chatId, card);

    return {
      success: true,
      message: '',
      handled: true,
    };
  }

  private async handleModel(args: string[], rawArgs: string, context: CommandContext): Promise<CommandResult> {
    const models = await this.getModels();
    if (models.length === 0) {
      return {
        success: false,
        message: formatCommandError('没有可用的模型'),
        handled: true,
      };
    }

    const arg = rawArgs.trim();
    if (!arg) {
      const modelList = models.map((m, i) => `${i + 1}. ${m.name} - ${m.id}`).join('\n');
      return {
        success: false,
        message: formatCommandError(`请提供模型编号或 ID。\n\n可用模型：\n${modelList}\n\n用法：/model <编号或ID>`),
        handled: true,
      };
    }

    let selectedModel: typeof models[0] | undefined;
    
    const index = parseInt(arg, 10);
    if (!isNaN(index) && index >= 1 && index <= models.length) {
      selectedModel = models[index - 1];
    } else {
      selectedModel = models.find(m => m.id === arg || m.id.endsWith(`/${arg}`));
    }

    if (!selectedModel) {
      return {
        success: false,
        message: formatCommandError(`未找到模型：${arg}`),
        handled: true,
      };
    }

    const sessionChat = this.sessionManager.getSessionChat(context.chatId);
    if (sessionChat) {
      logger.info('切换模型', { chatId: context.chatId, oldModel: sessionChat.model, newModel: selectedModel.id });
      this.sessionManager.updateSessionChatModel(context.chatId, selectedModel.id);
      return {
        success: true,
        message: formatCommandSuccess(`已切换到模型：${selectedModel.name}`),
        handled: true,
      };
    }

    return {
      success: false,
      message: formatCommandError('仅支持在会话群中切换模型'),
      handled: true,
    };
  }

  private async handleCompact(context: CommandContext): Promise<CommandResult> {
    const session = this.db.getSession(context.chatId);
    if (!session) {
      return {
        success: false,
        message: formatCommandError('没有活动会话'),
        handled: true,
      };
    }

    const success = await this.opencodeClient.executeCommand(session.session_id, 'compact');
    if (success) {
      return {
        success: true,
        message: formatCommandSuccess('上下文已压缩'),
        handled: true,
      };
    } else {
      return {
        success: false,
        message: formatCommandError('压缩上下文失败'),
        handled: true,
      };
    }
  }

  private async handleClear(context: CommandContext): Promise<CommandResult> {
    const sessionId = await this.sessionManager.createNewSession(context.chatId);
    return {
      success: true,
      message: formatCommandSuccess(`历史已清除，新会话：${sessionId.slice(0, 8)}...`),
      handled: true,
    };
  }

  private async handleExit(context: CommandContext): Promise<CommandResult> {
    const sessionChat = this.sessionManager.getSessionChat(context.chatId);
    if (!sessionChat) {
      return {
        success: false,
        message: formatCommandError('此命令仅在会话群中可用'),
        handled: true,
      };
    }

    this.sessionManager.cleanupSessionChat(context.chatId);
    await this.feishuClient.deleteChat(context.chatId);
    
    return {
      success: true,
      message: '',
      handled: true,
    };
  }

  private async handleDocRead(urlOrToken: string, context: CommandContext): Promise<CommandResult> {
    if (!urlOrToken.trim()) {
      return {
        success: false,
        message: formatCommandError('请提供文档URL或token。用法：/doc_read <文档URL或token>'),
        handled: true,
      };
    }

    const result = await this.feishuClient.readDocument(urlOrToken.trim());
    
    if (!result.success || !result.data) {
      return {
        success: false,
        message: formatCommandError(result.error || '读取文档失败'),
        handled: true,
      };
    }

    const title = result.data.title ? `**${result.data.title}**\n\n` : '';
    const content = result.data.content.length > 2000 
      ? result.data.content.slice(0, 2000) + '\n\n... (内容过长，已截断)'
      : result.data.content;
    
    return {
      success: true,
      message: `${title}${content}`,
      handled: true,
    };
  }

  private async handleDocCreate(title: string, context: CommandContext): Promise<CommandResult> {
    if (!title.trim()) {
      return {
        success: false,
        message: formatCommandError('请提供文档标题。用法：/doc_create <标题>'),
        handled: true,
      };
    }

    const result = await this.feishuClient.createDocument({ title: title.trim() });
    
    if (!result.success || !result.data) {
      return {
        success: false,
        message: formatCommandError(result.error || '创建文档失败'),
        handled: true,
      };
    }

    return {
      success: true,
      message: formatCommandSuccess(`文档创建成功\n标题：${result.data.title}\n链接：${result.data.url}`),
      handled: true,
    };
  }
}

export function createCommandHandler(
  db: BotDatabase,
  feishuClient: FeishuClient,
  sessionManager: SessionManager,
  opencodeClient: OpencodeWrapper,
  config: CommandHandlerConfig
): CommandHandler {
  return new CommandHandler(db, feishuClient, sessionManager, opencodeClient, config);
}
