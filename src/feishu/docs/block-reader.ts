/**
 * 飞书文档块读取器
 * 
 * 提供文档块的读取、遍历功能
 */
import type * as Lark from '@larksuiteoapi/node-sdk';
import type { DocumentBlock, DocumentResult, TextElement } from './types';
import { BLOCK_TYPE, BLOCK_TYPE_NAME, getBlockTypeName } from './block-types';
import { logger } from '../../utils/logger';

/** 获取块列表选项 */
export interface GetBlocksOptions {
  /** 文档版本号，-1 表示最新版本 */
  documentRevisionId?: number;
  /** 每页数量 */
  pageSize?: number;
  /** 用户ID类型 */
  userIdType?: 'user_id' | 'union_id' | 'open_id';
}

/** 获取子块选项 */
export interface GetChildrenOptions extends GetBlocksOptions {
  /** 是否包含后代块 */
  withDescendants?: boolean;
}

/**
 * 文档块读取器
 */
export class BlockReader {
  private client: Lark.Client;

  constructor(client: Lark.Client) {
    this.client = client;
  }

  /**
   * 获取文档所有块
   * @param documentId 文档ID
   * @param options 选项
   */
  async getBlocks(documentId: string, options?: GetBlocksOptions): Promise<DocumentResult<DocumentBlock[]>> {
    try {
      const blocks: DocumentBlock[] = [];
      let pageToken: string | undefined;
      
      do {
        const response = await this.client.docx.documentBlock.list({
          path: { document_id: documentId },
          params: {
            document_revision_id: options?.documentRevisionId ?? -1,
            page_size: options?.pageSize ?? 500,
            page_token: pageToken,
            user_id_type: options?.userIdType ?? 'open_id',
          },
        });

        if (response.code !== 0) {
          logger.error('获取文档块列表失败', { code: response.code, msg: response.msg });
          return { success: false, error: response.msg || '获取文档块列表失败' };
        }

        const items = response.data?.items;
        if (items) {
          for (const item of items) {
            blocks.push(this.transformBlock(item));
          }
        }

        pageToken = response.data?.page_token;
      } while (pageToken);

      return { success: true, data: blocks };
    } catch (error) {
      logger.error('获取文档块列表时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 获取单个块
   * @param documentId 文档ID
   * @param blockId 块ID
   * @param options 选项
   */
  async getBlock(documentId: string, blockId: string, options?: GetBlocksOptions): Promise<DocumentResult<DocumentBlock>> {
    try {
      const response = await this.client.docx.documentBlock.get({
        path: { document_id: documentId, block_id: blockId },
        params: {
          document_revision_id: options?.documentRevisionId ?? -1,
          user_id_type: options?.userIdType ?? 'open_id',
        },
      });

      if (response.code !== 0) {
        logger.error('获取文档块失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '获取文档块失败' };
      }

      const block = response.data?.block;
      if (!block) {
        return { success: false, error: '块不存在' };
      }

      return { success: true, data: this.transformBlock(block) };
    } catch (error) {
      logger.error('获取文档块时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 获取块的子块
   * @param documentId 文档ID
   * @param blockId 块ID
   * @param options 选项
   */
  async getChildren(documentId: string, blockId: string, options?: GetChildrenOptions): Promise<DocumentResult<DocumentBlock[]>> {
    try {
      const blocks: DocumentBlock[] = [];
      let pageToken: string | undefined;

      do {
        const response = await this.client.docx.documentBlockChildren.get({
          path: { document_id: documentId, block_id: blockId },
          params: {
            document_revision_id: options?.documentRevisionId ?? -1,
            page_size: options?.pageSize ?? 500,
            page_token: pageToken,
            user_id_type: options?.userIdType ?? 'open_id',
          },
        });

        if (response.code !== 0) {
          logger.error('获取子块列表失败', { code: response.code, msg: response.msg });
          return { success: false, error: response.msg || '获取子块列表失败' };
        }

        const items = response.data?.items;
        if (items) {
          for (const item of items) {
            blocks.push(this.transformBlock(item));
          }
        }

        pageToken = response.data?.page_token;
      } while (pageToken);

      return { success: true, data: blocks };
    } catch (error) {
      logger.error('获取子块列表时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 获取文档根块（Page块）
   * @param documentId 文档ID
   */
  async getRootBlock(documentId: string): Promise<DocumentResult<DocumentBlock>> {
    const result = await this.getBlocks(documentId, { pageSize: 1 });
    if (!result.success || !result.data?.[0]) {
      return { success: false, error: result.error || '无法获取根块' };
    }
    return { success: true, data: result.data[0] };
  }

  /**
   * 使用迭代器获取所有块（适合大文档）
   * @param documentId 文档ID
   * @param options 选项
   */
  async *iterateBlocks(documentId: string, options?: GetBlocksOptions): AsyncGenerator<DocumentBlock> {
    let pageToken: string | undefined;

    do {
      const response = await this.client.docx.documentBlock.list({
        path: { document_id: documentId },
        params: {
          document_revision_id: options?.documentRevisionId ?? -1,
          page_size: options?.pageSize ?? 100,
          page_token: pageToken,
          user_id_type: options?.userIdType ?? 'open_id',
        },
      });

      if (response.code !== 0) {
        throw new Error(response.msg || '获取文档块列表失败');
      }

      const items = response.data?.items;
      if (items) {
        for (const item of items) {
          yield this.transformBlock(item);
        }
      }

      pageToken = response.data?.page_token;
    } while (pageToken);
  }

  /**
   * 从块中提取纯文本内容
   * @param block 文档块
   */
  extractText(block: DocumentBlock): string {
    const typeName = getBlockTypeName(block.blockType) as keyof DocumentBlock;
    const content = block[typeName] as { elements?: TextElement[] } | undefined;
    
    if (!content?.elements) {
      return '';
    }

    return content.elements
      .map(el => el.textRun?.content || '')
      .join('');
  }

  /**
   * 从块列表中提取所有文本内容
   * @param blocks 文档块列表
   */
  extractAllText(blocks: DocumentBlock[]): string {
    return blocks
      .map(block => this.extractText(block))
      .filter(text => text.length > 0)
      .join('\n');
  }

  /**
   * 按类型过滤块
   * @param blocks 文档块列表
   * @param blockType 块类型
   */
  filterByType(blocks: DocumentBlock[], blockType: number): DocumentBlock[] {
    return blocks.filter(block => block.blockType === blockType);
  }

  /**
   * 获取所有标题块
   * @param blocks 文档块列表
   */
  getHeadings(blocks: DocumentBlock[]): DocumentBlock[] {
    return blocks.filter(block => 
      block.blockType >= BLOCK_TYPE.HEADING1 && 
      block.blockType <= BLOCK_TYPE.HEADING9
    );
  }

  /**
   * 构建文档目录结构
   * @param blocks 文档块列表
   */
  buildTableOfContents(blocks: DocumentBlock[]): Array<{ level: number; title: string; blockId: string }> {
    const headings = this.getHeadings(blocks);
    return headings.map(block => ({
      level: block.blockType - BLOCK_TYPE.HEADING1 + 1,
      title: this.extractText(block),
      blockId: block.blockId,
    }));
  }

  /**
   * 转换 SDK 返回的块数据为统一格式
   */
  private transformBlock(rawBlock: Record<string, unknown>): DocumentBlock {
    const blockType = rawBlock.block_type as number;
    const blockId = rawBlock.block_id as string;
    const parentId = rawBlock.parent_id as string | undefined;
    const children = rawBlock.children as string[] | undefined;

    const block: DocumentBlock = {
      blockId,
      blockType,
      parentId,
      children,
    };

    // 根据块类型提取内容
    const typeName = BLOCK_TYPE_NAME[blockType] as keyof DocumentBlock | undefined;
    if (typeName && rawBlock[typeName]) {
      const content = rawBlock[typeName] as Record<string, unknown>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (block as any)[typeName] = this.transformBlockContent(content);
    }

    return block;
  }

  /**
   * 转换块内容（处理下划线命名到驼峰命名）
   */
  private transformBlockContent(content: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(content)) {
      const camelKey = this.toCamelCase(key);
      
      if (Array.isArray(value)) {
        result[camelKey] = value.map(item => 
          typeof item === 'object' && item !== null 
            ? this.transformBlockContent(item as Record<string, unknown>)
            : item
        );
      } else if (typeof value === 'object' && value !== null) {
        result[camelKey] = this.transformBlockContent(value as Record<string, unknown>);
      } else {
        result[camelKey] = value;
      }
    }

    return result;
  }

  /**
   * 下划线命名转驼峰命名
   */
  private toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }
}
