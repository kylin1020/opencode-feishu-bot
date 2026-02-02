/**
 * 飞书媒体上传器
 * 
 * 提供图片和文件的上传功能
 */
import type * as Lark from '@larksuiteoapi/node-sdk';
import type { DocumentResult } from './types';
import { logger } from '../../utils/logger';

/** 上传文件类型 */
export type MediaParentType = 
  | 'doc_image'     // 旧版文档图片
  | 'docx_image'    // 新版文档图片
  | 'sheet_image'   // 电子表格图片
  | 'bitable_image' // 多维表格图片
  | 'doc_file'      // 旧版文档文件
  | 'docx_file'     // 新版文档文件
  | 'sheet_file'    // 电子表格文件
  | 'bitable_file'; // 多维表格文件

/** 上传结果 */
export interface UploadResult {
  /** 文件 token */
  fileToken: string;
}

/** 上传选项 */
export interface UploadOptions {
  /** 文件名 */
  fileName?: string;
  /** 校验和 (adler32) */
  checksum?: string;
  /** 扩展信息 */
  extra?: string;
}

/** 分片上传状态 */
export interface UploadProgress {
  uploadId: string;
  blockSize: number;
  blockNum: number;
  uploadedBlocks: number;
}

/**
 * 媒体上传器
 */
export class MediaUploader {
  private client: Lark.Client;
  
  /** 单次上传大小限制 (20MB) */
  static readonly MAX_SINGLE_UPLOAD_SIZE = 20 * 1024 * 1024;
  
  /** 分片大小 (4MB) */
  static readonly BLOCK_SIZE = 4 * 1024 * 1024;

  constructor(client: Lark.Client) {
    this.client = client;
  }

  /**
   * 上传图片到文档
   * @param documentId 文档ID
   * @param imageData 图片数据 (Buffer)
   * @param options 选项
   */
  async uploadImage(
    documentId: string,
    imageData: Buffer,
    options?: UploadOptions
  ): Promise<DocumentResult<UploadResult>> {
    return this.uploadMedia(documentId, imageData, 'docx_image', options);
  }

  /**
   * 上传文件到文档
   * @param documentId 文档ID
   * @param fileData 文件数据 (Buffer)
   * @param options 选项
   */
  async uploadFile(
    documentId: string,
    fileData: Buffer,
    options?: UploadOptions
  ): Promise<DocumentResult<UploadResult>> {
    return this.uploadMedia(documentId, fileData, 'docx_file', options);
  }

  /**
   * 上传媒体文件
   * @param parentNode 父节点 token (文档ID)
   * @param data 文件数据
   * @param parentType 文件类型
   * @param options 选项
   */
  async uploadMedia(
    parentNode: string,
    data: Buffer,
    parentType: MediaParentType,
    options?: UploadOptions
  ): Promise<DocumentResult<UploadResult>> {
    try {
      const fileName = options?.fileName || this.generateFileName(parentType);
      const size = data.length;

      // 大文件使用分片上传
      if (size > MediaUploader.MAX_SINGLE_UPLOAD_SIZE) {
        return this.uploadLargeMedia(parentNode, data, parentType, options);
      }

      // 小文件直接上传
      const response = await this.client.drive.media.uploadAll({
        data: {
          file_name: fileName,
          parent_type: parentType,
          parent_node: parentNode,
          size,
          checksum: options?.checksum,
          extra: options?.extra,
          file: data,
        },
      });

      if (!response?.file_token) {
        logger.error('上传媒体失败', { response });
        return { success: false, error: '上传失败：未返回文件token' };
      }

      return {
        success: true,
        data: { fileToken: response.file_token },
      };
    } catch (error) {
      logger.error('上传媒体时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 上传大文件（分片上传）
   * @param parentNode 父节点 token
   * @param data 文件数据
   * @param parentType 文件类型
   * @param options 选项
   */
  async uploadLargeMedia(
    parentNode: string,
    data: Buffer,
    parentType: MediaParentType,
    options?: UploadOptions
  ): Promise<DocumentResult<UploadResult>> {
    try {
      const fileName = options?.fileName || this.generateFileName(parentType);
      const size = data.length;

      // 1. 预上传，获取 upload_id
      const prepareResponse = await this.client.drive.media.uploadPrepare({
        data: {
          file_name: fileName,
          parent_type: parentType,
          parent_node: parentNode,
          size,
          extra: options?.extra,
        },
      });

      if (prepareResponse.code !== 0 || !prepareResponse.data?.upload_id) {
        logger.error('预上传失败', { code: prepareResponse.code, msg: prepareResponse.msg });
        return { success: false, error: prepareResponse.msg || '预上传失败' };
      }

      const { upload_id: uploadId, block_size: blockSize, block_num: blockNum } = prepareResponse.data;

      // 2. 分片上传
      const actualBlockSize = blockSize || MediaUploader.BLOCK_SIZE;
      const actualBlockNum = blockNum || Math.ceil(size / actualBlockSize);

      for (let seq = 0; seq < actualBlockNum; seq++) {
        const start = seq * actualBlockSize;
        const end = Math.min(start + actualBlockSize, size);
        const chunk = data.subarray(start, end);

        const partResponse = await this.client.drive.media.uploadPart({
          data: {
            upload_id: uploadId,
            seq,
            size: chunk.length,
            checksum: options?.checksum,
            file: chunk,
          },
        });

        if (partResponse && typeof partResponse === 'object' && 'code' in partResponse && partResponse.code !== 0) {
          logger.error('分片上传失败', { seq, code: partResponse.code });
          return { success: false, error: `分片 ${seq} 上传失败` };
        }
      }

      // 3. 完成上传
      const finishResponse = await this.client.drive.media.uploadFinish({
        data: {
          upload_id: uploadId,
          block_num: actualBlockNum,
        },
      });

      if (finishResponse.code !== 0 || !finishResponse.data?.file_token) {
        logger.error('完成上传失败', { code: finishResponse.code, msg: finishResponse.msg });
        return { success: false, error: finishResponse.msg || '完成上传失败' };
      }

      return {
        success: true,
        data: { fileToken: finishResponse.data.file_token },
      };
    } catch (error) {
      logger.error('分片上传时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 上传图片用于消息发送
   * @param imageData 图片数据
   * @param imageType 图片类型
   */
  async uploadMessageImage(
    imageData: Buffer,
    imageType: 'message' | 'avatar' = 'message'
  ): Promise<DocumentResult<{ imageKey: string }>> {
    try {
      const response = await this.client.im.image.create({
        data: {
          image_type: imageType,
          image: imageData,
        },
      });

      if (!response?.image_key) {
        logger.error('上传消息图片失败', { response });
        return { success: false, error: '上传失败：未返回 image_key' };
      }

      return {
        success: true,
        data: { imageKey: response.image_key },
      };
    } catch (error) {
      logger.error('上传消息图片时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 从 URL 下载并上传图片
   * @param documentId 文档ID
   * @param imageUrl 图片URL
   * @param options 选项
   */
  async uploadImageFromUrl(
    documentId: string,
    imageUrl: string,
    options?: UploadOptions
  ): Promise<DocumentResult<UploadResult>> {
    try {
      // 下载图片
      const response = await fetch(imageUrl);
      if (!response.ok) {
        return { success: false, error: `下载图片失败: ${response.status}` };
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // 从 URL 中提取文件名
      const urlFileName = imageUrl.split('/').pop()?.split('?')[0];
      const fileName = options?.fileName || urlFileName || 'image.png';

      return this.uploadImage(documentId, buffer, { ...options, fileName });
    } catch (error) {
      logger.error('从URL上传图片时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 生成默认文件名
   */
  private generateFileName(parentType: MediaParentType): string {
    const timestamp = Date.now();
    const isImage = parentType.includes('image');
    const ext = isImage ? 'png' : 'bin';
    return `upload_${timestamp}.${ext}`;
  }
}
