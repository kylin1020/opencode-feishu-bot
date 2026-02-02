import type * as Lark from '@larksuiteoapi/node-sdk';
import type {
  DocumentInfo,
  DocumentResult,
  CreateDocumentOptions,
} from './types';
import { parseDocumentUrl } from './reader';
import { BlockReader } from './block-reader';
import { logger } from '../../utils/logger';

export class DocumentWriter {
  private client: Lark.Client;
  private defaultFolderToken?: string;

  constructor(client: Lark.Client, defaultFolderToken?: string) {
    this.client = client;
    this.defaultFolderToken = defaultFolderToken;
  }

  setDefaultFolder(folderToken: string): void {
    this.defaultFolderToken = folderToken;
  }

  async createDocument(options: CreateDocumentOptions): Promise<DocumentResult<DocumentInfo>> {
    try {
      const folderToken = options.folderToken || this.defaultFolderToken;

      const response = await this.client.docx.document.create({
        data: {
          title: options.title,
          folder_token: folderToken,
        },
      });

      if (response.code !== 0) {
        logger.error('创建文档失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '创建文档失败' };
      }

      const doc = response.data?.document;
      if (!doc?.document_id) {
        return { success: false, error: '创建文档失败：未返回文档ID' };
      }

      const documentInfo: DocumentInfo = {
        documentId: doc.document_id,
        title: doc.title || options.title,
        revisionId: doc.revision_id || 1,
        url: `https://feishu.cn/docx/${doc.document_id}`,
      };

      if (options.content) {
        const writeResult = await this.writeContent(doc.document_id, options.content);
        if (!writeResult.success) {
          logger.warn('文档创建成功，但写入内容失败', { error: writeResult.error });
        }
      }

      return { success: true, data: documentInfo };
    } catch (error) {
      logger.error('创建文档时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  async writeContent(documentId: string, content: string): Promise<DocumentResult<void>> {
    try {
      // 1. 使用 convert API 将 Markdown 转换为块结构
      const convertResponse = await this.client.docx.document.convert({
        data: {
          content_type: 'markdown',
          content,
        },
      });

      if (convertResponse.code !== 0) {
        logger.error('转换内容失败', { code: convertResponse.code, msg: convertResponse.msg });
        return { success: false, error: convertResponse.msg || '内容转换失败' };
      }

      const blocks = convertResponse.data?.blocks;
      if (!blocks || blocks.length === 0) {
        logger.debug('转换结果为空，无需写入');
        return { success: true };
      }

      // 2. 获取文档的根块（Page块）ID
      const blockReader = new BlockReader(this.client);
      const rootBlockResult = await blockReader.getRootBlock(documentId);
      
      if (!rootBlockResult.success || !rootBlockResult.data) {
        logger.error('获取文档根块失败', { error: rootBlockResult.error });
        return { success: false, error: rootBlockResult.error || '获取文档根块失败' };
      }

      const rootBlockId = rootBlockResult.data.blockId;

      // 3. 使用 documentBlockChildren.create 将转换后的块添加到文档
      // 过滤掉 page 类型的块（block_type === 1），只保留实际内容块
      const contentBlocks = blocks.filter(block => block.block_type !== 1);
      
      if (contentBlocks.length === 0) {
        logger.debug('没有可写入的内容块');
        return { success: true };
      }

      const createResponse = await this.client.docx.documentBlockChildren.create({
        path: { 
          document_id: documentId, 
          block_id: rootBlockId,
        },
        params: {
          document_revision_id: -1,
        },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          children: contentBlocks as any,
          index: 0, // 插入到开头
        },
      });

      if (createResponse.code !== 0) {
        logger.error('写入文档内容失败', { code: createResponse.code, msg: createResponse.msg });
        return { success: false, error: createResponse.msg || '写入内容失败' };
      }

      logger.debug('写入文档内容成功', { 
        documentId, 
        blocksCount: contentBlocks.length,
        newRevision: createResponse.data?.document_revision_id,
      });

      return { success: true };
    } catch (error) {
      logger.error('写入文档内容时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 追加内容到文档末尾
   * @param documentId 文档ID
   * @param content Markdown 内容
   */
  async appendContent(documentId: string, content: string): Promise<DocumentResult<void>> {
    try {
      // 1. 转换 Markdown 为块结构
      const convertResponse = await this.client.docx.document.convert({
        data: {
          content_type: 'markdown',
          content,
        },
      });

      if (convertResponse.code !== 0) {
        logger.error('转换内容失败', { code: convertResponse.code, msg: convertResponse.msg });
        return { success: false, error: convertResponse.msg || '内容转换失败' };
      }

      const blocks = convertResponse.data?.blocks;
      if (!blocks || blocks.length === 0) {
        return { success: true };
      }

      // 2. 获取文档根块
      const blockReader = new BlockReader(this.client);
      const rootBlockResult = await blockReader.getRootBlock(documentId);
      
      if (!rootBlockResult.success || !rootBlockResult.data) {
        return { success: false, error: rootBlockResult.error || '获取文档根块失败' };
      }

      const rootBlockId = rootBlockResult.data.blockId;
      const contentBlocks = blocks.filter(block => block.block_type !== 1);
      
      if (contentBlocks.length === 0) {
        return { success: true };
      }

      // 3. 追加到文档末尾（不指定 index）
      const createResponse = await this.client.docx.documentBlockChildren.create({
        path: { 
          document_id: documentId, 
          block_id: rootBlockId,
        },
        params: {
          document_revision_id: -1,
        },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          children: contentBlocks as any,
          // 不指定 index，默认追加到末尾
        },
      });

      if (createResponse.code !== 0) {
        logger.error('追加文档内容失败', { code: createResponse.code, msg: createResponse.msg });
        return { success: false, error: createResponse.msg || '追加内容失败' };
      }

      return { success: true };
    } catch (error) {
      logger.error('追加文档内容时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 清空文档内容
   * @param documentId 文档ID
   */
  async clearContent(documentId: string): Promise<DocumentResult<void>> {
    try {
      const blockReader = new BlockReader(this.client);
      
      // 获取文档所有块
      const blocksResult = await blockReader.getBlocks(documentId);
      if (!blocksResult.success || !blocksResult.data) {
        return { success: false, error: blocksResult.error || '获取文档块失败' };
      }

      const blocks = blocksResult.data;
      if (blocks.length <= 1) {
        // 只有根块，无需清空
        return { success: true };
      }

      // 获取根块
      const rootBlock = blocks.find(b => b.blockType === 1);
      if (!rootBlock) {
        return { success: false, error: '找不到文档根块' };
      }

      const childCount = rootBlock.children?.length || 0;
      if (childCount === 0) {
        return { success: true };
      }

      // 删除所有子块
      const deleteResponse = await this.client.docx.documentBlockChildren.batchDelete({
        path: { 
          document_id: documentId, 
          block_id: rootBlock.blockId,
        },
        params: {
          document_revision_id: -1,
        },
        data: {
          start_index: 0,
          end_index: childCount,
        },
      });

      if (deleteResponse.code !== 0) {
        logger.error('清空文档内容失败', { code: deleteResponse.code, msg: deleteResponse.msg });
        return { success: false, error: deleteResponse.msg || '清空内容失败' };
      }

      return { success: true };
    } catch (error) {
      logger.error('清空文档内容时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 替换文档内容（先清空再写入）
   * @param documentId 文档ID
   * @param content Markdown 内容
   */
  async replaceContent(documentId: string, content: string): Promise<DocumentResult<void>> {
    // 先清空
    const clearResult = await this.clearContent(documentId);
    if (!clearResult.success) {
      return clearResult;
    }

    // 再写入
    return this.writeContent(documentId, content);
  }

  async createFolder(name: string, parentFolderToken?: string): Promise<DocumentResult<{ folderToken: string }>> {
    try {
      const folderToken = parentFolderToken || this.defaultFolderToken;
      if (!folderToken) {
        return { success: false, error: '未指定父文件夹' };
      }

      const response = await this.client.drive.file.createFolder({
        data: {
          name,
          folder_token: folderToken,
        },
      });

      if (response.code !== 0) {
        logger.error('创建文件夹失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '创建文件夹失败' };
      }

      return {
        success: true,
        data: { folderToken: response.data?.token || '' },
      };
    } catch (error) {
      logger.error('创建文件夹时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  async writeToDocument(urlOrToken: string, content: string): Promise<DocumentResult<void>> {
    const parsed = parseDocumentUrl(urlOrToken);
    
    if (parsed.type !== 'docx' && parsed.type !== 'doc') {
      return { success: false, error: `不支持写入此类型文档: ${parsed.type}` };
    }

    return this.writeContent(parsed.token, content);
  }
}
