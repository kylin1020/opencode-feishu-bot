/**
 * OpenCode 飞书机器人入口文件
 */
import { loadConfig, getAdminUserIds, getDefaultProjectPath, getProjects, getAvailableModels, getDefaultModel } from './config';
import { parseArgs, formatHelp, getVersion, isValidLogLevel } from './cli';
import { logger, setLogLevel } from './utils/logger';
import { initializeDatabase } from './database';
import { createFeishuClient, parseTextContent } from './feishu/client';
import { createOpencodeWrapper } from './opencode/client';
import { createSessionManager } from './session/manager';
import { createCommandHandler } from './commands/handler';
import { isCommand } from './commands/parser';
import { createReconnectionManager, setupGlobalErrorHandling } from './utils/reconnect';
import { setupEventHandlers } from './events/handler';

async function listAvailableModels(): Promise<void> {
  const tempClient = createOpencodeWrapper({});
  try {
    await tempClient.start();
    const models = await tempClient.listModels();
    
    console.log('\n可用模型列表：\n');
    models.forEach((model, index) => {
      console.log(`  ${index + 1}. ${model.name}`);
      console.log(`     ID: ${model.id}`);
      console.log('');
    });
    console.log(`共 ${models.length} 个模型\n`);
  } finally {
    tempClient.stop();
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
  
  const db = initializeDatabase(config.databasePath);
  logger.info('数据库已初始化', { path: config.databasePath });
  
  const feishuClient = createFeishuClient({
    appId: config.feishuAppId,
    appSecret: config.feishuAppSecret,
  });
  
  const defaultProjectPath = getDefaultProjectPath(cliOptions.project);
  const defaultModel = getDefaultModel(config);
  
  const opencodeClient = createOpencodeWrapper({
    directory: defaultProjectPath,
  });
  
  const opencodeUrl = await opencodeClient.start();
  
  const adminUserIds = getAdminUserIds(config);
  
  const sessionManager = createSessionManager(
    db,
    feishuClient,
    opencodeClient,
    {
      defaultProjectPath,
      defaultModel,
      adminUserIds,
      allowAllUsers: config.allowAllUsers,
    }
  );
  
  const projects = getProjects(config);
  const availableModels = getAvailableModels(config);
  
  const commandHandler = createCommandHandler(db, feishuClient, sessionManager, opencodeClient, { projects, availableModels });
  
  setupEventHandlers({
    feishuClient,
    sessionManager,
    opencodeClient,
    projects,
    availableModels,
  });
  
  feishuClient.onMessage(async (event) => {
    logger.debug('收到消息', { 
      chatId: event.chatId, 
      senderId: event.senderId,
      messageType: event.messageType,
    });
    
    const text = parseTextContent(event.content);
    
    if (isCommand(text)) {
      const result = await commandHandler.handleIfCommand(text, {
        chatId: event.chatId,
        userId: event.senderId,
        isAdmin: sessionManager.isAdmin(event.senderId),
      });
      
      if (result.handled) {
        return;
      }
    }
    
    await sessionManager.handleMessage(event);
  });
  
  const reconnectionManager = createReconnectionManager(
    async () => {
      await feishuClient.start();
    },
    async () => {
      await feishuClient.stop();
    },
    {
      maxRetries: 10,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
    }
  );
  
  await reconnectionManager.connect();
  
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
    
    sessionManager.cleanup();
    await reconnectionManager.disconnect();
    opencodeClient.stop();
    db.close();
    
    logger.info('关闭完成');
    process.exit(0);
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error('致命错误', error);
  process.exit(1);
});
