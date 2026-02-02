import { Gateway, type GatewayConfig } from './gateway';
import { FeishuChannel, type FeishuChannelConfig } from './channels/feishu';
import { OpencodeAgent, type OpencodeAgentConfig } from './agent/opencode';
import { createHookManager, type DefaultHookManager } from './hooks';
import { createPluginManager, type PluginManager, type PluginManagerDependencies } from './plugins';
import { McpHub } from './mcp';
import { loadConfig, getDefaultProjectPath, getDefaultModel } from './config';
import { logger, setLogLevel } from './utils/logger';
import type { MessageReceivedHook, SessionCreatedHook, ErrorOccurredHook } from './types/hook';

export interface BootstrapConfig {
  feishu: FeishuChannelConfig;
  agent?: OpencodeAgentConfig;
  gateway?: Partial<GatewayConfig>;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export interface BootstrapResult {
  gateway: Gateway;
  channel: FeishuChannel;
  agent: OpencodeAgent;
  hookManager: DefaultHookManager;
  pluginManager: PluginManager;
  mcpHub: McpHub;
  shutdown: () => Promise<void>;
}

export async function bootstrap(config: BootstrapConfig): Promise<BootstrapResult> {
  if (config.logLevel) {
    setLogLevel(config.logLevel);
  }

  logger.info('Bootstrapping new architecture...');

  const mcpHub = new McpHub();

  const hookManager = createHookManager();

  const channel = new FeishuChannel(config.feishu);

  const agent = new OpencodeAgent(config.agent);

  const gateway = new Gateway({
    defaultAgent: 'opencode',
    maxConcurrency: config.gateway?.maxConcurrency ?? 10,
    bindings: config.gateway?.bindings,
  });

  const pluginDeps: PluginManagerDependencies = {
    hookManager,
    mcpHub,
    getChannel: (id) => gateway.getChannel(id),
    getAgent: (id) => gateway.getAgent(id),
    registerChannel: (ch) => gateway.registerChannel(ch),
    registerAgent: (ag) => gateway.registerAgent(ag),
    registerMcpServer: (server) => mcpHub.registerServer(server),
  };

  const pluginManager = createPluginManager({}, pluginDeps);

  setupDefaultHooks(hookManager);

  gateway.registerChannel(channel);
  gateway.registerAgent(agent);

  await gateway.start();

  logger.info('Bootstrap complete', {
    channels: Array.from((gateway as any).channels.keys()),
    agents: Array.from((gateway as any).agents.keys()),
  });

  const shutdown = async () => {
    logger.info('Shutting down...');
    await gateway.stop();
    hookManager.clear();
    logger.info('Shutdown complete');
  };

  return {
    gateway,
    channel,
    agent,
    hookManager,
    pluginManager,
    mcpHub,
    shutdown,
  };
}

function setupDefaultHooks(hookManager: DefaultHookManager): void {
  hookManager.register('message.received', async (event) => {
    const e = event as MessageReceivedHook;
    logger.debug('Hook: message received', { 
      chatId: e.context.chatId,
      senderId: e.context.senderId,
    });
  }, { priority: -100, source: 'bootstrap' });

  hookManager.register('session.created', async (event) => {
    const e = event as SessionCreatedHook;
    logger.debug('Hook: session created', { 
      sessionId: e.sessionId,
      projectPath: e.projectPath,
    });
  }, { priority: -100, source: 'bootstrap' });

  hookManager.register('error.occurred', async (event) => {
    const e = event as ErrorOccurredHook;
    logger.error('Hook: error occurred', { 
      code: e.code,
      message: e.message,
      context: e.context,
    });
  }, { priority: -100, source: 'bootstrap' });
}

export async function bootstrapFromEnv(): Promise<BootstrapResult> {
  const appConfig = loadConfig({});
  
  return bootstrap({
    feishu: {
      appId: appConfig.feishuAppId,
      appSecret: appConfig.feishuAppSecret,
    },
    agent: {
      directory: getDefaultProjectPath(),
    },
    logLevel: appConfig.logLevel as any,
  });
}
