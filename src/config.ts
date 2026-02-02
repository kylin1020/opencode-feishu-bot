import { z } from 'zod';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseToml } from 'smol-toml';

export const CONFIG_DIR = join(homedir(), '.config', 'opencode-bot');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.toml');

export interface ProjectConfig {
  path: string;
  name: string;
}

export interface ModelConfig {
  id: string;
  name?: string;
}

export interface DocsConfig {
  defaultFolderToken?: string;
  wikiSpaceId?: string;
}

interface TomlAgentConfig {
  id: string;
  type: string;
  name?: string;
  enabled?: boolean;
  options?: Record<string, unknown>;
}

interface TomlBindingConfig {
  id: string;
  name?: string;
  agent_id: string;
  priority?: number;
  enabled?: boolean;
  match?: {
    channel_id?: string | string[];
    channel_type?: string | string[];
    chat_type?: 'private' | 'group' | '*';
    chat_id?: string | string[];
    user_id?: string | string[];
    message_pattern?: string;
  };
}

interface TomlMcpClientConfig {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

interface TomlMcpConfig {
  servers?: Record<string, { enabled?: boolean }>;
  clients?: TomlMcpClientConfig[];
}

interface TomlHookConfig {
  enabled?: boolean;
  handlers?: Array<{
    event: string;
    path: string;
    priority?: number;
  }>;
}

interface TomlPluginConfig {
  enabled?: boolean;
  workspace_path?: string;
  managed_path?: string;
  bundled?: string[];
}

interface TomlConfig {
  feishu?: {
    app_id?: string;
    app_secret?: string;
    docs?: {
      default_folder_token?: string;
      wiki_space_id?: string;
    };
  };
  admin?: {
    user_ids?: string[];
    allow_all_users?: boolean;
  };
  database?: {
    path?: string;
  };
  logging?: {
    level?: string;
  };
  projects?: Array<{
    path: string;
    name?: string;
  }>;
  models?: {
    default?: string;
    available?: Array<{
      id: string;
      name?: string;
    }>;
  };
  agents?: TomlAgentConfig[];
  bindings?: {
    default_agent?: string;
    rules?: TomlBindingConfig[];
  };
  mcp?: TomlMcpConfig;
  hooks?: TomlHookConfig;
  plugins?: TomlPluginConfig;
}

const agentConfigSchema = z.object({
  id: z.string(),
  type: z.string(),
  name: z.string().optional(),
  enabled: z.boolean().default(true),
  options: z.record(z.string(), z.unknown()).optional(),
});

const bindingMatchSchema = z.object({
  channelId: z.union([z.string(), z.array(z.string())]).optional(),
  channelType: z.union([z.string(), z.array(z.string())]).optional(),
  chatType: z.enum(['private', 'group', '*']).optional(),
  chatId: z.union([z.string(), z.array(z.string())]).optional(),
  userId: z.union([z.string(), z.array(z.string())]).optional(),
  messagePattern: z.string().optional(),
});

const bindingConfigSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  agentId: z.string(),
  priority: z.number().default(0),
  enabled: z.boolean().default(true),
  match: bindingMatchSchema.optional(),
});

const mcpClientConfigSchema = z.object({
  name: z.string(),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const mcpConfigSchema = z.object({
  servers: z.record(z.string(), z.object({ enabled: z.boolean().default(true) })).default({}),
  clients: z.array(mcpClientConfigSchema).default([]),
});

const hookConfigSchema = z.object({
  enabled: z.boolean().default(true),
  handlers: z.array(z.object({
    event: z.string(),
    path: z.string(),
    priority: z.number().default(0),
  })).default([]),
});

const pluginConfigSchema = z.object({
  enabled: z.boolean().default(true),
  workspacePath: z.string().optional(),
  managedPath: z.string().optional(),
  bundled: z.array(z.string()).default([]),
});

const bindingsConfigSchema = z.object({
  defaultAgent: z.string().default('opencode'),
  rules: z.array(bindingConfigSchema).default([]),
});

const configSchema = z.object({
  feishuAppId: z.string().min(1, '必须提供飞书应用 ID'),
  feishuAppSecret: z.string().min(1, '必须提供飞书应用密钥'),
  adminUserIds: z.array(z.string()).default([]),
  allowAllUsers: z.boolean().default(true),
  databasePath: z.string().optional(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  projects: z.array(z.object({
    path: z.string(),
    name: z.string(),
  })).default([]),
  defaultModel: z.string().optional(),
  availableModels: z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
  })).default([]),
  docs: z.object({
    defaultFolderToken: z.string().optional(),
    wikiSpaceId: z.string().optional(),
  }).default({}),
  agents: z.array(agentConfigSchema).default([]),
  bindings: bindingsConfigSchema.default({ defaultAgent: 'opencode', rules: [] }),
  mcp: mcpConfigSchema.default({ servers: {}, clients: [] }),
  hooks: hookConfigSchema.default({ enabled: true, handlers: [] }),
  plugins: pluginConfigSchema.default({ enabled: true, bundled: [] }),
});

export type Config = z.infer<typeof configSchema>;

export interface CliOverrides {
  model?: string;
  project?: string;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  configFile?: string;
}

function loadTomlConfig(configPath: string): TomlConfig {
  if (!existsSync(configPath)) {
    return {};
  }
  
  try {
    const content = readFileSync(configPath, 'utf-8');
    return parseToml(content) as TomlConfig;
  } catch (error) {
    throw new Error(`配置文件解析失败 (${configPath}): ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** 优先级：CLI 参数 > 环境变量 > 配置文件 > 默认值 */
export function loadConfig(overrides?: CliOverrides): Config {
  const configPath = overrides?.configFile || CONFIG_FILE;
  const toml = loadTomlConfig(configPath);
  
  const raw = {
    feishuAppId: process.env.FEISHU_APP_ID || toml.feishu?.app_id || '',
    feishuAppSecret: process.env.FEISHU_APP_SECRET || toml.feishu?.app_secret || '',
    adminUserIds: process.env.ADMIN_USER_IDS 
      ? process.env.ADMIN_USER_IDS.split(',').map(s => s.trim()).filter(Boolean)
      : toml.admin?.user_ids || [],
    allowAllUsers: process.env.ALLOW_ALL_USERS !== undefined
      ? process.env.ALLOW_ALL_USERS !== 'false'
      : toml.admin?.allow_all_users ?? true,
    logLevel: overrides?.logLevel || process.env.LOG_LEVEL || toml.logging?.level || 'info',
    projects: toml.projects?.map(p => ({
      path: p.path,
      name: p.name || p.path,
    })) || [],
    defaultModel: overrides?.model || process.env.DEFAULT_MODEL || toml.models?.default,
    availableModels: toml.models?.available || [],
    docs: {
      defaultFolderToken: process.env.FEISHU_DEFAULT_FOLDER_TOKEN || toml.feishu?.docs?.default_folder_token,
      wikiSpaceId: process.env.FEISHU_WIKI_SPACE_ID || toml.feishu?.docs?.wiki_space_id,
    },
    agents: toml.agents?.map(a => ({
      id: a.id,
      type: a.type,
      name: a.name,
      enabled: a.enabled ?? true,
      options: a.options,
    })) || [],
    bindings: {
      defaultAgent: toml.bindings?.default_agent || 'opencode',
      rules: toml.bindings?.rules?.map(r => ({
        id: r.id,
        name: r.name,
        agentId: r.agent_id,
        priority: r.priority ?? 0,
        enabled: r.enabled ?? true,
        match: r.match ? {
          channelId: r.match.channel_id,
          channelType: r.match.channel_type,
          chatType: r.match.chat_type,
          chatId: r.match.chat_id,
          userId: r.match.user_id,
          messagePattern: r.match.message_pattern,
        } : undefined,
      })) || [],
    },
    mcp: {
      servers: toml.mcp?.servers || {},
      clients: toml.mcp?.clients?.map(c => ({
        name: c.name,
        command: c.command,
        args: c.args,
        url: c.url,
        env: c.env,
      })) || [],
    },
    hooks: {
      enabled: toml.hooks?.enabled ?? true,
      handlers: toml.hooks?.handlers?.map(h => ({
        event: h.event,
        path: h.path,
        priority: h.priority ?? 0,
      })) || [],
    },
    plugins: {
      enabled: toml.plugins?.enabled ?? true,
      workspacePath: toml.plugins?.workspace_path,
      managedPath: toml.plugins?.managed_path,
      bundled: toml.plugins?.bundled || [],
    },
  };
  
  if (process.env.PROJECTS) {
    raw.projects = process.env.PROJECTS
      .split(',')
      .map(item => {
        const [path, name] = item.split(':').map(s => s.trim());
        if (!path) return null;
        return { path, name: name || path };
      })
      .filter((item): item is ProjectConfig => item !== null);
  }
  
  if (process.env.AVAILABLE_MODELS) {
    raw.availableModels = [];
    for (const item of process.env.AVAILABLE_MODELS.split(',')) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      const lastColonIndex = trimmed.lastIndexOf(':');
      if (lastColonIndex === -1) {
        raw.availableModels.push({ id: trimmed });
      } else {
        const id = trimmed.slice(0, lastColonIndex).trim();
        const name = trimmed.slice(lastColonIndex + 1).trim();
        if (id) {
          raw.availableModels.push(name ? { id, name } : { id });
        }
      }
    }
  }
  
  const result = configSchema.safeParse(raw);
  
  if (!result.success) {
    const errors = result.error.issues.map(e => 
      `${String(e.path.join('.'))}: ${e.message}`
    ).join('\n');
    throw new Error(`配置验证失败:\n${errors}`);
  }
  
  return result.data;
}

export function getAdminUserIds(config: Config): string[] {
  return config.adminUserIds;
}

export function getDefaultProjectPath(override?: string): string {
  return override || process.cwd();
}

export function getDefaultModel(config: Config): string | undefined {
  return config.defaultModel;
}

export function getProjects(config: Config): ProjectConfig[] {
  return config.projects;
}

export function getAvailableModels(config: Config): ModelConfig[] {
  return config.availableModels;
}

export function filterModels<T extends { id: string; name: string }>(
  allModels: T[],
  configuredModels: ModelConfig[]
): T[] {
  if (configuredModels.length === 0) {
    return allModels;
  }
  
  const result: T[] = [];
  
  for (const configured of configuredModels) {
    const found = allModels.find(m => m.id === configured.id);
    if (found) {
      result.push(configured.name ? { ...found, name: configured.name } : found);
    }
  }
  
  return result;
}

export function getDocsConfig(config: Config): DocsConfig {
  return config.docs;
}

export function getAgentsConfig(config: Config) {
  return config.agents;
}

export function getBindingsConfig(config: Config) {
  return config.bindings;
}

export function getMcpConfig(config: Config) {
  return config.mcp;
}

export function getHooksConfig(config: Config) {
  return config.hooks;
}

export function getPluginsConfig(config: Config) {
  return config.plugins;
}
