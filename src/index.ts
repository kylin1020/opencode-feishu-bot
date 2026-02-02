import { loadConfig, getAdminUserIds, getDefaultProjectPath, getProjects, getAvailableModels, getDefaultModel, getMcpConfig } from './config';
import { parseArgs, formatHelp, getVersion, isValidLogLevel } from './cli';
import { logger, setLogLevel } from './utils/logger';
import { setupGlobalErrorHandling } from './utils/reconnect';
import { Gateway } from './gateway';
import { FeishuChannel } from './channels/feishu';
import { OpencodeAgent } from './agent/opencode';
import { createHookManager } from './hooks';
import { createPluginManager, type PluginManagerDependencies } from './plugins';
import { McpHub } from './mcp';
import { createFeishuMcpServer } from './mcp/servers/feishu';
import { createSessionManager } from './session';
import { createCommandHandler } from './commands/handler';
import { isCommand } from './commands/parser';
import { createFeishuApiClient } from './feishu/api';
import type { MessageEvent } from './types/channel';
import type { ContentBlock, ReplyStatus } from './types/message';

async function listAvailableModels(): Promise<void> {
  const agent = new OpencodeAgent({});
  try {
    await agent.initialize();
    const models = await agent.listModels();
    
    console.log('\n可用模型列表：\n');
    models.forEach((model, index) => {
      console.log(`  ${index + 1}. ${model.name}`);
      console.log(`     ID: ${model.id}`);
      console.log('');
    });
    console.log(`共 ${models.length} 个模型\n`);
  } finally {
    await agent.shutdown();
  }
}

async function main(): Promise<void> {
  const cliOptions = parseArgs();
  
  if (cliOptions.help) {
    console.log(formatHelp());
    process.exit(0);
  }
  
  if (cliOptions.version) {
    console.log(`v${getVersion()}`);
    process.exit(0);
  }
  
  if (cliOptions.listModels) {
    await listAvailableModels();
    process.exit(0);
  }
  
  setupGlobalErrorHandling();
  
  const logLevel = cliOptions.logLevel && isValidLogLevel(cliOptions.logLevel) 
    ? cliOptions.logLevel 
    : undefined;
  
  const config = loadConfig({
    model: cliOptions.model,
    logLevel,
  });
  setLogLevel(config.logLevel);
  
  logger.info('正在启动飞书 OpenCode 机器人...');
  
  const defaultProjectPath = getDefaultProjectPath(cliOptions.project);
  const defaultModel = getDefaultModel(config);
  const adminUserIds = getAdminUserIds(config);
  const projects = getProjects(config);
  const availableModels = getAvailableModels(config);
  
  const mcpHub = new McpHub();
  const hookManager = createHookManager();
  
  const channel = new FeishuChannel({
    appId: config.feishuAppId,
    appSecret: config.feishuAppSecret,
  });
  
  const agent = new OpencodeAgent({
    directory: defaultProjectPath,
  });
  
  const gateway = new Gateway({
    defaultAgent: 'opencode',
    maxConcurrency: 10,
  });
  
  const sessionManager = createSessionManager(
    {
      keyType: 'chat',
      idleTimeoutMs: 30 * 60 * 1000,
      autoCompact: true,
      compactThreshold: 50,
    },
    {
      getAgent: (id) => gateway.getAgent(id),
      getChannel: (id) => gateway.getChannel(id),
      createChat: async (name, userIds) => {
        const result = await channel.createChat(name, userIds);
        return result ? { chatId: result } : null;
      },
      updateChatName: (chatId, name) => channel.updateChatName(chatId, name),
      deleteChat: (chatId) => channel.deleteChat(chatId),
    }
  );
  
  const mcpConfig = getMcpConfig(config);
  const apiClient = createFeishuApiClient(config.feishuAppId, config.feishuAppSecret);
  const feishuMcpServer = createFeishuMcpServer({
    larkClient: channel.getFeishuClient().getLarkClient(),
    apiClient,
    defaultFolderToken: config.docs?.defaultFolderToken,
    sendMessage: (chatId, text) => channel.sendTextMessage(chatId, text),
    createChat: (name, userIds) => channel.createChat(name, userIds),
  });
  
  if (mcpConfig.servers['feishu']?.enabled !== false) {
    mcpHub.registerServer(feishuMcpServer);
  }
  
  const pluginDeps: PluginManagerDependencies = {
    hookManager,
    mcpHub,
    getChannel: (id) => gateway.getChannel(id),
    getAgent: (id) => gateway.getAgent(id),
    registerChannel: (ch) => gateway.registerChannel(ch),
    registerAgent: (ag) => gateway.registerAgent(ag),
    registerMcpServer: (server) => mcpHub.registerServer(server),
  };
  
  createPluginManager({}, pluginDeps);
  
  gateway.registerChannel(channel);
  gateway.registerAgent(agent);
  
  const commandHandler = createCommandHandler(channel, agent, {
    projects,
    availableModels,
    defaultProjectPath,
    defaultModel,
    adminUserIds,
  });
  
  channel.on('message', async (event) => {
    const msgEvent = event as MessageEvent;
    const { chatId, senderId, content } = msgEvent;
    
    logger.debug('收到消息', { chatId, senderId, type: msgEvent.messageType });
    
    const text = content || '';
    
    if (isCommand(text)) {
      const result = await commandHandler.handle(text, {
        chatId,
        userId: senderId,
        isAdmin: commandHandler.isAdmin(senderId),
      });
      
      if (result.handled) {
        return;
      }
    }
    
    if (!text.trim()) {
      return;
    }
    
    try {
      const session = commandHandler.getSession(chatId);
      
      let sessionId = session.sessionId;
      if (!sessionId) {
        sessionId = await agent.createSession(session.projectPath, session.model);
        commandHandler.setSessionId(chatId, sessionId);
      }
      
      const initialReply = createReply('pending', [{ type: 'text', content: '正在思考...' }]);
      const messageId = await channel.sendMessage(chatId, initialReply);
      
      let fullContent = '';
      let thinkingContent = '';
      
      const unsubscribe = agent.subscribe(sessionId, async (agentEvent) => {
        try {
          switch (agentEvent.type) {
            case 'thinking.delta':
              thinkingContent += agentEvent.delta;
              break;
              
            case 'message.delta':
              fullContent += agentEvent.delta;
              const streamingReply = createReply('streaming', [{ type: 'text', content: fullContent }], thinkingContent);
              await channel.updateMessage(messageId, streamingReply);
              break;
              
            case 'message.complete':
              const completeReply = createReply('completed', [{ type: 'text', content: fullContent }], thinkingContent);
              await channel.updateMessage(messageId, completeReply);
              unsubscribe();
              break;
              
            case 'error':
              const errorReply = createReply('error', [{ type: 'error', message: agentEvent.message }]);
              await channel.updateMessage(messageId, errorReply);
              unsubscribe();
              break;
          }
        } catch (updateError) {
          logger.error('更新消息失败', { error: updateError });
        }
      });
      
      await agent.send(sessionId, text);
      
    } catch (error) {
      logger.error('处理消息失败', { chatId, error });
      await channel.sendTextMessage(chatId, `处理消息时出错: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  });
  
  await gateway.start();
  
  const opencodeUrl = agent.getWrapper().getServerUrl();
  
  logger.info('飞书 OpenCode 机器人启动成功');
  logger.info('配置信息', {
    appId: config.feishuAppId.substring(0, 8) + '...',
    opencodeUrl,
    defaultProject: defaultProjectPath,
    defaultModel: defaultModel || '(未设置)',
    adminCount: adminUserIds.length,
  });
  
  const shutdown = async (signal: string) => {
    logger.info(`收到 ${signal} 信号，正在关闭...`);
    
    sessionManager.shutdown();
    await gateway.stop();
    hookManager.clear();
    
    logger.info('关闭完成');
    process.exit(0);
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

function createReply(status: ReplyStatus, blocks: ContentBlock[], thinking?: string): {
  status: ReplyStatus;
  blocks: ContentBlock[];
  showThinking?: boolean;
} {
  const result: { status: ReplyStatus; blocks: ContentBlock[]; showThinking?: boolean } = {
    status,
    blocks,
  };
  
  if (thinking) {
    result.blocks = [{ type: 'thinking', content: thinking }, ...blocks];
    result.showThinking = true;
  }
  
  return result;
}

main().catch((error) => {
  logger.error('致命错误', error);
  process.exit(1);
});
