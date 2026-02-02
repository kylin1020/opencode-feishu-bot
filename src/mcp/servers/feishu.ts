import type * as Lark from '@larksuiteoapi/node-sdk';
import type {
  IMcpServer,
  ToolDefinition,
  ToolResult,
  ToolContext,
} from '../../types/mcp';
import { DocumentReader, DocumentWriter } from '../../feishu/docs';
import { SheetReader, SheetWriter } from '../../feishu/sheets';
import type { CellValue } from '../../feishu/sheets';
import type { FeishuApiClient } from '../../feishu/api';
import { logger } from '../../utils/logger';

export interface FeishuMcpServerConfig {
  larkClient: Lark.Client;
  apiClient: FeishuApiClient;
  defaultFolderToken?: string;
  sendMessage?: (chatId: string, text: string) => Promise<string | null>;
  createChat?: (name: string, userIds: string[]) => Promise<string | null>;
}

export class FeishuMcpServer implements IMcpServer {
  readonly name = 'feishu';
  readonly version = '1.0.0';

  private config: FeishuMcpServerConfig;
  private documentReader: DocumentReader;
  private documentWriter: DocumentWriter;
  private sheetReader: SheetReader;
  private sheetWriter: SheetWriter;

  private tools: ToolDefinition[] = [
    {
      name: 'send_message',
      description: '向飞书用户或群聊发送文本消息',
      inputSchema: {
        type: 'object',
        properties: {
          chat_id: {
            type: 'string',
            description: '目标聊天 ID (群聊或用户)',
          },
          text: {
            type: 'string',
            description: '要发送的文本内容',
          },
        },
        required: ['chat_id', 'text'],
      },
    },
    {
      name: 'read_document',
      description: '读取飞书文档内容，支持 URL 或文档 token',
      inputSchema: {
        type: 'object',
        properties: {
          document: {
            type: 'string',
            description: '文档 URL 或 token (支持 docx/docs/wiki)',
          },
        },
        required: ['document'],
      },
    },
    {
      name: 'create_document',
      description: '创建新的飞书文档',
      inputSchema: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: '文档标题',
          },
          content: {
            type: 'string',
            description: '文档内容 (Markdown 格式，可选)',
          },
          folder_token: {
            type: 'string',
            description: '目标文件夹 token (可选，使用默认文件夹)',
          },
        },
        required: ['title'],
      },
    },
    {
      name: 'read_sheet',
      description: '读取飞书电子表格数据',
      inputSchema: {
        type: 'object',
        properties: {
          spreadsheet: {
            type: 'string',
            description: '表格 URL 或 token',
          },
          range: {
            type: 'string',
            description: '读取范围 (如 "Sheet1!A1:D10")',
          },
        },
        required: ['spreadsheet', 'range'],
      },
    },
    {
      name: 'write_sheet',
      description: '向飞书电子表格写入数据',
      inputSchema: {
        type: 'object',
        properties: {
          spreadsheet: {
            type: 'string',
            description: '表格 URL 或 token',
          },
          range: {
            type: 'string',
            description: '写入范围 (如 "Sheet1!A1:D10")',
          },
          values: {
            type: 'string',
            description: 'JSON 格式的二维数组数据 (如 "[[\\"a\\",\\"b\\"],[\\"c\\",\\"d\\"]]")',
          },
          append: {
            type: 'string',
            description: '是否追加模式 ("true"/"false"，默认 "false")',
          },
        },
        required: ['spreadsheet', 'range', 'values'],
      },
    },
    {
      name: 'create_group',
      description: '创建飞书群聊',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '群聊名称',
          },
          user_ids: {
            type: 'string',
            description: 'JSON 格式的用户 ID 数组 (如 "[\\"ou_xxx\\",\\"ou_yyy\\"]")',
          },
        },
        required: ['name', 'user_ids'],
      },
    },
  ];

  constructor(config: FeishuMcpServerConfig) {
    this.config = config;
    this.documentReader = new DocumentReader(config.apiClient);
    this.documentWriter = new DocumentWriter(config.larkClient, config.defaultFolderToken);
    this.sheetReader = new SheetReader(config.larkClient);
    this.sheetWriter = new SheetWriter(config.larkClient, config.defaultFolderToken);
  }

  listTools(): ToolDefinition[] {
    return this.tools;
  }

  async callTool(name: string, input: unknown, context: ToolContext): Promise<ToolResult> {
    const params = input as Record<string, unknown>;
    
    logger.debug('Feishu MCP tool called', { tool: name, context });

    try {
      switch (name) {
        case 'send_message':
          return this.handleSendMessage(params);
        case 'read_document':
          return this.handleReadDocument(params);
        case 'create_document':
          return this.handleCreateDocument(params);
        case 'read_sheet':
          return this.handleReadSheet(params);
        case 'write_sheet':
          return this.handleWriteSheet(params);
        case 'create_group':
          return this.handleCreateGroup(params);
        default:
          return { success: false, error: `Unknown tool: ${name}` };
      }
    } catch (error) {
      logger.error('Feishu MCP tool error', { tool: name, error });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleSendMessage(params: Record<string, unknown>): Promise<ToolResult> {
    const chatId = params.chat_id as string;
    const text = params.text as string;

    if (!chatId || !text) {
      return { success: false, error: '缺少必要参数: chat_id 和 text' };
    }

    if (!this.config.sendMessage) {
      return { success: false, error: '发送消息功能未配置' };
    }

    const messageId = await this.config.sendMessage(chatId, text);
    
    if (messageId) {
      return {
        success: true,
        output: { message_id: messageId, chat_id: chatId },
      };
    }

    return { success: false, error: '发送消息失败' };
  }

  private async handleReadDocument(params: Record<string, unknown>): Promise<ToolResult> {
    const document = params.document as string;

    if (!document) {
      return { success: false, error: '缺少必要参数: document' };
    }

    const result = await this.documentReader.readDocument(document);

    if (result.success && result.data) {
      return {
        success: true,
        output: {
          document_id: result.data.documentId,
          title: result.data.title,
          content: result.data.content,
        },
      };
    }

    return { success: false, error: result.error || '读取文档失败' };
  }

  private async handleCreateDocument(params: Record<string, unknown>): Promise<ToolResult> {
    const title = params.title as string;
    const content = params.content as string | undefined;
    const folderToken = params.folder_token as string | undefined;

    if (!title) {
      return { success: false, error: '缺少必要参数: title' };
    }

    const result = await this.documentWriter.createDocument({
      title,
      content,
      folderToken,
    });

    if (result.success && result.data) {
      return {
        success: true,
        output: {
          document_id: result.data.documentId,
          title: result.data.title,
          url: result.data.url,
        },
      };
    }

    return { success: false, error: result.error || '创建文档失败' };
  }

  private async handleReadSheet(params: Record<string, unknown>): Promise<ToolResult> {
    const spreadsheet = params.spreadsheet as string;
    const range = params.range as string;

    if (!spreadsheet || !range) {
      return { success: false, error: '缺少必要参数: spreadsheet 和 range' };
    }

    const result = await this.sheetReader.readRange(spreadsheet, range);

    if (result.success && result.data) {
      return {
        success: true,
        output: {
          range,
          values: result.data,
          row_count: result.data.length,
          column_count: result.data[0]?.length || 0,
        },
      };
    }

    return { success: false, error: result.error || '读取表格失败' };
  }

  private async handleWriteSheet(params: Record<string, unknown>): Promise<ToolResult> {
    const spreadsheet = params.spreadsheet as string;
    const range = params.range as string;
    const valuesStr = params.values as string;
    const appendStr = params.append as string | undefined;

    if (!spreadsheet || !range || !valuesStr) {
      return { success: false, error: '缺少必要参数: spreadsheet, range 和 values' };
    }

    let values: CellValue[][];
    try {
      const parsed = JSON.parse(valuesStr);
      if (!Array.isArray(parsed) || !parsed.every(row => Array.isArray(row))) {
        throw new Error('values 必须是二维数组');
      }
      values = parsed as CellValue[][];
    } catch (parseError) {
      return { 
        success: false, 
        error: `values 参数解析失败: ${parseError instanceof Error ? parseError.message : String(parseError)}` 
      };
    }

    const isAppend = appendStr === 'true';

    let result;
    if (isAppend) {
      result = await this.sheetWriter.appendData(spreadsheet, range, values);
    } else {
      result = await this.sheetWriter.writeRange(spreadsheet, range, values);
    }

    if (result.success) {
      return {
        success: true,
        output: {
          updated_range: result.data?.updatedRange || range,
          updated_rows: result.data?.updatedRows || values.length,
          updated_cells: result.data?.updatedCells || 0,
          mode: isAppend ? 'append' : 'write',
        },
      };
    }

    return { success: false, error: result.error || '写入表格失败' };
  }

  private async handleCreateGroup(params: Record<string, unknown>): Promise<ToolResult> {
    const name = params.name as string;
    const userIdsStr = params.user_ids as string;

    if (!name || !userIdsStr) {
      return { success: false, error: '缺少必要参数: name 和 user_ids' };
    }

    let userIds: string[];
    try {
      userIds = JSON.parse(userIdsStr);
      if (!Array.isArray(userIds) || !userIds.every(id => typeof id === 'string')) {
        throw new Error('user_ids 必须是字符串数组');
      }
    } catch (parseError) {
      return { 
        success: false, 
        error: `user_ids 参数解析失败: ${parseError instanceof Error ? parseError.message : String(parseError)}` 
      };
    }

    if (!this.config.createChat) {
      return { success: false, error: '创建群聊功能未配置' };
    }

    const chatId = await this.config.createChat(name, userIds);

    if (chatId) {
      return {
        success: true,
        output: { chat_id: chatId, name, members: userIds },
      };
    }

    return { success: false, error: '创建群聊失败' };
  }
}

export function createFeishuMcpServer(config: FeishuMcpServerConfig): FeishuMcpServer {
  return new FeishuMcpServer(config);
}
