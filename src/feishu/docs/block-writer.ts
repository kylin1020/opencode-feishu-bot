/**
 * 飞书文档块写入器
 * 
 * 提供文档块的创建、更新、删除功能
 */
import type * as Lark from '@larksuiteoapi/node-sdk';
import type { 
  DocumentResult, 
  CreateBlockData, 
  UpdateBlockRequest,
  TextElement,
  BlockStyle,
  TableProperty,
  ImageProperty,
  CalloutProperty,
  IframeProperty,
} from './types';
import { BLOCK_TYPE, CODE_LANGUAGE, BLOCK_TYPE_NAME } from './block-types';
import { logger } from '../../utils/logger';

/** 创建块选项 */
export interface CreateBlockOptions {
  /** 文档版本号，-1 表示最新版本 */
  documentRevisionId?: number;
  /** 幂等性 token */
  clientToken?: string;
  /** 用户ID类型 */
  userIdType?: 'user_id' | 'union_id' | 'open_id';
}

/** 创建块结果 */
export interface CreateBlockResult {
  /** 创建的块ID列表 */
  blockIds: string[];
  /** 文档新版本号 */
  documentRevisionId: number;
}

/** 更新块结果 */
export interface UpdateBlockResult {
  /** 文档新版本号 */
  documentRevisionId: number;
}

/** 删除块结果 */
export interface DeleteBlockResult {
  /** 文档新版本号 */
  documentRevisionId: number;
}

/**
 * 文档块写入器
 */
export class BlockWriter {
  private client: Lark.Client;

  constructor(client: Lark.Client) {
    this.client = client;
  }

  /**
   * 在指定位置创建子块
   * @param documentId 文档ID
   * @param parentBlockId 父块ID
   * @param blocks 要创建的块数据
   * @param index 插入位置（默认末尾）
   * @param options 选项
   */
  async createChildren(
    documentId: string,
    parentBlockId: string,
    blocks: CreateBlockData[],
    index?: number,
    options?: CreateBlockOptions
  ): Promise<DocumentResult<CreateBlockResult>> {
    try {
      const children = blocks.map(block => this.transformToApiFormat(block));
      
      const response = await this.client.docx.documentBlockChildren.create({
        path: { document_id: documentId, block_id: parentBlockId },
        params: {
          document_revision_id: options?.documentRevisionId ?? -1,
          client_token: options?.clientToken,
          user_id_type: options?.userIdType ?? 'open_id',
        },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          children: children as any,
          index,
        },
      });

      if (response.code !== 0) {
        logger.error('创建子块失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '创建子块失败' };
      }

      const createdBlockIds = response.data?.children?.map(c => c.block_id).filter(Boolean) as string[] || [];
      
      return {
        success: true,
        data: {
          blockIds: createdBlockIds,
          documentRevisionId: response.data?.document_revision_id ?? 0,
        },
      };
    } catch (error) {
      logger.error('创建子块时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 更新单个块
   * @param documentId 文档ID
   * @param blockId 块ID
   * @param update 更新内容
   * @param options 选项
   */
  async updateBlock(
    documentId: string,
    blockId: string,
    update: Omit<UpdateBlockRequest, 'blockId'>,
    options?: CreateBlockOptions
  ): Promise<DocumentResult<UpdateBlockResult>> {
    try {
      const updateData = this.transformUpdateRequest(update);
      
      const response = await this.client.docx.documentBlock.patch({
        path: { document_id: documentId, block_id: blockId },
        params: {
          document_revision_id: options?.documentRevisionId ?? -1,
          client_token: options?.clientToken,
          user_id_type: options?.userIdType ?? 'open_id',
        },
        data: updateData,
      });

      if (response.code !== 0) {
        logger.error('更新块失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '更新块失败' };
      }

      return {
        success: true,
        data: {
          documentRevisionId: response.data?.document_revision_id ?? 0,
        },
      };
    } catch (error) {
      logger.error('更新块时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 批量更新块
   * @param documentId 文档ID
   * @param updates 更新请求列表
   * @param options 选项
   */
  async batchUpdateBlocks(
    documentId: string,
    updates: UpdateBlockRequest[],
    options?: CreateBlockOptions
  ): Promise<DocumentResult<UpdateBlockResult>> {
    try {
      const requests = updates.map(update => ({
        block_id: update.blockId,
        ...this.transformUpdateRequest(update),
      }));

      const response = await this.client.docx.documentBlock.batchUpdate({
        path: { document_id: documentId },
        params: {
          document_revision_id: options?.documentRevisionId ?? -1,
          client_token: options?.clientToken,
          user_id_type: options?.userIdType ?? 'open_id',
        },
        data: { requests },
      });

      if (response.code !== 0) {
        logger.error('批量更新块失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '批量更新块失败' };
      }

      return {
        success: true,
        data: {
          documentRevisionId: response.data?.document_revision_id ?? 0,
        },
      };
    } catch (error) {
      logger.error('批量更新块时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 删除子块
   * @param documentId 文档ID
   * @param parentBlockId 父块ID
   * @param startIndex 起始索引
   * @param endIndex 结束索引
   * @param options 选项
   */
  async deleteChildren(
    documentId: string,
    parentBlockId: string,
    startIndex: number,
    endIndex: number,
    options?: CreateBlockOptions
  ): Promise<DocumentResult<DeleteBlockResult>> {
    try {
      const response = await this.client.docx.documentBlockChildren.batchDelete({
        path: { document_id: documentId, block_id: parentBlockId },
        params: {
          document_revision_id: options?.documentRevisionId ?? -1,
          client_token: options?.clientToken,
        },
        data: {
          start_index: startIndex,
          end_index: endIndex,
        },
      });

      if (response.code !== 0) {
        logger.error('删除子块失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '删除子块失败' };
      }

      return {
        success: true,
        data: {
          documentRevisionId: response.data?.document_revision_id ?? 0,
        },
      };
    } catch (error) {
      logger.error('删除子块时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  // ============ 便捷方法 ============

  /**
   * 创建文本块
   */
  createTextBlock(text: string, style?: BlockStyle): CreateBlockData {
    return {
      blockType: BLOCK_TYPE.TEXT,
      text: {
        elements: [{ textRun: { content: text } }],
        style,
      },
    };
  }

  /**
   * 创建标题块
   */
  createHeadingBlock(text: string, level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 1): CreateBlockData {
    const blockType = BLOCK_TYPE.HEADING1 + level - 1;
    const key = `heading${level}` as keyof CreateBlockData;
    return {
      blockType,
      [key]: {
        elements: [{ textRun: { content: text } }],
      },
    } as CreateBlockData;
  }

  /**
   * 创建代码块
   */
  createCodeBlock(code: string, language: number = CODE_LANGUAGE.PLAIN_TEXT, wrap: boolean = true): CreateBlockData {
    return {
      blockType: BLOCK_TYPE.CODE,
      code: {
        elements: [{ textRun: { content: code } }],
        style: { language, wrap },
      },
    };
  }

  /**
   * 创建引用块
   */
  createQuoteBlock(text: string): CreateBlockData {
    return {
      blockType: BLOCK_TYPE.QUOTE,
      quote: {
        elements: [{ textRun: { content: text } }],
      },
    };
  }

  /**
   * 创建无序列表项
   */
  createBulletBlock(text: string): CreateBlockData {
    return {
      blockType: BLOCK_TYPE.BULLET,
      bullet: {
        elements: [{ textRun: { content: text } }],
      },
    };
  }

  /**
   * 创建有序列表项
   */
  createOrderedBlock(text: string, sequence?: string): CreateBlockData {
    return {
      blockType: BLOCK_TYPE.ORDERED,
      ordered: {
        elements: [{ textRun: { content: text } }],
        style: sequence ? { sequence } : undefined,
      },
    };
  }

  /**
   * 创建待办事项
   */
  createTodoBlock(text: string, done: boolean = false): CreateBlockData {
    return {
      blockType: BLOCK_TYPE.TODO,
      todo: {
        elements: [{ textRun: { content: text } }],
        style: { done },
      },
    };
  }

  /**
   * 创建分割线
   */
  createDividerBlock(): CreateBlockData {
    return {
      blockType: BLOCK_TYPE.DIVIDER,
      divider: {},
    };
  }

  /**
   * 创建表格
   */
  createTableBlock(rows: number, columns: number, headerRow: boolean = true): CreateBlockData {
    return {
      blockType: BLOCK_TYPE.TABLE,
      table: {
        property: {
          rowSize: rows,
          columnSize: columns,
          headerRow,
        },
      },
    };
  }

  /**
   * 创建高亮块
   */
  createCalloutBlock(emojiId?: string, backgroundColor?: number): CreateBlockData {
    return {
      blockType: BLOCK_TYPE.CALLOUT,
      callout: {
        emojiId,
        backgroundColor,
      },
    };
  }

  /**
   * 创建内嵌网页块
   */
  createIframeBlock(url: string, iframeType: number = 1): CreateBlockData {
    return {
      blockType: BLOCK_TYPE.IFRAME,
      iframe: {
        component: { url, iframeType },
      },
    };
  }

  /**
   * 创建图片块（需要先上传图片获取token）
   */
  createImageBlock(align?: number, caption?: string, scale?: number): CreateBlockData {
    return {
      blockType: BLOCK_TYPE.IMAGE,
      image: {
        align,
        caption: caption ? { content: caption } : undefined,
        scale,
      },
    };
  }

  /**
   * 创建带样式的文本元素
   */
  createStyledTextElement(
    content: string,
    style?: {
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      strikethrough?: boolean;
      inlineCode?: boolean;
      link?: string;
    }
  ): TextElement {
    return {
      textRun: {
        content,
        style: style ? {
          bold: style.bold,
          italic: style.italic,
          underline: style.underline,
          strikethrough: style.strikethrough,
          inlineCode: style.inlineCode,
          link: style.link ? { url: style.link } : undefined,
        } : undefined,
      },
    };
  }

  /**
   * 创建富文本块（支持多个样式元素）
   */
  createRichTextBlock(elements: TextElement[]): CreateBlockData {
    return {
      blockType: BLOCK_TYPE.TEXT,
      text: { elements },
    };
  }

  // ============ 内部方法 ============

  /**
   * 转换创建块数据为 API 格式
   */
  private transformToApiFormat(block: CreateBlockData): Record<string, unknown> {
    const result: Record<string, unknown> = {
      block_type: block.blockType,
    };

    // 获取块类型名称
    const typeName = BLOCK_TYPE_NAME[block.blockType];
    if (typeName) {
      const content = (block as unknown as Record<string, unknown>)[typeName];
      if (content) {
        result[typeName] = this.toSnakeCase(content as Record<string, unknown>);
      }
    }

    return result;
  }

  /**
   * 转换更新请求为 API 格式
   */
  private transformUpdateRequest(update: Omit<UpdateBlockRequest, 'blockId'>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    if (update.updateTextElements) {
      result.update_text_elements = this.toSnakeCase(update.updateTextElements as unknown as Record<string, unknown>);
    }
    if (update.updateTextStyle) {
      result.update_text_style = this.toSnakeCase(update.updateTextStyle as unknown as Record<string, unknown>);
    }
    if (update.updateTableProperty) {
      result.update_table_property = this.toSnakeCase(update.updateTableProperty as unknown as Record<string, unknown>);
    }
    if (update.insertTableRow) {
      result.insert_table_row = this.toSnakeCase(update.insertTableRow as unknown as Record<string, unknown>);
    }
    if (update.insertTableColumn) {
      result.insert_table_column = this.toSnakeCase(update.insertTableColumn as unknown as Record<string, unknown>);
    }
    if (update.deleteTableRows) {
      result.delete_table_rows = this.toSnakeCase(update.deleteTableRows as unknown as Record<string, unknown>);
    }
    if (update.deleteTableColumns) {
      result.delete_table_columns = this.toSnakeCase(update.deleteTableColumns as unknown as Record<string, unknown>);
    }
    if (update.mergeTableCells) {
      result.merge_table_cells = this.toSnakeCase(update.mergeTableCells as unknown as Record<string, unknown>);
    }
    if (update.unmergeTableCells) {
      result.unmerge_table_cells = this.toSnakeCase(update.unmergeTableCells as unknown as Record<string, unknown>);
    }
    if (update.replaceImage) {
      result.replace_image = this.toSnakeCase(update.replaceImage as unknown as Record<string, unknown>);
    }

    return result;
  }

  /**
   * 将对象的键名从驼峰转为下划线
   */
  private toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      
      if (Array.isArray(value)) {
        result[snakeKey] = value.map(item =>
          typeof item === 'object' && item !== null
            ? this.toSnakeCase(item as Record<string, unknown>)
            : item
        );
      } else if (typeof value === 'object' && value !== null) {
        result[snakeKey] = this.toSnakeCase(value as Record<string, unknown>);
      } else {
        result[snakeKey] = value;
      }
    }

    return result;
  }
}
