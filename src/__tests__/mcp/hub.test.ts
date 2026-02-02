import { describe, test, expect, beforeEach } from 'bun:test';
import { McpHub } from '../../mcp/hub';
import type { IMcpServer, ToolDefinition, ToolResult, ToolContext } from '../../types/mcp';

class TestMcpServer implements IMcpServer {
  readonly name: string;
  readonly version: string;
  private tools: ToolDefinition[];

  constructor(name: string, tools: ToolDefinition[] = []) {
    this.name = name;
    this.version = '1.0.0';
    this.tools = tools;
  }

  listTools(): ToolDefinition[] {
    return this.tools;
  }

  async callTool(name: string, input: unknown, context: ToolContext): Promise<ToolResult> {
    const tool = this.tools.find(t => t.name === name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` };
    }
    return { success: true, output: { tool: name, input } };
  }
}

describe('McpHub', () => {
  let hub: McpHub;

  beforeEach(() => {
    hub = new McpHub();
  });

  test('should register server', () => {
    const server = new TestMcpServer('test-server', [
      { name: 'tool1', description: 'Test tool', inputSchema: { type: 'object', properties: {} } },
    ]);

    hub.registerServer(server);

    expect(hub.getServer('test-server')).toBe(server);
    expect(hub.getRegisteredServers()).toContain('test-server');
  });

  test('should list all tools from servers', () => {
    hub.registerServer(new TestMcpServer('server1', [
      { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object', properties: {} } },
    ]));

    hub.registerServer(new TestMcpServer('server2', [
      { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object', properties: {} } },
    ]));

    const tools = hub.listAllTools();

    expect(tools).toHaveLength(2);
    expect(tools.map(t => t.name)).toContain('server1.tool1');
    expect(tools.map(t => t.name)).toContain('server2.tool2');
  });

  test('should call tool on correct server', async () => {
    hub.registerServer(new TestMcpServer('test-server', [
      { name: 'echo', description: 'Echo input', inputSchema: { type: 'object', properties: {} } },
    ]));

    const result = await hub.callTool('test-server.echo', { message: 'hello' }, {});

    expect(result.success).toBe(true);
    expect(result.output).toEqual({ tool: 'echo', input: { message: 'hello' } });
  });

  test('should return error for unknown tool', async () => {
    const result = await hub.callTool('unknown.tool', {}, {});

    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown tool');
  });

  test('should unregister server', () => {
    const server = new TestMcpServer('to-remove', [
      { name: 'tool', description: 'Test', inputSchema: { type: 'object', properties: {} } },
    ]);

    hub.registerServer(server);
    expect(hub.getServer('to-remove')).toBe(server);

    hub.unregisterServer('to-remove');
    expect(hub.getServer('to-remove')).toBeUndefined();
    expect(hub.listAllTools()).toHaveLength(0);
  });

  test('should throw on duplicate server registration', () => {
    const server = new TestMcpServer('duplicate');
    hub.registerServer(server);

    expect(() => hub.registerServer(server)).toThrow();
  });

  test('should respect disabled servers in config', () => {
    const hubWithConfig = new McpHub({
      enabledServers: { 'disabled-server': false },
    });

    const server = new TestMcpServer('disabled-server', [
      { name: 'tool', description: 'Test', inputSchema: { type: 'object', properties: {} } },
    ]);

    hubWithConfig.registerServer(server);

    expect(hubWithConfig.getServer('disabled-server')).toBeUndefined();
  });

  test('should add and connect client', async () => {
    const client = await hub.addClient({
      name: 'external-mcp',
      command: 'node',
      args: ['external-server.js'],
    });

    expect(client.connected).toBe(true);
    expect(hub.getClient('external-mcp')).toBe(client);
    expect(hub.getConnectedClients()).toContain('external-mcp');
  });

  test('should remove client', async () => {
    await hub.addClient({
      name: 'to-remove',
      command: 'node',
    });

    expect(hub.getClient('to-remove')).toBeDefined();

    await hub.removeClient('to-remove');

    expect(hub.getClient('to-remove')).toBeUndefined();
  });
});
