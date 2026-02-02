/**
 * 飞书电子表格类型定义
 */

/** 表格信息 */
export interface SpreadsheetInfo {
  /** 表格 token */
  spreadsheetToken: string;
  /** 表格标题 */
  title: string;
  /** 表格所有者 ID */
  ownerId?: string;
  /** 表格 URL */
  url: string;
}

/** 工作表信息 */
export interface SheetInfo {
  /** 工作表 ID */
  sheetId: string;
  /** 工作表标题 */
  title: string;
  /** 工作表索引 */
  index: number;
  /** 是否隐藏 */
  hidden?: boolean;
  /** 网格属性 */
  gridProperties?: GridProperties;
  /** 资源类型 */
  resourceType?: string;
  /** 合并单元格信息 */
  merges?: MergeInfo[];
}

/** 网格属性 */
export interface GridProperties {
  /** 冻结行数 */
  frozenRowCount?: number;
  /** 冻结列数 */
  frozenColumnCount?: number;
  /** 总行数 */
  rowCount?: number;
  /** 总列数 */
  columnCount?: number;
}

/** 合并单元格信息 */
export interface MergeInfo {
  startRowIndex?: number;
  endRowIndex?: number;
  startColumnIndex?: number;
  endColumnIndex?: number;
}

/** 单元格值类型 */
export type CellValue = string | number | boolean | null | undefined;

/** 单元格范围数据 */
export interface RangeData {
  /** 范围字符串 (如 "Sheet1!A1:D10") */
  range: string;
  /** 值二维数组 */
  values: CellValue[][];
}

/** 创建表格选项 */
export interface CreateSpreadsheetOptions {
  /** 表格标题 */
  title: string;
  /** 目标文件夹 token */
  folderToken?: string;
}

/** 查找选项 */
export interface FindOptions {
  /** 查找范围 */
  range?: string;
  /** 是否区分大小写 */
  matchCase?: boolean;
  /** 是否完整匹配 */
  matchEntireCell?: boolean;
  /** 是否使用正则表达式 */
  searchByRegex?: boolean;
  /** 是否包含公式 */
  includeFormulas?: boolean;
}

/** 查找结果 */
export interface FindResult {
  /** 匹配的单元格位置 */
  matchedCells: string[];
  /** 匹配的公式单元格 */
  matchedFormulaCells?: string[];
  /** 匹配行数 */
  rowsCount?: number;
}

/** 替换结果 */
export interface ReplaceResult extends FindResult {
  /** 替换的单元格数量 */
  replacedCount: number;
}

/** 筛选条件 */
export interface FilterCondition {
  /** 筛选类型 */
  filterType: string;
  /** 比较类型 */
  compareType?: string;
  /** 期望值 */
  expected: string[];
}

/** 筛选信息 */
export interface FilterInfo {
  /** 范围 */
  range: string;
  /** 被筛选掉的行 */
  filteredOutRows: number[];
  /** 筛选条件列表 */
  filterInfos: Array<{
    col: string;
    conditions: FilterCondition[];
  }>;
}

/** 筛选视图 */
export interface FilterView {
  /** 筛选视图 ID */
  filterViewId: string;
  /** 筛选视图名称 */
  filterViewName: string;
  /** 筛选范围 */
  range: string;
}

/** 解析的表格 URL */
export interface ParsedSheetUrl {
  /** 文档类型 */
  type: 'sheet' | 'bitable' | 'unknown';
  /** 表格 token */
  token: string;
  /** 工作表 ID (如果有) */
  sheetId?: string;
  /** 原始 URL */
  url: string;
}

/** 表格操作结果 */
export interface SheetResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** 写入选项 */
export interface WriteOptions {
  /** 值输入选项: RAW (原始值) 或 USER_ENTERED (解析用户输入) */
  valueInputOption?: 'RAW' | 'USER_ENTERED';
}

/** 追加选项 */
export interface AppendOptions extends WriteOptions {
  /** 插入数据选项: OVERWRITE (覆盖) 或 INSERT_ROWS (插入新行) */
  insertDataOption?: 'OVERWRITE' | 'INSERT_ROWS';
}

/** 批量操作结果 */
export interface BatchOperationResult {
  /** 更新的单元格数量 */
  updatedCells: number;
  /** 更新的行数 */
  updatedRows: number;
  /** 更新的列数 */
  updatedColumns: number;
  /** 更新的范围 */
  updatedRange: string;
}
