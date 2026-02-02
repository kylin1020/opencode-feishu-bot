/**
 * 飞书电子表格读取器
 */
import type * as Lark from '@larksuiteoapi/node-sdk';
import type {
  SpreadsheetInfo,
  SheetInfo,
  SheetResult,
  CellValue,
  RangeData,
  FindOptions,
  FindResult,
  FilterInfo,
  FilterView,
  GridProperties,
  MergeInfo,
} from './types';
import { parseSheetUrl, buildSheetUrl } from './parser';
import { logger } from '../../utils/logger';

/**
 * 电子表格读取器
 */
export class SheetReader {
  private client: Lark.Client;

  constructor(client: Lark.Client) {
    this.client = client;
  }

  /**
   * 获取表格信息
   * @param urlOrToken 表格 URL 或 token
   */
  async getSpreadsheetInfo(urlOrToken: string): Promise<SheetResult<SpreadsheetInfo>> {
    try {
      const parsed = parseSheetUrl(urlOrToken);
      if (parsed.type !== 'sheet') {
        return { success: false, error: `不支持的类型: ${parsed.type}` };
      }

      const response = await this.client.sheets.spreadsheet.get({
        path: { spreadsheet_token: parsed.token },
      });

      if (response.code !== 0) {
        logger.error('获取表格信息失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '获取表格信息失败' };
      }

      const spreadsheet = response.data?.spreadsheet;
      if (!spreadsheet) {
        return { success: false, error: '表格不存在' };
      }

      return {
        success: true,
        data: {
          spreadsheetToken: spreadsheet.token || parsed.token,
          title: spreadsheet.title || '',
          ownerId: spreadsheet.owner_id,
          url: spreadsheet.url || buildSheetUrl(parsed.token),
        },
      };
    } catch (error) {
      logger.error('获取表格信息时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 获取所有工作表
   * @param urlOrToken 表格 URL 或 token
   */
  async getSheets(urlOrToken: string): Promise<SheetResult<SheetInfo[]>> {
    try {
      const parsed = parseSheetUrl(urlOrToken);
      if (parsed.type !== 'sheet') {
        return { success: false, error: `不支持的类型: ${parsed.type}` };
      }

      const response = await this.client.sheets.spreadsheetSheet.query({
        path: { spreadsheet_token: parsed.token },
      });

      if (response.code !== 0) {
        logger.error('获取工作表列表失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '获取工作表列表失败' };
      }

      const sheets = response.data?.sheets?.map(sheet => this.transformSheetInfo(sheet)) || [];
      
      return { success: true, data: sheets };
    } catch (error) {
      logger.error('获取工作表列表时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 获取单个工作表
   * @param urlOrToken 表格 URL 或 token
   * @param sheetId 工作表 ID
   */
  async getSheet(urlOrToken: string, sheetId: string): Promise<SheetResult<SheetInfo>> {
    try {
      const parsed = parseSheetUrl(urlOrToken);
      if (parsed.type !== 'sheet') {
        return { success: false, error: `不支持的类型: ${parsed.type}` };
      }

      const response = await this.client.sheets.spreadsheetSheet.get({
        path: { 
          spreadsheet_token: parsed.token,
          sheet_id: sheetId,
        },
      });

      if (response.code !== 0) {
        logger.error('获取工作表失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '获取工作表失败' };
      }

      const sheet = response.data?.sheet;
      if (!sheet) {
        return { success: false, error: '工作表不存在' };
      }

      return { success: true, data: this.transformSheetInfo(sheet) };
    } catch (error) {
      logger.error('获取工作表时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 读取单元格数据（单个范围）
   * @param urlOrToken 表格 URL 或 token
   * @param range 范围字符串 (如 "Sheet1!A1:D10")
   */
  async readRange(urlOrToken: string, range: string): Promise<SheetResult<CellValue[][]>> {
    try {
      const parsed = parseSheetUrl(urlOrToken);
      if (parsed.type !== 'sheet') {
        return { success: false, error: `不支持的类型: ${parsed.type}` };
      }

      // 使用 v2 API 读取数据
      const response = await this.client.request({
        method: 'GET',
        url: `/open-apis/sheets/v2/spreadsheets/${parsed.token}/values/${encodeURIComponent(range)}`,
        params: {
          valueRenderOption: 'ToString',
          dateTimeRenderOption: 'FormattedString',
        },
      });

      const data = response as { code?: number; msg?: string; data?: { valueRange?: { values?: CellValue[][] } } };
      
      if (data.code !== 0) {
        logger.error('读取数据失败', { code: data.code, msg: data.msg });
        return { success: false, error: data.msg || '读取数据失败' };
      }

      const values = data.data?.valueRange?.values || [];
      return { success: true, data: values };
    } catch (error) {
      logger.error('读取数据时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 批量读取多个范围
   * @param urlOrToken 表格 URL 或 token
   * @param ranges 范围字符串数组
   */
  async readRanges(urlOrToken: string, ranges: string[]): Promise<SheetResult<Map<string, CellValue[][]>>> {
    try {
      const parsed = parseSheetUrl(urlOrToken);
      if (parsed.type !== 'sheet') {
        return { success: false, error: `不支持的类型: ${parsed.type}` };
      }

      const response = await this.client.request({
        method: 'GET',
        url: `/open-apis/sheets/v2/spreadsheets/${parsed.token}/values_batch_get`,
        params: {
          ranges: ranges.join(','),
          valueRenderOption: 'ToString',
          dateTimeRenderOption: 'FormattedString',
        },
      });

      const data = response as { 
        code?: number; 
        msg?: string; 
        data?: { 
          valueRanges?: Array<{ range?: string; values?: CellValue[][] }> 
        } 
      };
      
      if (data.code !== 0) {
        logger.error('批量读取数据失败', { code: data.code, msg: data.msg });
        return { success: false, error: data.msg || '批量读取数据失败' };
      }

      const result = new Map<string, CellValue[][]>();
      for (const vr of data.data?.valueRanges || []) {
        if (vr.range) {
          result.set(vr.range, vr.values || []);
        }
      }

      return { success: true, data: result };
    } catch (error) {
      logger.error('批量读取数据时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 查找单元格
   * @param urlOrToken 表格 URL 或 token
   * @param sheetId 工作表 ID
   * @param query 查找内容
   * @param options 查找选项
   */
  async find(
    urlOrToken: string, 
    sheetId: string, 
    query: string, 
    options?: FindOptions
  ): Promise<SheetResult<FindResult>> {
    try {
      const parsed = parseSheetUrl(urlOrToken);
      if (parsed.type !== 'sheet') {
        return { success: false, error: `不支持的类型: ${parsed.type}` };
      }

      const response = await this.client.sheets.spreadsheetSheet.find({
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
          find: query,
        },
      });

      if (response.code !== 0) {
        logger.error('查找失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '查找失败' };
      }

      const result = response.data?.find_result;
      return {
        success: true,
        data: {
          matchedCells: result?.matched_cells || [],
          matchedFormulaCells: result?.matched_formula_cells,
          rowsCount: result?.rows_count,
        },
      };
    } catch (error) {
      logger.error('查找时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 获取筛选信息
   * @param urlOrToken 表格 URL 或 token
   * @param sheetId 工作表 ID
   */
  async getFilter(urlOrToken: string, sheetId: string): Promise<SheetResult<FilterInfo>> {
    try {
      const parsed = parseSheetUrl(urlOrToken);
      if (parsed.type !== 'sheet') {
        return { success: false, error: `不支持的类型: ${parsed.type}` };
      }

      const response = await this.client.sheets.spreadsheetSheetFilter.get({
        path: {
          spreadsheet_token: parsed.token,
          sheet_id: sheetId,
        },
      });

      if (response.code !== 0) {
        logger.error('获取筛选信息失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '获取筛选信息失败' };
      }

      const filter = response.data?.sheet_filter_info;
      if (!filter) {
        return { success: false, error: '没有筛选' };
      }

      return {
        success: true,
        data: {
          range: filter.range,
          filteredOutRows: filter.filtered_out_rows || [],
          filterInfos: filter.filter_infos?.map(f => ({
            col: f.col,
            conditions: f.conditions?.map(c => ({
              filterType: c.filter_type,
              compareType: c.compare_type,
              expected: c.expected || [],
            })) || [],
          })) || [],
        },
      };
    } catch (error) {
      logger.error('获取筛选信息时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 获取所有筛选视图
   * @param urlOrToken 表格 URL 或 token
   * @param sheetId 工作表 ID
   */
  async getFilterViews(urlOrToken: string, sheetId: string): Promise<SheetResult<FilterView[]>> {
    try {
      const parsed = parseSheetUrl(urlOrToken);
      if (parsed.type !== 'sheet') {
        return { success: false, error: `不支持的类型: ${parsed.type}` };
      }

      const response = await this.client.sheets.spreadsheetSheetFilterView.query({
        path: {
          spreadsheet_token: parsed.token,
          sheet_id: sheetId,
        },
      });

      if (response.code !== 0) {
        logger.error('获取筛选视图失败', { code: response.code, msg: response.msg });
        return { success: false, error: response.msg || '获取筛选视图失败' };
      }

      const views = response.data?.items?.map(item => ({
        filterViewId: item.filter_view_id || '',
        filterViewName: item.filter_view_name || '',
        range: item.range || '',
      })) || [];

      return { success: true, data: views };
    } catch (error) {
      logger.error('获取筛选视图时出错', error);
      return { success: false, error: error instanceof Error ? error.message : '未知错误' };
    }
  }

  /**
   * 转换工作表信息
   */
  private transformSheetInfo(sheet: Record<string, unknown>): SheetInfo {
    const gridProps = sheet.grid_properties as Record<string, unknown> | undefined;
    const merges = sheet.merges as Array<Record<string, unknown>> | undefined;

    return {
      sheetId: (sheet.sheet_id as string) || '',
      title: (sheet.title as string) || '',
      index: (sheet.index as number) || 0,
      hidden: sheet.hidden as boolean | undefined,
      resourceType: sheet.resource_type as string | undefined,
      gridProperties: gridProps ? {
        frozenRowCount: gridProps.frozen_row_count as number | undefined,
        frozenColumnCount: gridProps.frozen_column_count as number | undefined,
        rowCount: gridProps.row_count as number | undefined,
        columnCount: gridProps.column_count as number | undefined,
      } : undefined,
      merges: merges?.map(m => ({
        startRowIndex: m.start_row_index as number | undefined,
        endRowIndex: m.end_row_index as number | undefined,
        startColumnIndex: m.start_column_index as number | undefined,
        endColumnIndex: m.end_column_index as number | undefined,
      })),
    };
  }
}
