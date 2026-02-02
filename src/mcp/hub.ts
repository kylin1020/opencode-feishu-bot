import type {
  IMcpHub,
  IMcpServer,
  IMcpClient,
  McpClientConfig,
  ToolDefinition,
  ToolResult,
  ToolContext,
} from '../types/mcp';
import { logger } from '../utils/logger';

export interface McpHubOptions {
  enabledServers?: Record<string, boolean>;
}

export class McpHub implements IMcpHub {
  private servers = new Map<string, IMcpServer>();
  private clients = new Map<string, IMcpClient>();
  private toolToSource = new Map<string, string>();
  private options: McpHubOptions;

  constructor(options: McpHubOptions = {}) {
    this.options = options;
  }

  registerServer(server: IMcpServer): void {
    if (this.servers.has(server.name)) {
      throw new Error(`MCP Server ${server.name} already registered`);
    }

    const enabled = this.options.enabledServers?.[server.name] ?? true;
    if (!enabled) {
      logger.info('MCP Server disabled by config', { name: server.name });
      return;
    }

    this.servers.set(server.name, server);
    
    for (const tool of server.listTools()) {
      const fullName = `${server.name}.${tool.name}`;
      this.toolToSource.set(fullName, server.name);
    }
    
    logger.info('MCP Server registered', { 
      name: server.name, 
      version: server.version,
      tools: server.listTools().map(t => t.name),
    });
  }

  unregisterServer(name: string): void {
    const server = this.servers.get(name);
    if (server) {
      for (const tool of server.listTools()) {
        const fullName = `${name}.${tool.name}`;
        this.toolToSource.delete(fullName);
      }
      this.servers.delete(name);
      logger.info('MCP Server unregistered', { name });
    }
  }

  async addClient(config: McpClientConfig): Promise<IMcpClient> {
    if (this.clients.has(config.name)) {
      throw new Error(`MCP Client ${config.name} already exists`);
    }

    const client = new ExternalMcpClient(config);
    await client.connect();
    
    this.clients.set(config.name, client);
    
    const tools = await client.listTools();
    for (const tool of tools) {
      const fullName = `${config.name}.${tool.name}`;
      this.toolToSource.set(fullName, config.name);
    }
    
    logger.info('MCP Client added', { 
      name: config.name, 
      tools: tools.map(t => t.name),
    });
    
    return client;
  }

  async removeClient(name: string): Promise<void> {
    const client = this.clients.get(name);
    if (client) {
      if (client.connected) {
        await client.disconnect();
      }
      
      const tools = await client.listTools();
      for (const tool of tools) {
        const fullName = `${name}.${tool.name}`;
        this.toolToSource.delete(fullName);
      }
      
      this.clients.delete(name);
      logger.info('MCP Client removed', { name });
    }
  }

  listAllTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    
    for (const [name, server] of this.servers) {
      for (const tool of server.listTools()) {
        tools.push({
          ...tool,
          name: `${name}.${tool.name}`,
        });
      }
    }
    
    for (const [name, client] of this.clients) {
      if (client.connected) {
        const clientTools = (client as ExternalMcpClient).getCachedTools();
        for (const tool of clientTools) {
          tools.push({
            ...tool,
            name: `${name}.${tool.name}`,
          });
        }
      }
    }
    
    return tools;
  }

  async callTool(name: string, input: unknown, context: ToolContext): Promise<ToolResult> {
    const sourceName = this.toolToSource.get(name);
    if (!sourceName) {
      return { success: false, error: `Unknown tool: ${name}` };
    }

    const toolName = name.replace(`${sourceName}.`, '');

    const server = this.servers.get(sourceName);
    if (server) {
      try {
        return await server.callTool(toolName, input, context);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    const client = this.clients.get(sourceName);
    if (client) {
      try {
        return await client.callTool(toolName, input);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return { success: false, error: `Tool source not found: ${sourceName}` };
  }

  getServer(name: string): IMcpServer | undefined {
    return this.servers.get(name);
  }

  getClient(name: string): IMcpClient | undefined {
    return this.clients.get(name);
  }

  getRegisteredServers(): string[] {
    return Array.from(this.servers.keys());
  }

  getConnectedClients(): string[] {
    return Array.from(this.clients.entries())
      .filter(([_, client]) => client.connected)
      .map(([name]) => name);
  }
}

class ExternalMcpClient implements IMcpClient {
  readonly name: string;
  private config: McpClientConfig;
  private _connected = false;
  private cachedTools: ToolDefinition[] = [];

  constructor(config: McpClientConfig) {
    this.name = config.name;
    this.config = config;
  }

  get connected(): boolean {
    return this._connected;
  }

  async connect(): Promise<void> {
    logger.info('Connecting to external MCP', { name: this.name });
    this._connected = true;
  }

  async disconnect(): Promise<void> {
    logger.info('Disconnecting from external MCP', { name: this.name });
    this._connected = false;
    this.cachedTools = [];
  }

  async listTools(): Promise<ToolDefinition[]> {
    if (!this._connected) {
      return [];
    }
    return this.cachedTools;
  }

  getCachedTools(): ToolDefinition[] {
    return this.cachedTools;
  }

  async callTool(name: string, input: unknown): Promise<ToolResult> {
    if (!this._connected) {
      return { success: false, error: 'Client not connected' };
    }

    logger.info('Calling external MCP tool', { client: this.name, tool: name });
    return { success: true, output: { message: 'Tool execution simulated' } };
  }
}
