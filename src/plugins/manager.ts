import type {
  IPlugin,
  PluginAPI,
  PluginInfo,
  PluginManifest,
  PluginSource,
  IPluginLoader,
  PluginLoaderConfig,
  CommandHandler,
  CommandContext,
} from '../types/plugin';
import type { IChannel } from '../types/channel';
import type { IAgentRuntime } from '../types/agent';
import type { IMcpServer, IMcpHub } from '../types/mcp';
import type { HookManager } from '../types/hook';
import { logger } from '../utils/logger';

export interface PluginManagerDependencies {
  hookManager: HookManager;
  mcpHub: IMcpHub;
  getChannel: (id: string) => IChannel | undefined;
  getAgent: (id: string) => IAgentRuntime | undefined;
  registerChannel: (channel: IChannel) => void;
  registerAgent: (agent: IAgentRuntime) => void;
  registerMcpServer: (server: IMcpServer) => void;
}

export class PluginManager implements IPluginLoader {
  private plugins = new Map<string, IPlugin>();
  private pluginInfo = new Map<string, PluginInfo>();
  private commands = new Map<string, { handler: CommandHandler; source: string }>();
  private config: PluginLoaderConfig;
  private deps: PluginManagerDependencies;

  constructor(config: PluginLoaderConfig, deps: PluginManagerDependencies) {
    this.config = config;
    this.deps = deps;
  }

  async discover(): Promise<PluginInfo[]> {
    const plugins: PluginInfo[] = [];

    if (this.config.bundledPlugins) {
      for (const name of this.config.bundledPlugins) {
        plugins.push({
          manifest: { name, version: '0.0.0' },
          source: 'bundled',
          path: `bundled:${name}`,
          enabled: true,
        });
      }
    }

    logger.info('Discovered plugins', { count: plugins.length });
    return plugins;
  }

  async load(name: string): Promise<IPlugin> {
    if (this.plugins.has(name)) {
      throw new Error(`Plugin ${name} already loaded`);
    }

    const info = this.pluginInfo.get(name);
    if (!info) {
      throw new Error(`Plugin ${name} not found`);
    }

    const plugin = await this.loadPluginFromSource(info);
    const api = this.createPluginAPI(name);

    await plugin.activate(api);
    this.plugins.set(name, plugin);

    logger.info('Plugin loaded', { name, version: plugin.version });
    return plugin;
  }

  async unload(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      return;
    }

    await plugin.deactivate();
    this.plugins.delete(name);

    for (const [cmdName, cmd] of this.commands.entries()) {
      if (cmd.source === name) {
        this.commands.delete(cmdName);
      }
    }

    logger.info('Plugin unloaded', { name });
  }

  getLoaded(): Map<string, IPlugin> {
    return new Map(this.plugins);
  }

  isLoaded(name: string): boolean {
    return this.plugins.has(name);
  }

  registerPluginInfo(info: PluginInfo): void {
    this.pluginInfo.set(info.manifest.name, info);
  }

  getCommand(name: string): { handler: CommandHandler; source: string } | undefined {
    return this.commands.get(name);
  }

  listCommands(): string[] {
    return Array.from(this.commands.keys());
  }

  private async loadPluginFromSource(info: PluginInfo): Promise<IPlugin> {
    throw new Error(`Plugin loading from ${info.source} not implemented`);
  }

  private createPluginAPI(pluginName: string): PluginAPI {
    return {
      registerChannel: (channel: IChannel) => {
        this.deps.registerChannel(channel);
        logger.debug('Plugin registered channel', { plugin: pluginName, channelId: channel.id });
      },

      registerAgent: (agent: IAgentRuntime) => {
        this.deps.registerAgent(agent);
        logger.debug('Plugin registered agent', { plugin: pluginName, agentId: agent.id });
      },

      registerMcpServer: (server: IMcpServer) => {
        this.deps.registerMcpServer(server);
        logger.debug('Plugin registered MCP server', { plugin: pluginName, serverName: server.name });
      },

      registerHook: <T extends string>(event: T, handler: (data: unknown) => Promise<void>) => {
        this.deps.hookManager.register(event as any, handler as any, { source: pluginName });
        logger.debug('Plugin registered hook', { plugin: pluginName, event });
      },

      registerCommand: (name: string, handler: CommandHandler) => {
        if (this.commands.has(name)) {
          throw new Error(`Command ${name} already registered`);
        }
        this.commands.set(name, { handler, source: pluginName });
        logger.debug('Plugin registered command', { plugin: pluginName, command: name });
      },

      getChannel: (id: string) => this.deps.getChannel(id),
      getAgent: (id: string) => this.deps.getAgent(id),
      getMcpHub: () => this.deps.mcpHub,

      log: {
        debug: (message: string, data?: unknown) => {
          logger.debug(`[${pluginName}] ${message}`, data);
        },
        info: (message: string, data?: unknown) => {
          logger.info(`[${pluginName}] ${message}`, data);
        },
        warn: (message: string, data?: unknown) => {
          logger.warn(`[${pluginName}] ${message}`, data);
        },
        error: (message: string, data?: unknown) => {
          logger.error(`[${pluginName}] ${message}`, data);
        },
      },

      config: {
        get: <T>(key: string): T | undefined => {
          return undefined;
        },
        set: <T>(key: string, value: T): void => {
        },
      },
    };
  }
}

export function createPluginManager(
  config: PluginLoaderConfig,
  deps: PluginManagerDependencies
): PluginManager {
  return new PluginManager(config, deps);
}
