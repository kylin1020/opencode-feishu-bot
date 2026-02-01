import { z } from 'zod';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseToml } from 'smol-toml';

export const CONFIG_DIR = join(homedir(), '.config', 'opencode-feishu-bot');
export const CONFIG_FILE = join(CONFIG_DIR, 'config.toml');
export const DEFAULT_DATABASE_PATH = join(CONFIG_DIR, 'bot.db');

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
}

const configSchema = z.object({
  feishuAppId: z.string().min(1, '必须提供飞书应用 ID'),
  feishuAppSecret: z.string().min(1, '必须提供飞书应用密钥'),
  adminUserIds: z.array(z.string()).default([]),
  allowAllUsers: z.boolean().default(true),
  databasePath: z.string().default(DEFAULT_DATABASE_PATH),
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
    databasePath: process.env.DATABASE_PATH || toml.database?.path || DEFAULT_DATABASE_PATH,
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
