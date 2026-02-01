import type { IChannel } from './channel';

export type ToolInputSchema = {
  type: 'object';
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    items?: { type: string };
    required?: boolean;
  }>;
  required?: string[];
};

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
}

export interface ToolResult {
  success: boolean;
  output?: unknown;
  error?: string;
}

export type ToolHandler = (input: unknown, context: ToolContext) => Promise<ToolResult>;

export interface ToolContext {
  channelId?: string;
  chatId?: string;
  userId?: string;
  sessionId?: string;
}

export interface IMcpServer {
  readonly name: string;
  readonly version: string;
  
  listTools(): ToolDefinition[];
  callTool(name: string, input: unknown, context: ToolContext): Promise<ToolResult>;
}

export interface McpClientConfig {
  name: string;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

export interface IMcpClient {
  readonly name: string;
  readonly connected: boolean;
  
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listTools(): Promise<ToolDefinition[]>;
  callTool(name: string, input: unknown): Promise<ToolResult>;
}

export interface McpHubConfig {
  servers?: Record<string, { enabled: boolean }>;
  clients?: McpClientConfig[];
}

export interface IMcpHub {
  registerServer(server: IMcpServer): void;
  unregisterServer(name: string): void;
  
  addClient(config: McpClientConfig): Promise<IMcpClient>;
  removeClient(name: string): Promise<void>;
  
  listAllTools(): ToolDefinition[];
  callTool(name: string, input: unknown, context: ToolContext): Promise<ToolResult>;
  
  getServer(name: string): IMcpServer | undefined;
  getClient(name: string): IMcpClient | undefined;
}
