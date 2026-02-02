/**
 * 飞书电子表格 URL 解析器
 */
import type { ParsedSheetUrl } from './types';

/** 表格 URL 匹配模式 */
const SHEET_URL_PATTERNS = [
  // 标准电子表格 URL
  /feishu\.cn\/sheets\/([a-zA-Z0-9]+)(?:\?sheet=([a-zA-Z0-9]+))?/,
  /feishu\.cn\/wiki\/([a-zA-Z0-9]+).*sheet=([a-zA-Z0-9]+)/,
  // 多维表格 URL
  /feishu\.cn\/base\/([a-zA-Z0-9]+)/,
  // Lark 国际版
  /larksuite\.com\/sheets\/([a-zA-Z0-9]+)(?:\?sheet=([a-zA-Z0-9]+))?/,
  /larksuite\.com\/base\/([a-zA-Z0-9]+)/,
];

/**
 * 解析表格 URL 或 token
 * @param urlOrToken 表格 URL 或 token
 * @returns 解析结果
 */
export function parseSheetUrl(urlOrToken: string): ParsedSheetUrl {
  // 如果不包含斜杠，认为是纯 token
  if (!urlOrToken.includes('/')) {
    return { 
      type: 'sheet', 
      token: urlOrToken, 
      url: '' 
    };
  }

  // 尝试匹配 URL 模式
  for (const pattern of SHEET_URL_PATTERNS) {
    const match = urlOrToken.match(pattern);
    if (match?.[1]) {
      let type: ParsedSheetUrl['type'] = 'unknown';
      
      if (urlOrToken.includes('/sheets/')) {
        type = 'sheet';
      } else if (urlOrToken.includes('/base/')) {
        type = 'bitable';
      }

      return {
        type,
        token: match[1],
        sheetId: match[2] || undefined,
        url: urlOrToken,
      };
    }
  }

  // 无法解析，返回未知类型
  return { 
    type: 'unknown', 
    token: urlOrToken, 
    url: urlOrToken 
  };
}

/**
 * 从 URL 中提取工作表 ID
 * @param url 完整 URL
 */
export function extractSheetIdFromUrl(url: string): string | undefined {
  // 尝试从 URL 参数中提取 sheet 参数
  const urlObj = new URL(url);
  const sheetParam = urlObj.searchParams.get('sheet');
  if (sheetParam) {
    return sheetParam;
  }

  // 尝试从 hash 中提取
  const hashMatch = url.match(/#.*sheet=([a-zA-Z0-9]+)/);
  if (hashMatch?.[1]) {
    return hashMatch[1];
  }

  return undefined;
}

/**
 * 构建表格 URL
 * @param spreadsheetToken 表格 token
 * @param sheetId 工作表 ID (可选)
 */
export function buildSheetUrl(spreadsheetToken: string, sheetId?: string): string {
  let url = `https://feishu.cn/sheets/${spreadsheetToken}`;
  if (sheetId) {
    url += `?sheet=${sheetId}`;
  }
  return url;
}

/**
 * 解析范围字符串
 * @param range 范围字符串 (如 "Sheet1!A1:D10" 或 "A1:D10")
 * @returns 解析后的范围信息
 */
export function parseRange(range: string): {
  sheetName?: string;
  startCell: string;
  endCell?: string;
} {
  // 检查是否包含工作表名称
  const sheetSeparator = range.indexOf('!');
  
  let sheetName: string | undefined;
  let cellRange: string;
  
  if (sheetSeparator !== -1) {
    sheetName = range.substring(0, sheetSeparator);
    cellRange = range.substring(sheetSeparator + 1);
  } else {
    cellRange = range;
  }

  // 解析单元格范围
  const rangeParts = cellRange.split(':');
  
  return {
    sheetName,
    startCell: rangeParts[0] || '',
    endCell: rangeParts[1],
  };
}

/**
 * 构建范围字符串
 * @param sheetId 工作表 ID 或名称
 * @param startCell 起始单元格
 * @param endCell 结束单元格 (可选)
 */
export function buildRange(sheetId: string, startCell: string, endCell?: string): string {
  let range = `${sheetId}!${startCell}`;
  if (endCell) {
    range += `:${endCell}`;
  }
  return range;
}

/**
 * 将列索引转换为列字母
 * @param index 列索引 (从 0 开始)
 * @returns 列字母 (如 A, B, ..., Z, AA, AB, ...)
 */
export function columnIndexToLetter(index: number): string {
  let letter = '';
  let temp = index;
  
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  
  return letter;
}

/**
 * 将列字母转换为列索引
 * @param letter 列字母
 * @returns 列索引 (从 0 开始)
 */
export function columnLetterToIndex(letter: string): number {
  let index = 0;
  const upperLetter = letter.toUpperCase();
  
  for (let i = 0; i < upperLetter.length; i++) {
    index = index * 26 + (upperLetter.charCodeAt(i) - 64);
  }
  
  return index - 1;
}

/**
 * 构建单元格地址
 * @param rowIndex 行索引 (从 0 开始)
 * @param columnIndex 列索引 (从 0 开始)
 */
export function buildCellAddress(rowIndex: number, columnIndex: number): string {
  return `${columnIndexToLetter(columnIndex)}${rowIndex + 1}`;
}

/**
 * 解析单元格地址
 * @param address 单元格地址 (如 "A1", "BC123")
 */
export function parseCellAddress(address: string): { rowIndex: number; columnIndex: number } {
  const match = address.match(/^([A-Za-z]+)(\d+)$/);
  if (!match || !match[1] || !match[2]) {
    throw new Error(`无效的单元格地址: ${address}`);
  }
  
  return {
    columnIndex: columnLetterToIndex(match[1]),
    rowIndex: parseInt(match[2], 10) - 1,
  };
}
