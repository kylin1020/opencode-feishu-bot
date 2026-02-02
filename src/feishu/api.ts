/**
 * 飞书 API 请求模块
 * 使用原生 fetch 直接请求飞书 API，绕过 SDK 的 axios 问题
 */
import { logger } from '../utils/logger';

const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';

/** API 响应基础类型 */
export interface FeishuApiResponse<T = unknown> {
  code: number;
  msg: string;
  data?: T;
}

/** Token 信息 */
interface TokenInfo {
  token: string;
  expiresAt: number;
}

/** 请求配置 */
interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  params?: Record<string, string | number>;
  body?: unknown;
  maxRetries?: number;
  retryDelay?: number;
}

/** 文档信息 */
export interface DocumentData {
  document_id?: string;
  title?: string;
  revision_id?: number;
}

/** 文档内容 */
export interface DocumentContentData {
  content?: string;
}

/**
 * 飞书 API 客户端
 * 直接使用 fetch 请求，支持自动 token 管理和重试
 */
export class FeishuApiClient {
  private appId: string;
  private appSecret: string;
  private tokenInfo: TokenInfo | null = null;

  constructor(appId: string, appSecret: string) {
    this.appId = appId;
    this.appSecret = appSecret;
  }

  /**
   * 获取 tenant_access_token
   * 自动缓存，过期前 5 分钟刷新
   */
  async getTenantAccessToken(): Promise<string> {
    const now = Date.now();
    
    // 如果 token 存在且未过期（提前 5 分钟刷新）
    if (this.tokenInfo && this.tokenInfo.expiresAt > now + 5 * 60 * 1000) {
      return this.tokenInfo.token;
    }

    logger.debug('获取新的 tenant_access_token');
    
    const response = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: this.appId,
        app_secret: this.appSecret,
      }),
    });

    const data = await response.json() as {
      code?: number;
      msg?: string;
      tenant_access_token?: string;
      expire?: number;
    };

    if (data.code !== 0 || !data.tenant_access_token) {
      logger.error('获取 tenant_access_token 失败', { code: data.code, msg: data.msg });
      throw new Error(`获取 access token 失败: ${data.msg || '未知错误'}`);
    }

    // 缓存 token，expire 是秒数
    this.tokenInfo = {
      token: data.tenant_access_token,
      expiresAt: now + (data.expire || 7200) * 1000,
    };

    return this.tokenInfo.token;
  }

  /**
   * 通用 API 请求方法
   * 支持自动重试和错误处理
   */
  async request<T>(
    path: string,
    options: RequestOptions = {}
  ): Promise<FeishuApiResponse<T>> {
    const {
      method = 'GET',
      params,
      body,
      maxRetries = 3,
      retryDelay = 1000,
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const token = await this.getTenantAccessToken();

        // 构建 URL
        let url = `${FEISHU_API_BASE}${path}`;
        if (params) {
          const searchParams = new URLSearchParams();
          for (const [key, value] of Object.entries(params)) {
            searchParams.append(key, String(value));
          }
          url += `?${searchParams.toString()}`;
        }

        // 构建请求头
        const headers: Record<string, string> = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        };

        // 发送请求
        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
        });

        // 解析响应
        const responseData = await response.json() as FeishuApiResponse<T>;

        // 检查业务错误码
        if (responseData.code !== 0) {
          logger.warn('API 请求返回错误', {
            path,
            code: responseData.code,
            msg: responseData.msg,
            attempt,
          });
          
          // 某些错误码不需要重试
          if (responseData.code === 99991663 || responseData.code === 99991664) {
            // 权限相关错误，不重试
            return responseData;
          }
        }

        return responseData;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn('API 请求失败，准备重试', {
          path,
          attempt,
          maxRetries,
          error: lastError.message,
        });

        if (attempt < maxRetries) {
          await this.sleep(retryDelay * attempt);
        }
      }
    }

    logger.error('API 请求最终失败', { path, error: lastError?.message });
    return {
      code: -1,
      msg: lastError?.message || '请求失败',
    };
  }

  /**
   * 请求二进制数据（如图片）
   */
  async requestBinary(
    path: string,
    options: RequestOptions = {}
  ): Promise<{ data: Buffer; mimeType: string } | null> {
    const { maxRetries = 3, retryDelay = 1000 } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const token = await this.getTenantAccessToken();

        const url = `${FEISHU_API_BASE}${path}`;
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!response.ok) {
          logger.warn('二进制请求失败', {
            path,
            status: response.status,
            attempt,
          });
          if (attempt < maxRetries) {
            await this.sleep(retryDelay * attempt);
            continue;
          }
          return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        const mimeType = response.headers.get('content-type') || 'application/octet-stream';

        return {
          data: Buffer.from(arrayBuffer),
          mimeType,
        };
      } catch (error) {
        logger.warn('二进制请求失败', {
          path,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
        if (attempt < maxRetries) {
          await this.sleep(retryDelay * attempt);
        }
      }
    }

    return null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============ 文档 API ============

  /**
   * 获取文档信息
   * https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/get
   */
  async getDocumentInfo(documentId: string): Promise<FeishuApiResponse<{ document?: DocumentData }>> {
    return this.request<{ document?: DocumentData }>(
      `/docx/v1/documents/${documentId}`
    );
  }

  /**
   * 获取文档纯文本内容
   * https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document/raw_content
   */
  async getDocumentRawContent(
    documentId: string,
    lang: number = 0
  ): Promise<FeishuApiResponse<DocumentContentData>> {
    return this.request<DocumentContentData>(
      `/docx/v1/documents/${documentId}/raw_content`,
      { params: { lang } }
    );
  }

  /**
   * 获取文档所有块
   * https://open.feishu.cn/document/server-docs/docs/docs/docx-v1/document-block/list
   */
  async getDocumentBlocks(
    documentId: string,
    pageSize: number = 500,
    pageToken?: string
  ): Promise<FeishuApiResponse<{
    items?: unknown[];
    has_more?: boolean;
    page_token?: string;
  }>> {
    const params: Record<string, string | number> = {
      page_size: pageSize,
      document_revision_id: -1,
    };
    if (pageToken) {
      params.page_token = pageToken;
    }
    
    return this.request(
      `/docx/v1/documents/${documentId}/blocks`,
      { params }
    );
  }

  // ============ 图片 API ============

  /**
   * 获取消息图片资源
   * https://open.feishu.cn/document/server-docs/im-v1/message/get-2
   */
  async getMessageImage(
    messageId: string,
    imageKey: string
  ): Promise<{ data: Buffer; mimeType: string } | null> {
    return this.requestBinary(
      `/im/v1/messages/${messageId}/resources/${imageKey}?type=image`
    );
  }

  // ============ Wiki API ============

  /**
   * 获取知识空间节点信息
   * https://open.feishu.cn/document/server-docs/docs/wiki-v2/space-node/get_node
   */
  async getWikiNodeInfo(token: string): Promise<FeishuApiResponse<{
    node?: {
      obj_token?: string;
      obj_type?: string;
      node_token?: string;
      title?: string;
    };
  }>> {
    return this.request(
      `/wiki/v2/spaces/get_node`,
      { params: { token } }
    );
  }
}

/**
 * 创建飞书 API 客户端
 */
export function createFeishuApiClient(appId: string, appSecret: string): FeishuApiClient {
  return new FeishuApiClient(appId, appSecret);
}
