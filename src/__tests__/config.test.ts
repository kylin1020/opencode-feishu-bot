import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { loadConfig, CONFIG_DIR, CONFIG_FILE } from '../config';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Config', () => {
  const testDir = join(tmpdir(), 'opencode-bot-test-' + Date.now());
  const testConfigFile = join(testDir, 'config.toml');
  
  beforeEach(() => {
    mkdirSync(testDir, { recursive: true });
  });
  
  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    delete process.env.FEISHU_APP_ID;
    delete process.env.FEISHU_APP_SECRET;
  });
  
  test('should load config from environment variables', () => {
    process.env.FEISHU_APP_ID = 'test_app_id';
    process.env.FEISHU_APP_SECRET = 'test_app_secret';
    
    const config = loadConfig({ configFile: testConfigFile });
    
    expect(config.feishuAppId).toBe('test_app_id');
    expect(config.feishuAppSecret).toBe('test_app_secret');
  });
  
  test('should load config from TOML file', () => {
    const tomlContent = `
[feishu]
app_id = "toml_app_id"
app_secret = "toml_app_secret"

[admin]
user_ids = ["ou_admin1"]
allow_all_users = false

[logging]
level = "debug"
`;
    writeFileSync(testConfigFile, tomlContent);
    
    const config = loadConfig({ configFile: testConfigFile });
    
    expect(config.feishuAppId).toBe('toml_app_id');
    expect(config.feishuAppSecret).toBe('toml_app_secret');
    expect(config.adminUserIds).toEqual(['ou_admin1']);
    expect(config.allowAllUsers).toBe(false);
    expect(config.logLevel).toBe('debug');
  });
  
  test('should have default values for new architecture configs', () => {
    process.env.FEISHU_APP_ID = 'test_id';
    process.env.FEISHU_APP_SECRET = 'test_secret';
    
    const config = loadConfig({ configFile: testConfigFile });
    
    expect(config.agents).toEqual([]);
    expect(config.bindings.defaultAgent).toBe('opencode');
    expect(config.bindings.rules).toEqual([]);
    expect(config.mcp.servers).toEqual({});
    expect(config.mcp.clients).toEqual([]);
    expect(config.hooks.enabled).toBe(true);
    expect(config.hooks.handlers).toEqual([]);
    expect(config.plugins.enabled).toBe(true);
    expect(config.plugins.bundled).toEqual([]);
  });
  
  test('should load agents config from TOML', () => {
    const tomlContent = `
[feishu]
app_id = "test_id"
app_secret = "test_secret"

[[agents]]
id = "opencode"
type = "opencode"
name = "OpenCode Agent"
enabled = true
`;
    writeFileSync(testConfigFile, tomlContent);
    
    const config = loadConfig({ configFile: testConfigFile });
    
    expect(config.agents).toHaveLength(1);
    const agent = config.agents[0]!;
    expect(agent.id).toBe('opencode');
    expect(agent.type).toBe('opencode');
    expect(agent.name).toBe('OpenCode Agent');
    expect(agent.enabled).toBe(true);
  });
  
  test('should load bindings config from TOML', () => {
    const tomlContent = `
[feishu]
app_id = "test_id"
app_secret = "test_secret"

[bindings]
default_agent = "custom-agent"

[[bindings.rules]]
id = "vip"
agent_id = "premium"
priority = 10
[bindings.rules.match]
user_id = ["ou_vip1", "ou_vip2"]
`;
    writeFileSync(testConfigFile, tomlContent);
    
    const config = loadConfig({ configFile: testConfigFile });
    
    expect(config.bindings.defaultAgent).toBe('custom-agent');
    expect(config.bindings.rules).toHaveLength(1);
    const rule = config.bindings.rules[0]!;
    expect(rule.id).toBe('vip');
    expect(rule.agentId).toBe('premium');
    expect(rule.priority).toBe(10);
    expect(rule.match?.userId).toEqual(['ou_vip1', 'ou_vip2']);
  });
  
  test('should load MCP config from TOML', () => {
    const tomlContent = `
[feishu]
app_id = "test_id"
app_secret = "test_secret"

[mcp.servers]
feishu = { enabled = true }

[[mcp.clients]]
name = "external"
command = "npx"
args = ["-y", "@example/mcp"]
`;
    writeFileSync(testConfigFile, tomlContent);
    
    const config = loadConfig({ configFile: testConfigFile });
    
    expect(config.mcp.servers['feishu']).toEqual({ enabled: true });
    expect(config.mcp.clients).toHaveLength(1);
    const client = config.mcp.clients[0]!;
    expect(client.name).toBe('external');
    expect(client.command).toBe('npx');
    expect(client.args).toEqual(['-y', '@example/mcp']);
  });
  
  test('should prefer environment variables over TOML', () => {
    process.env.FEISHU_APP_ID = 'env_app_id';
    process.env.FEISHU_APP_SECRET = 'env_app_secret';
    
    const tomlContent = `
[feishu]
app_id = "toml_app_id"
app_secret = "toml_app_secret"
`;
    writeFileSync(testConfigFile, tomlContent);
    
    const config = loadConfig({ configFile: testConfigFile });
    
    expect(config.feishuAppId).toBe('env_app_id');
    expect(config.feishuAppSecret).toBe('env_app_secret');
  });
  
  test('should prefer CLI overrides over environment variables', () => {
    process.env.FEISHU_APP_ID = 'test_id';
    process.env.FEISHU_APP_SECRET = 'test_secret';
    process.env.LOG_LEVEL = 'error';
    
    const config = loadConfig({ 
      configFile: testConfigFile,
      logLevel: 'debug',
    });
    
    expect(config.logLevel).toBe('debug');
  });
  
  test('should throw on missing required fields', () => {
    expect(() => loadConfig({ configFile: testConfigFile })).toThrow();
  });
  
  test('CONFIG_DIR should point to opencode-bot', () => {
    expect(CONFIG_DIR).toContain('opencode-bot');
  });
});
