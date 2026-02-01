import type { IChannel } from './channel';
import type { IAgentRuntime } from './agent';
import type { IMcpHub, IMcpServer, ToolDefinition } from './mcp';
import type { HookManager } from './hook';

export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  dependencies?: Record<string, string>;
}

export type PluginSource = 'bundled' | 'managed' | 'workspace';

export interface PluginInfo {
  manifest: PluginManifest;
  source: PluginSource;
  path: string;
  enabled: boolean;
}

export interface PluginAPI {
  registerChannel(channel: IChannel): void;
  registerAgent(agent: IAgentRuntime): void;
  registerMcpServer(server: IMcpServer): void;
  registerHook<T extends string>(event: T, handler: (data: unknown) => Promise<void>): void;
  registerCommand(name: string, handler: CommandHandler): void;
  
  getChannel(id: string): IChannel | undefined;
  getAgent(id: string): IAgentRuntime | undefined;
  getMcpHub(): IMcpHub;
  
  log: {
    debug(message: string, data?: unknown): void;
    info(message: string, data?: unknown): void;
    warn(message: string, data?: unknown): void;
    error(message: string, data?: unknown): void;
  };
  
  config: {
    get<T>(key: string): T | undefined;
    set<T>(key: string, value: T): void;
  };
}

export type CommandHandler = (args: string[], context: CommandContext) => Promise<string>;

export interface CommandContext {
  channelId: string;
  chatId: string;
  userId: string;
  isAdmin: boolean;
}

export interface IPlugin {
  readonly name: string;
  readonly version: string;
  
  activate(api: PluginAPI): Promise<void>;
  deactivate(): Promise<void>;
}

export type PluginFactory = () => IPlugin;

export interface PluginLoaderConfig {
  workspacePath?: string;
  managedPath?: string;
  bundledPlugins?: string[];
}

export interface IPluginLoader {
  discover(): Promise<PluginInfo[]>;
  load(name: string): Promise<IPlugin>;
  unload(name: string): Promise<void>;
  
  getLoaded(): Map<string, IPlugin>;
  isLoaded(name: string): boolean;
}
