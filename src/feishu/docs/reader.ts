import type * as Lark from '@larksuiteoapi/node-sdk';
import type {
  DocumentInfo,
  DocumentContent,
  DocumentResult,
  ParsedDocumentUrl,
} from './types';
import { logger } from '../../utils/logger';

const FEISHU_URL_PATTERNS = [
  /feishu\.cn\/docx\/([a-zA-Z0-9]+)/,
  /feishu\.cn\/docs\/([a-zA-Z0-9]+)/,
  /feishu\.cn\/wiki\/([a-zA-Z0-9]+)/,
  /feishu\.cn\/sheets\/([a-zA-Z0-9]+)/,
  /larksuite\.com\/docx\/([a-zA-Z0-9]+)/,
  /larksuite\.com\/docs\/([a-zA-Z0-9]+)/,
];

export function parseDocumentUrl(urlOrToken: string): ParsedDocumentUrl {
  if (!urlOrToken.includes('/')) {
    return { type: 'docx', token: urlOrToken, url: '' };
  }

  for (const pattern of FEISHU_URL_PATTERNS) {
    const match = urlOrToken.match(pattern);
    if (match?.[1]) {
      let type: ParsedDocumentUrl['type'] = 'unknown';
      if (urlOrToken.includes('/docx/')) type = 'docx';
      else if (urlOrToken.includes('/docs/')) type = 'doc';
      else if (urlOrToken.includes('/wiki/')) type = 'wiki';
      else if (urlOrToken.includes('/sheets/')) type = 'sheet';

      return { type, token: match[1], url: urlOrToken };
    }
  }

  return { type: 'unknown', token: urlOrToken, url: urlOrToken };
}

export class DocumentReader {
  private client: Lark.Client;

  constructor(client: Lark.Client) {
    this.client = client;
  }

  async getDocumentInfo(documentId: string): Promise<DocumentResult<DocumentInfo>> {
    try {
      const response = await this.client.docx.document.get({
        path: { document_id: documentId },
      });

      if (response.code !== 0) {
        logger.error('获取文档信息失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '获取文档信息失败' };
      }

      const doc = response.data?.document;
      if (!doc) {
        return { success: false, error: '文档不存在' };
      }

      return {
        success: true,
        data: {
          documentId: doc.document_id || documentId,
          title: doc.title || '',
          revisionId: doc.revision_id || 0,
          url: `https://feishu.cn/docx/${doc.document_id}`,
        },
      };
    } catch (error) {
      logger.error('获取文档信息时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  async getDocumentContent(documentId: string): Promise<DocumentResult<DocumentContent>> {
    try {
      const response = await this.client.docx.document.rawContent({
        path: { document_id: documentId },
        params: { lang: 0 },
      });

      if (response.code !== 0) {
        logger.error('获取文档内容失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '获取文档内容失败' };
      }

      const infoResult = await this.getDocumentInfo(documentId);

      return {
        success: true,
        data: {
          documentId,
          content: response.data?.content || '',
          title: infoResult.data?.title,
        },
      };
    } catch (error) {
      logger.error('获取文档内容时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  async readDocument(urlOrToken: string): Promise<DocumentResult<DocumentContent>> {
    const parsed = parseDocumentUrl(urlOrToken);
    
    if (parsed.type === 'unknown' || parsed.type === 'sheet') {
      return { success: false, error: `不支持的文档类型: ${parsed.type}` };
    }

    return this.getDocumentContent(parsed.token);
  }
}
