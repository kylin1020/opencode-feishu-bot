import type * as Lark from '@larksuiteoapi/node-sdk';
import type {
  DocumentInfo,
  DocumentResult,
  CreateDocumentOptions,
} from './types';
import { parseDocumentUrl } from './reader';
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

      const createResponse = await this.client.docx.documentBlock.batchUpdate({
        path: { document_id: documentId },
        data: {
          requests: blocks.map((block) => ({
            block_id: block.block_id,
            update_text_elements: block.page?.elements ? { elements: block.page.elements } : undefined,
          })).filter(req => req.update_text_elements),
        },
      });

      if (createResponse.code !== 0) {
        logger.error('写入文档内容失败', { code: createResponse.code, msg: createResponse.msg });
        return { success: false, error: createResponse.msg || '写入内容失败' };
      }

      return { success: true };
    } catch (error) {
      logger.error('写入文档内容时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
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
