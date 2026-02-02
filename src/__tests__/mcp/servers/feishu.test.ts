import { describe, test, expect, beforeEach } from 'bun:test';
import { FeishuMcpServer } from '../../../mcp/servers/feishu';
import type { ToolContext } from '../../../types/mcp';

describe('FeishuMcpServer', () => {
  let server: FeishuMcpServer;
  let mockSendMessage: ReturnType<typeof createMock>;
  let mockCreateChat: ReturnType<typeof createMock>;
  
  function createMock() {
    const calls: unknown[][] = [];
    const fn = (...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve('mock_result');
    };
    fn.calls = calls;
    return fn;
  }
  
  beforeEach(() => {
    mockSendMessage = createMock();
    mockCreateChat = createMock();
    
    server = new FeishuMcpServer({
      larkClient: {} as any,
      apiClient: {} as any,
      sendMessage: mockSendMessage,
      createChat: mockCreateChat,
    });
  });
  
  test('should have correct name and version', () => {
    expect(server.name).toBe('feishu');
    expect(server.version).toBe('1.0.0');
  });
  
  test('should list 6 tools', () => {
    const tools = server.listTools();
    expect(tools).toHaveLength(6);
    
    const toolNames = tools.map(t => t.name);
    expect(toolNames).toContain('send_message');
    expect(toolNames).toContain('read_document');
    expect(toolNames).toContain('create_document');
    expect(toolNames).toContain('read_sheet');
    expect(toolNames).toContain('write_sheet');
    expect(toolNames).toContain('create_group');
  });
  
  test('send_message tool should have correct schema', () => {
    const tools = server.listTools();
    const sendTool = tools.find(t => t.name === 'send_message');
    
    expect(sendTool).toBeDefined();
    expect(sendTool!.inputSchema.required).toContain('chat_id');
    expect(sendTool!.inputSchema.required).toContain('text');
  });
  
  test('read_document tool should have correct schema', () => {
    const tools = server.listTools();
    const readTool = tools.find(t => t.name === 'read_document');
    
    expect(readTool).toBeDefined();
    expect(readTool!.inputSchema.required).toContain('document');
  });
  
  test('create_document tool should have correct schema', () => {
    const tools = server.listTools();
    const createTool = tools.find(t => t.name === 'create_document');
    
    expect(createTool).toBeDefined();
    expect(createTool!.inputSchema.required).toContain('title');
  });
  
  test('read_sheet tool should have correct schema', () => {
    const tools = server.listTools();
    const readTool = tools.find(t => t.name === 'read_sheet');
    
    expect(readTool).toBeDefined();
    expect(readTool!.inputSchema.required).toContain('spreadsheet');
    expect(readTool!.inputSchema.required).toContain('range');
  });
  
  test('write_sheet tool should have correct schema', () => {
    const tools = server.listTools();
    const writeTool = tools.find(t => t.name === 'write_sheet');
    
    expect(writeTool).toBeDefined();
    expect(writeTool!.inputSchema.required).toContain('spreadsheet');
    expect(writeTool!.inputSchema.required).toContain('range');
    expect(writeTool!.inputSchema.required).toContain('values');
  });
  
  test('create_group tool should have correct schema', () => {
    const tools = server.listTools();
    const createTool = tools.find(t => t.name === 'create_group');
    
    expect(createTool).toBeDefined();
    expect(createTool!.inputSchema.required).toContain('name');
    expect(createTool!.inputSchema.required).toContain('user_ids');
  });
  
  test('callTool should return error for unknown tool', async () => {
    const context: ToolContext = {};
    const result = await server.callTool('unknown_tool', {}, context);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown tool');
  });
  
  test('send_message should require chat_id and text', async () => {
    const context: ToolContext = {};
    
    const result1 = await server.callTool('send_message', {}, context);
    expect(result1.success).toBe(false);
    expect(result1.error).toContain('chat_id');
    
    const result2 = await server.callTool('send_message', { chat_id: 'test' }, context);
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('text');
  });
  
  test('send_message should call sendMessage callback', async () => {
    const context: ToolContext = {};
    const result = await server.callTool('send_message', {
      chat_id: 'chat123',
      text: 'Hello World',
    }, context);
    
    expect(result.success).toBe(true);
    expect(mockSendMessage.calls).toHaveLength(1);
    expect(mockSendMessage.calls[0]).toEqual(['chat123', 'Hello World']);
  });
  
  test('create_group should require name and user_ids', async () => {
    const context: ToolContext = {};
    
    const result1 = await server.callTool('create_group', {}, context);
    expect(result1.success).toBe(false);
    
    const result2 = await server.callTool('create_group', { name: 'test' }, context);
    expect(result2.success).toBe(false);
  });
  
  test('create_group should parse user_ids JSON', async () => {
    const context: ToolContext = {};
    const result = await server.callTool('create_group', {
      name: 'Test Group',
      user_ids: '["ou_user1", "ou_user2"]',
    }, context);
    
    expect(result.success).toBe(true);
    expect(mockCreateChat.calls).toHaveLength(1);
    expect(mockCreateChat.calls[0]).toEqual(['Test Group', ['ou_user1', 'ou_user2']]);
  });
  
  test('write_sheet should parse values JSON', async () => {
    const context: ToolContext = {};
    const result = await server.callTool('write_sheet', {
      spreadsheet: 'sheet123',
      range: 'Sheet1!A1:B2',
      values: '[["a", "b"], ["c", "d"]]',
    }, context);
    
    expect(result.success).toBe(false);
  });
  
  test('write_sheet should reject invalid values JSON', async () => {
    const context: ToolContext = {};
    const result = await server.callTool('write_sheet', {
      spreadsheet: 'sheet123',
      range: 'Sheet1!A1:B2',
      values: 'not valid json',
    }, context);
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('解析失败');
  });
});
