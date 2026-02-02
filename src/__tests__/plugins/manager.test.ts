import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { PluginManager, createPluginManager, type PluginManagerDependencies } from '../../plugins/manager';
import { createHookManager } from '../../hooks/manager';
import type { IPlugin, PluginAPI, PluginInfo } from '../../types/plugin';
import type { IMcpHub, IMcpServer, ToolDefinition, ToolResult, ToolContext } from '../../types/mcp';

class MockMcpHub implements IMcpHub {
  private servers = new Map<string, IMcpServer>();

  registerServer(server: IMcpServer): void {
    this.servers.set(server.name, server);
  }
  unregisterServer(name: string): void {
    this.servers.delete(name);
  }
  async addClient() { return {} as any; }
  async removeClient() {}
  listAllTools(): ToolDefinition[] { return []; }
  async callTool(): Promise<ToolResult> { return { success: true }; }
  getServer(name: string) { return this.servers.get(name); }
  getClient() { return undefined; }
}

function createMockDeps(): PluginManagerDependencies {
  return {
    hookManager: createHookManager(),
    mcpHub: new MockMcpHub(),
    getChannel: () => undefined,
    getAgent: () => undefined,
    registerChannel: mock(() => {}),
    registerAgent: mock(() => {}),
    registerMcpServer: mock(() => {}),
  };
}

class TestPlugin implements IPlugin {
  readonly name = 'test-plugin';
  readonly version = '1.0.0';
  
  activateCalled = false;
  deactivateCalled = false;
  api: PluginAPI | null = null;

  async activate(api: PluginAPI): Promise<void> {
    this.activateCalled = true;
    this.api = api;
  }

  async deactivate(): Promise<void> {
    this.deactivateCalled = true;
  }
}

describe('PluginManager', () => {
  let manager: PluginManager;
  let deps: PluginManagerDependencies;

  beforeEach(() => {
    deps = createMockDeps();
    manager = createPluginManager({}, deps);
  });

  describe('discover', () => {
    test('should return empty array when no plugins configured', async () => {
      const plugins = await manager.discover();
      expect(plugins).toEqual([]);
    });

    test('should discover bundled plugins', async () => {
      manager = createPluginManager({
        bundledPlugins: ['plugin1', 'plugin2'],
      }, deps);

      const plugins = await manager.discover();

      expect(plugins).toHaveLength(2);
      expect(plugins[0]!.manifest.name).toBe('plugin1');
      expect(plugins[0]!.source).toBe('bundled');
      expect(plugins[1]!.manifest.name).toBe('plugin2');
    });
  });

  describe('load/unload', () => {
    test('should throw when loading unknown plugin', async () => {
      await expect(manager.load('unknown')).rejects.toThrow('Plugin unknown not found');
    });

    test('should throw when loading already loaded plugin', async () => {
      const info: PluginInfo = {
        manifest: { name: 'test', version: '1.0.0' },
        source: 'bundled',
        path: 'bundled:test',
        enabled: true,
      };
      manager.registerPluginInfo(info);

      await expect(manager.load('test')).rejects.toThrow();
    });

    test('should track loaded status', () => {
      expect(manager.isLoaded('test')).toBe(false);
    });

    test('should return loaded plugins map', () => {
      const loaded = manager.getLoaded();
      expect(loaded).toBeInstanceOf(Map);
      expect(loaded.size).toBe(0);
    });
  });

  describe('commands', () => {
    test('should start with no commands', () => {
      expect(manager.listCommands()).toEqual([]);
    });

    test('should return undefined for unknown command', () => {
      expect(manager.getCommand('unknown')).toBeUndefined();
    });
  });

  describe('registerPluginInfo', () => {
    test('should store plugin info', () => {
      const info: PluginInfo = {
        manifest: { name: 'my-plugin', version: '2.0.0' },
        source: 'workspace',
        path: '/path/to/plugin',
        enabled: true,
      };

      manager.registerPluginInfo(info);

    });
  });
});

describe('PluginAPI', () => {
  test('should provide all required methods', () => {
    const deps = createMockDeps();
    const manager = createPluginManager({}, deps);

    const api = (manager as any).createPluginAPI('test-plugin');

    expect(typeof api.registerChannel).toBe('function');
    expect(typeof api.registerAgent).toBe('function');
    expect(typeof api.registerMcpServer).toBe('function');
    expect(typeof api.registerHook).toBe('function');
    expect(typeof api.registerCommand).toBe('function');
    expect(typeof api.getChannel).toBe('function');
    expect(typeof api.getAgent).toBe('function');
    expect(typeof api.getMcpHub).toBe('function');
    expect(api.log).toBeDefined();
    expect(typeof api.log.debug).toBe('function');
    expect(typeof api.log.info).toBe('function');
    expect(typeof api.log.warn).toBe('function');
    expect(typeof api.log.error).toBe('function');
    expect(api.config).toBeDefined();
    expect(typeof api.config.get).toBe('function');
    expect(typeof api.config.set).toBe('function');
  });

  test('registerCommand should store command', () => {
    const deps = createMockDeps();
    const manager = createPluginManager({}, deps);

    const api = (manager as any).createPluginAPI('test-plugin');
    const handler = async () => 'result';

    api.registerCommand('test-cmd', handler);

    const cmd = manager.getCommand('test-cmd');
    expect(cmd).toBeDefined();
    expect(cmd!.source).toBe('test-plugin');
  });

  test('registerCommand should throw on duplicate', () => {
    const deps = createMockDeps();
    const manager = createPluginManager({}, deps);

    const api = (manager as any).createPluginAPI('test-plugin');
    
    api.registerCommand('dup-cmd', async () => '');

    expect(() => api.registerCommand('dup-cmd', async () => '')).toThrow();
  });

  test('registerHook should call hookManager', () => {
    const deps = createMockDeps();
    const registerSpy = mock(() => 'hook_id');
    deps.hookManager.register = registerSpy;

    const manager = createPluginManager({}, deps);
    const api = (manager as any).createPluginAPI('test-plugin');

    api.registerHook('message.received', async () => {});

    expect(registerSpy).toHaveBeenCalled();
  });

  test('getMcpHub should return the hub', () => {
    const deps = createMockDeps();
    const manager = createPluginManager({}, deps);

    const api = (manager as any).createPluginAPI('test-plugin');

    expect(api.getMcpHub()).toBe(deps.mcpHub);
  });
});
