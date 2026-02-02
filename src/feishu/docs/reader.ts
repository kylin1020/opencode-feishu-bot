import type {
  DocumentInfo,
  DocumentContent,
  DocumentResult,
  ParsedDocumentUrl,
} from './types';
import { logger } from '../../utils/logger';
import type { FeishuApiClient } from '../api';

const FEISHU_URL_PATTERNS = [
  /feishu\.cn\/docx\/([a-zA-Z0-9]+)/,
  /feishu\.cn\/docs\/([a-zA-Z0-9]+)/,
  /feishu\.cn\/wiki\/([a-zA-Z0-9]+)/,
  /feishu\.cn\/sheets\/([a-zA-Z0-9]+)/,
  /larksuite\.com\/docx\/([a-zA-Z0-9]+)/,
  /larksuite\.com\/docs\/([a-zA-Z0-9]+)/,
];

/** 从文本中提取所有飞书文档/表格链接的正则 */
const FEISHU_URL_EXTRACT_PATTERN = /https?:\/\/(?:[a-zA-Z0-9-]+\.)?(?:feishu\.cn|larksuite\.com)\/(?:docx|docs|wiki|sheets|base)\/[a-zA-Z0-9_-]+(?:\?[^\s)]*)?/g;

/**
 * 从文本中提取所有飞书文档/表格链接
 * @param text 输入文本
 * @returns 解析后的文档链接数组
 */
export function extractDocumentUrls(text: string): ParsedDocumentUrl[] {
  const matches = text.match(FEISHU_URL_EXTRACT_PATTERN);
  if (!matches) {
    return [];
  }
  
  const uniqueUrls = [...new Set(matches)];
  return uniqueUrls.map(url => parseDocumentUrl(url));
}

/**
 * 检查文本是否包含飞书文档/表格链接
 * @param text 输入文本
 */
export function hasDocumentUrls(text: string): boolean {
  return FEISHU_URL_EXTRACT_PATTERN.test(text);
}

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
  private apiClient: FeishuApiClient;

  constructor(apiClient: FeishuApiClient) {
    this.apiClient = apiClient;
  }

  async getDocumentInfo(documentId: string): Promise<DocumentResult<DocumentInfo>> {
    try {
      const response = await this.apiClient.getDocumentInfo(documentId);

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
      const response = await this.apiClient.getDocumentRawContent(documentId, 0);

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

  /**
   * 读取 wiki 文档
   * Wiki 需要先获取实际的文档 token
   */
  async readWikiDocument(wikiToken: string): Promise<DocumentResult<DocumentContent>> {
    try {
      // 获取 wiki 节点信息，获取实际的文档 token
      const nodeResponse = await this.apiClient.getWikiNodeInfo(wikiToken);
      
      if (nodeResponse.code !== 0) {
        logger.error('获取 wiki 节点信息失败', { code: nodeResponse.code, msg: nodeResponse.msg });
        return { success: false, error: nodeResponse.msg || '获取 wiki 节点信息失败' };
      }

      const node = nodeResponse.data?.node;
      if (!node?.obj_token) {
        return { success: false, error: 'Wiki 节点不存在' };
      }

      // 检查节点类型，目前只支持文档类型
      if (node.obj_type !== 'docx' && node.obj_type !== 'doc') {
        return { success: false, error: `不支持的 wiki 节点类型: ${node.obj_type}` };
      }

      // 使用实际的文档 token 获取内容
      return this.getDocumentContent(node.obj_token);
    } catch (error) {
      logger.error('读取 wiki 文档时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  async readDocument(urlOrToken: string): Promise<DocumentResult<DocumentContent>> {
    const parsed = parseDocumentUrl(urlOrToken);
    
    if (parsed.type === 'unknown' || parsed.type === 'sheet') {
      return { success: false, error: `不支持的文档类型: ${parsed.type}` };
    }

    // wiki 类型需要特殊处理
    if (parsed.type === 'wiki') {
      return this.readWikiDocument(parsed.token);
    }

    return this.getDocumentContent(parsed.token);
  }
}
