/**
 * 飞书电子表格写入器
 */
import type * as Lark from '@larksuiteoapi/node-sdk';
import type {
  SpreadsheetInfo,
  SheetResult,
  CellValue,
  CreateSpreadsheetOptions,
  FindOptions,
  ReplaceResult,
  WriteOptions,
  AppendOptions,
  BatchOperationResult,
} from './types';
import { parseSheetUrl, buildSheetUrl } from './parser';
import { logger } from '../../utils/logger';

/**
 * 电子表格写入器
 */
export class SheetWriter {
  private client: Lark.Client;
  private defaultFolderToken?: string;

  constructor(client: Lark.Client, defaultFolderToken?: string) {
    this.client = client;
    this.defaultFolderToken = defaultFolderToken;
  }

  /**
   * 设置默认文件夹
   */
  setDefaultFolder(folderToken: string): void {
    this.defaultFolderToken = folderToken;
  }

  /**
   * 创建表格
   * @param options 创建选项
   */
  async createSpreadsheet(options: CreateSpreadsheetOptions): Promise<SheetResult<SpreadsheetInfo>> {
    try {
      const folderToken = options.folderToken || this.defaultFolderToken;

      const response = await this.client.sheets.spreadsheet.create({
        data: {
          title: options.title,
          folder_token: folderToken,
        },
      });

      if (response.code !== 0) {
        logger.error('创建表格失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '创建表格失败' };
      }

      const spreadsheet = response.data?.spreadsheet;
      if (!spreadsheet?.spreadsheet_token) {
        return { success: false, error: '创建表格失败：未返回 token' };
      }

      return {
        success: true,
        data: {
          spreadsheetToken: spreadsheet.spreadsheet_token,
          title: spreadsheet.title || options.title,
          url: spreadsheet.url || buildSheetUrl(spreadsheet.spreadsheet_token),
        },
      };
    } catch (error) {
      logger.error('创建表格时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 修改表格标题
   * @param urlOrToken 表格 URL 或 token
   * @param title 新标题
   */
  async updateTitle(urlOrToken: string, title: string): Promise<SheetResult<void>> {
    try {
      const parsed = parseSheetUrl(urlOrToken);
      if (parsed.type !== 'sheet') {
        return { success: false, error: `不支持的类型: ${parsed.type}` };
      }

      const response = await this.client.sheets.spreadsheet.patch({
        path: { spreadsheet_token: parsed.token },
        data: { title },
      });

      if (response.code !== 0) {
        logger.error('修改表格标题失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '修改表格标题失败' };
      }

      return { success: true };
    } catch (error) {
      logger.error('修改表格标题时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 写入单个范围数据
   * @param urlOrToken 表格 URL 或 token
   * @param range 范围字符串 (如 "Sheet1!A1:D10")
   * @param values 值二维数组
   * @param options 写入选项
   */
  async writeRange(
    urlOrToken: string,
    range: string,
    values: CellValue[][],
    options?: WriteOptions
  ): Promise<SheetResult<BatchOperationResult>> {
    try {
      const parsed = parseSheetUrl(urlOrToken);
      if (parsed.type !== 'sheet') {
        return { success: false, error: `不支持的类型: ${parsed.type}` };
      }

      const response = await this.client.request({
        method: 'PUT',
        url: `/open-apis/sheets/v2/spreadsheets/${parsed.token}/values`,
        data: {
          valueRange: {
            range,
            values,
          },
        },
        params: {
          valueInputOption: options?.valueInputOption || 'USER_ENTERED',
        },
      });

      const data = response as { 
        code?: number; 
        msg?: string; 
        data?: { 
          updatedCells?: number;
          updatedRows?: number;
          updatedColumns?: number;
          updatedRange?: string;
        } 
      };

      if (data.code !== 0) {
        logger.error('写入数据失败', { code: data.code, msg: data.msg });
        return { success: false, error: data.msg || '写入数据失败' };
      }

      return {
        success: true,
        data: {
          updatedCells: data.data?.updatedCells || 0,
          updatedRows: data.data?.updatedRows || 0,
          updatedColumns: data.data?.updatedColumns || 0,
          updatedRange: data.data?.updatedRange || range,
        },
      };
    } catch (error) {
      logger.error('写入数据时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 批量写入多个范围
   * @param urlOrToken 表格 URL 或 token
   * @param data 范围和值的映射
   * @param options 写入选项
   */
  async writeRanges(
    urlOrToken: string,
    data: Map<string, CellValue[][]>,
    options?: WriteOptions
  ): Promise<SheetResult<void>> {
    try {
      const parsed = parseSheetUrl(urlOrToken);
      if (parsed.type !== 'sheet') {
        return { success: false, error: `不支持的类型: ${parsed.type}` };
      }

      const valueRanges = Array.from(data.entries()).map(([range, values]) => ({
        range,
        values,
      }));

      const response = await this.client.request({
        method: 'POST',
        url: `/open-apis/sheets/v2/spreadsheets/${parsed.token}/values_batch_update`,
        data: { valueRanges },
        params: {
          valueInputOption: options?.valueInputOption || 'USER_ENTERED',
        },
      });

      const result = response as { code?: number; msg?: string };

      if (result.code !== 0) {
        logger.error('批量写入数据失败', { code: result.code, msg: result.msg });
        return { success: false, error: result.msg || '批量写入数据失败' };
      }

      return { success: true };
    } catch (error) {
      logger.error('批量写入数据时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 追加数据到表格末尾
   * @param urlOrToken 表格 URL 或 token
   * @param range 范围字符串
   * @param values 值二维数组
   * @param options 追加选项
   */
  async appendData(
    urlOrToken: string,
    range: string,
    values: CellValue[][],
    options?: AppendOptions
  ): Promise<SheetResult<BatchOperationResult>> {
    try {
      const parsed = parseSheetUrl(urlOrToken);
      if (parsed.type !== 'sheet') {
        return { success: false, error: `不支持的类型: ${parsed.type}` };
      }

      const response = await this.client.request({
        method: 'POST',
        url: `/open-apis/sheets/v2/spreadsheets/${parsed.token}/values_append`,
        data: {
          valueRange: {
            range,
            values,
          },
        },
        params: {
          valueInputOption: options?.valueInputOption || 'USER_ENTERED',
          insertDataOption: options?.insertDataOption || 'INSERT_ROWS',
        },
      });

      const data = response as { 
        code?: number; 
        msg?: string; 
        data?: { 
          tableRange?: string;
          updates?: {
            updatedCells?: number;
            updatedRows?: number;
            updatedColumns?: number;
            updatedRange?: string;
          };
        } 
      };

      if (data.code !== 0) {
        logger.error('追加数据失败', { code: data.code, msg: data.msg });
        return { success: false, error: data.msg || '追加数据失败' };
      }

      return {
        success: true,
        data: {
          updatedCells: data.data?.updates?.updatedCells || 0,
          updatedRows: data.data?.updates?.updatedRows || 0,
          updatedColumns: data.data?.updates?.updatedColumns || 0,
          updatedRange: data.data?.updates?.updatedRange || range,
        },
      };
    } catch (error) {
      logger.error('追加数据时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 查找并替换
   * @param urlOrToken 表格 URL 或 token
   * @param sheetId 工作表 ID
   * @param find 查找内容
   * @param replacement 替换内容
   * @param options 查找选项
   */
  async replace(
    urlOrToken: string,
    sheetId: string,
    find: string,
    replacement: string,
    options?: FindOptions
  ): Promise<SheetResult<ReplaceResult>> {
    try {
      const parsed = parseSheetUrl(urlOrToken);
      if (parsed.type !== 'sheet') {
        return { success: false, error: `不支持的类型: ${parsed.type}` };
      }

      const response = await this.client.sheets.spreadsheetSheet.replace({
        path: {
          spreadsheet_token: parsed.token,
          sheet_id: sheetId,
        },
        data: {
          find_condition: {
            range: options?.range || sheetId,
            match_case: options?.matchCase,
            match_entire_cell: options?.matchEntireCell,
            search_by_regex: options?.searchByRegex,
            include_formulas: options?.includeFormulas,
          },
          find,
          replacement,
        },
      });

      if (response.code !== 0) {
        logger.error('替换失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '替换失败' };
      }

      const result = response.data?.replace_result;
      return {
        success: true,
        data: {
          matchedCells: result?.matched_cells || [],
          matchedFormulaCells: result?.matched_formula_cells,
          rowsCount: result?.rows_count,
          replacedCount: result?.matched_cells?.length || 0,
        },
      };
    } catch (error) {
      logger.error('替换时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 插入行
   * @param urlOrToken 表格 URL 或 token
   * @param sheetId 工作表 ID
   * @param startIndex 起始行索引
   * @param count 插入行数
   */
  async insertRows(
    urlOrToken: string,
    sheetId: string,
    startIndex: number,
    count: number
  ): Promise<SheetResult<void>> {
    try {
      const parsed = parseSheetUrl(urlOrToken);
      if (parsed.type !== 'sheet') {
        return { success: false, error: `不支持的类型: ${parsed.type}` };
      }

      const response = await this.client.request({
        method: 'POST',
        url: `/open-apis/sheets/v2/spreadsheets/${parsed.token}/insert_dimension_range`,
        data: {
          dimension: {
            sheetId,
            majorDimension: 'ROWS',
            startIndex,
            endIndex: startIndex + count,
          },
          inheritStyle: 'BEFORE',
        },
      });

      const result = response as { code?: number; msg?: string };

      if (result.code !== 0) {
        logger.error('插入行失败', { code: result.code, msg: result.msg });
        return { success: false, error: result.msg || '插入行失败' };
      }

      return { success: true };
    } catch (error) {
      logger.error('插入行时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 插入列
   * @param urlOrToken 表格 URL 或 token
   * @param sheetId 工作表 ID
   * @param startIndex 起始列索引
   * @param count 插入列数
   */
  async insertColumns(
    urlOrToken: string,
    sheetId: string,
    startIndex: number,
    count: number
  ): Promise<SheetResult<void>> {
    try {
      const parsed = parseSheetUrl(urlOrToken);
      if (parsed.type !== 'sheet') {
        return { success: false, error: `不支持的类型: ${parsed.type}` };
      }

      const response = await this.client.request({
        method: 'POST',
        url: `/open-apis/sheets/v2/spreadsheets/${parsed.token}/insert_dimension_range`,
        data: {
          dimension: {
            sheetId,
            majorDimension: 'COLUMNS',
            startIndex,
            endIndex: startIndex + count,
          },
          inheritStyle: 'BEFORE',
        },
      });

      const result = response as { code?: number; msg?: string };

      if (result.code !== 0) {
        logger.error('插入列失败', { code: result.code, msg: result.msg });
        return { success: false, error: result.msg || '插入列失败' };
      }

      return { success: true };
    } catch (error) {
      logger.error('插入列时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 删除行
   * @param urlOrToken 表格 URL 或 token
   * @param sheetId 工作表 ID
   * @param startIndex 起始行索引
   * @param count 删除行数
   */
  async deleteRows(
    urlOrToken: string,
    sheetId: string,
    startIndex: number,
    count: number
  ): Promise<SheetResult<void>> {
    try {
      const parsed = parseSheetUrl(urlOrToken);
      if (parsed.type !== 'sheet') {
        return { success: false, error: `不支持的类型: ${parsed.type}` };
      }

      const response = await this.client.request({
        method: 'DELETE',
        url: `/open-apis/sheets/v2/spreadsheets/${parsed.token}/dimension_range`,
        data: {
          dimension: {
            sheetId,
            majorDimension: 'ROWS',
            startIndex,
            endIndex: startIndex + count,
          },
        },
      });

      const result = response as { code?: number; msg?: string };

      if (result.code !== 0) {
        logger.error('删除行失败', { code: result.code, msg: result.msg });
        return { success: false, error: result.msg || '删除行失败' };
      }

      return { success: true };
    } catch (error) {
      logger.error('删除行时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 删除列
   * @param urlOrToken 表格 URL 或 token
   * @param sheetId 工作表 ID
   * @param startIndex 起始列索引
   * @param count 删除列数
   */
  async deleteColumns(
    urlOrToken: string,
    sheetId: string,
    startIndex: number,
    count: number
  ): Promise<SheetResult<void>> {
    try {
      const parsed = parseSheetUrl(urlOrToken);
      if (parsed.type !== 'sheet') {
        return { success: false, error: `不支持的类型: ${parsed.type}` };
      }

      const response = await this.client.request({
        method: 'DELETE',
        url: `/open-apis/sheets/v2/spreadsheets/${parsed.token}/dimension_range`,
        data: {
          dimension: {
            sheetId,
            majorDimension: 'COLUMNS',
            startIndex,
            endIndex: startIndex + count,
          },
        },
      });

      const result = response as { code?: number; msg?: string };

      if (result.code !== 0) {
        logger.error('删除列失败', { code: result.code, msg: result.msg });
        return { success: false, error: result.msg || '删除列失败' };
      }

      return { success: true };
    } catch (error) {
      logger.error('删除列时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 创建筛选
   * @param urlOrToken 表格 URL 或 token
   * @param sheetId 工作表 ID
   * @param range 筛选范围
   * @param col 筛选列
   * @param condition 筛选条件
   */
  async createFilter(
    urlOrToken: string,
    sheetId: string,
    range: string,
    col: string,
    condition: { filterType: string; compareType?: string; expected: string[] }
  ): Promise<SheetResult<void>> {
    try {
      const parsed = parseSheetUrl(urlOrToken);
      if (parsed.type !== 'sheet') {
        return { success: false, error: `不支持的类型: ${parsed.type}` };
      }

      const response = await this.client.sheets.spreadsheetSheetFilter.create({
        path: {
          spreadsheet_token: parsed.token,
          sheet_id: sheetId,
        },
        data: {
          range,
          col,
          condition: {
            filter_type: condition.filterType,
            compare_type: condition.compareType,
            expected: condition.expected,
          },
        },
      });

      if (response.code !== 0) {
        logger.error('创建筛选失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '创建筛选失败' };
      }

      return { success: true };
    } catch (error) {
      logger.error('创建筛选时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 删除筛选
   * @param urlOrToken 表格 URL 或 token
   * @param sheetId 工作表 ID
   */
  async deleteFilter(urlOrToken: string, sheetId: string): Promise<SheetResult<void>> {
    try {
      const parsed = parseSheetUrl(urlOrToken);
      if (parsed.type !== 'sheet') {
        return { success: false, error: `不支持的类型: ${parsed.type}` };
      }

      const response = await this.client.sheets.spreadsheetSheetFilter.delete({
        path: {
          spreadsheet_token: parsed.token,
          sheet_id: sheetId,
        },
      });

      if (response.code !== 0) {
        logger.error('删除筛选失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '删除筛选失败' };
      }

      return { success: true };
    } catch (error) {
      logger.error('删除筛选时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }
}
