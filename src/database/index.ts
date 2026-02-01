/**
 * 数据库模块
 * 使用 bun:sqlite 管理用户会话、白名单和事件去重
 */
import { Database } from 'bun:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 用户会话记录 */
export interface UserSession {
  chat_id: string;
  session_id: string;
  project_path: string;
  created_at: string;
  updated_at: string;
}

/** 白名单用户记录 */
export interface WhitelistUser {
  user_id: string;
  added_by: string;
  added_at: string;
}

/** 项目路径映射 */
export interface ProjectMapping {
  chat_id: string;
  project_path: string;
  updated_at: string;
}

/** 事件去重记录 */
export interface EventDedup {
  event_id: string;
  processed_at: string;
}

/** 消息映射记录 */
export interface MessageMapping {
  user_message_id: string;
  bot_message_id: string | null;
  chat_id: string;
  created_at: string;
}

/** 待处理问题记录 */
export interface PendingQuestionRecord {
  chat_id: string;
  request_id: string;
  message_id: string;
  questions: string;
  answers: string;
  created_at: string;
}

/** 会话群记录 */
export interface SessionChat {
  chat_id: string;
  session_id: string;
  owner_id: string;
  project_path: string;
  model: string | null;
  title: string | null;
  title_set: boolean;
  created_at: string;
  updated_at: string;
}

/** 机器人数据库操作类 */
export class BotDatabase {
  private db: Database;
  private dedupWindowMs: number;

  constructor(dbPath: string, dedupWindowMs = 5 * 60 * 1000) {
    // 确保数据库目录存在
    if (dbPath !== ':memory:') {
      const dir = dirname(dbPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
    
    this.db = new Database(dbPath);
    this.dedupWindowMs = dedupWindowMs;
    this.initialize();
  }

  private initialize(): void {
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    this.db.exec(schema);
    this.runMigrations();
  }

  private runMigrations(): void {
    const columns = this.db.prepare<{ name: string }, []>(
      "PRAGMA table_info(session_chats)"
    ).all();
    
    const hasModelColumn = columns.some(col => col.name === 'model');
    if (!hasModelColumn) {
      this.db.exec("ALTER TABLE session_chats ADD COLUMN model TEXT");
    }
  }

  /** 获取用户会话 */
  getSession(chatId: string): UserSession | null {
    const stmt = this.db.prepare<UserSession, [string]>(
      'SELECT * FROM user_sessions WHERE chat_id = ?'
    );
    return stmt.get(chatId) ?? null;
  }

  /** 创建或更新用户会话 */
  upsertSession(chatId: string, sessionId: string, projectPath: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO user_sessions (chat_id, session_id, project_path, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(chat_id) DO UPDATE SET
        session_id = excluded.session_id,
        project_path = excluded.project_path,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(chatId, sessionId, projectPath);
  }

  /** 删除用户会话 */
  deleteSession(chatId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM user_sessions WHERE chat_id = ?');
    const result = stmt.run(chatId);
    return result.changes > 0;
  }

  /** 检查用户是否在白名单中 */
  isUserWhitelisted(userId: string): boolean {
    const stmt = this.db.prepare<{ count: number }, [string]>(
      'SELECT COUNT(*) as count FROM user_whitelist WHERE user_id = ?'
    );
    const result = stmt.get(userId);
    return (result?.count ?? 0) > 0;
  }

  /** 添加用户到白名单 */
  addToWhitelist(userId: string, addedBy: string): boolean {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO user_whitelist (user_id, added_by)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO NOTHING
      `);
      const result = stmt.run(userId, addedBy);
      return result.changes > 0;
    } catch {
      return false;
    }
  }

  /** 从白名单移除用户 */
  removeFromWhitelist(userId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM user_whitelist WHERE user_id = ?');
    const result = stmt.run(userId);
    return result.changes > 0;
  }

  /** 获取所有白名单用户 */
  getWhitelistedUsers(): WhitelistUser[] {
    const stmt = this.db.prepare<WhitelistUser, []>('SELECT * FROM user_whitelist');
    return stmt.all();
  }

  /** 获取聊天的项目路径 */
  getProjectPath(chatId: string): string | null {
    const stmt = this.db.prepare<ProjectMapping, [string]>(
      'SELECT * FROM project_mappings WHERE chat_id = ?'
    );
    const result = stmt.get(chatId);
    return result?.project_path ?? null;
  }

  /** 设置聊天的项目路径 */
  setProjectPath(chatId: string, projectPath: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO project_mappings (chat_id, project_path, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(chat_id) DO UPDATE SET
        project_path = excluded.project_path,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(chatId, projectPath);
  }

  /** 检查事件是否已处理（用于去重） */
  isEventProcessed(eventId: string): boolean {
    const stmt = this.db.prepare<{ count: number }, [string]>(
      'SELECT COUNT(*) as count FROM event_dedup WHERE event_id = ?'
    );
    const result = stmt.get(eventId);
    return (result?.count ?? 0) > 0;
  }

  /** 标记事件为已处理 */
  markEventProcessed(eventId: string): boolean {
    if (this.isEventProcessed(eventId)) {
      return false;
    }
    
    const stmt = this.db.prepare('INSERT INTO event_dedup (event_id) VALUES (?)');
    stmt.run(eventId);
    return true;
  }

  /** 清理过期的事件记录 */
  cleanupOldEvents(): number {
    const cutoff = new Date(Date.now() - this.dedupWindowMs).toISOString();
    const stmt = this.db.prepare('DELETE FROM event_dedup WHERE processed_at < ?');
    const result = stmt.run(cutoff);
    return result.changes;
  }

  saveMessageMapping(userMessageId: string, chatId: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO message_mappings (user_message_id, chat_id)
      VALUES (?, ?)
    `);
    stmt.run(userMessageId, chatId);
  }

  updateBotMessageId(userMessageId: string, botMessageId: string): void {
    const stmt = this.db.prepare(`
      UPDATE message_mappings SET bot_message_id = ? WHERE user_message_id = ?
    `);
    stmt.run(botMessageId, userMessageId);
  }

  getMessageMapping(userMessageId: string): MessageMapping | null {
    const stmt = this.db.prepare<MessageMapping, [string]>(
      'SELECT * FROM message_mappings WHERE user_message_id = ?'
    );
    return stmt.get(userMessageId) ?? null;
  }

  deleteMessageMapping(userMessageId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM message_mappings WHERE user_message_id = ?');
    const result = stmt.run(userMessageId);
    return result.changes > 0;
  }

  getMessageMappingsAfter(userMessageId: string, chatId: string): MessageMapping[] {
    const targetMapping = this.getMessageMapping(userMessageId);
    if (!targetMapping) {
      return [];
    }

    const stmt = this.db.prepare<MessageMapping, [string, string]>(`
      SELECT * FROM message_mappings 
      WHERE chat_id = ? AND created_at >= ?
      ORDER BY created_at ASC
    `);
    return stmt.all(chatId, targetMapping.created_at);
  }

  deleteMessageMappings(userMessageIds: string[]): number {
    if (userMessageIds.length === 0) return 0;
    
    const placeholders = userMessageIds.map(() => '?').join(',');
    const stmt = this.db.prepare(`DELETE FROM message_mappings WHERE user_message_id IN (${placeholders})`);
    const result = stmt.run(...userMessageIds);
    return result.changes;
  }

  deleteMessageMappingsByChatId(chatId: string): number {
    const stmt = this.db.prepare('DELETE FROM message_mappings WHERE chat_id = ?');
    const result = stmt.run(chatId);
    return result.changes;
  }

  cleanupOldMessageMappings(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const stmt = this.db.prepare('DELETE FROM message_mappings WHERE created_at < ?');
    const result = stmt.run(cutoff);
    return result.changes;
  }

  createSessionChat(chatId: string, sessionId: string, ownerId: string, projectPath: string, model?: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO session_chats (chat_id, session_id, owner_id, project_path, model)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(chatId, sessionId, ownerId, projectPath, model ?? null);
  }

  getSessionChat(chatId: string): SessionChat | null {
    const stmt = this.db.prepare<SessionChat, [string]>(
      'SELECT * FROM session_chats WHERE chat_id = ?'
    );
    return stmt.get(chatId) ?? null;
  }

  getSessionChatsByOwner(ownerId: string): SessionChat[] {
    const stmt = this.db.prepare<SessionChat, [string]>(
      'SELECT * FROM session_chats WHERE owner_id = ? ORDER BY created_at DESC'
    );
    return stmt.all(ownerId);
  }

  updateSessionChatTitle(chatId: string, title: string): void {
    const stmt = this.db.prepare(`
      UPDATE session_chats 
      SET title = ?, title_set = TRUE, updated_at = CURRENT_TIMESTAMP 
      WHERE chat_id = ?
    `);
    stmt.run(title, chatId);
  }

  updateSessionChatModel(chatId: string, model: string): void {
    const stmt = this.db.prepare(`
      UPDATE session_chats 
      SET model = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE chat_id = ?
    `);
    stmt.run(model, chatId);
  }

  deleteSessionChat(chatId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM session_chats WHERE chat_id = ?');
    const result = stmt.run(chatId);
    return result.changes > 0;
  }

  isSessionChat(chatId: string): boolean {
    const stmt = this.db.prepare<{ count: number }, [string]>(
      'SELECT COUNT(*) as count FROM session_chats WHERE chat_id = ?'
    );
    const result = stmt.get(chatId);
    return (result?.count ?? 0) > 0;
  }

  savePendingQuestion(
    chatId: string,
    requestId: string,
    messageId: string,
    questions: unknown[],
    answers: (string | null)[]
  ): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO pending_questions (chat_id, request_id, message_id, questions, answers)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(chatId, requestId, messageId, JSON.stringify(questions), JSON.stringify(answers));
  }

  getPendingQuestion(chatId: string): PendingQuestionRecord | null {
    const stmt = this.db.prepare<PendingQuestionRecord, [string]>(
      'SELECT * FROM pending_questions WHERE chat_id = ?'
    );
    return stmt.get(chatId) ?? null;
  }

  updatePendingQuestionAnswers(chatId: string, answers: (string | null)[]): void {
    const stmt = this.db.prepare(`
      UPDATE pending_questions SET answers = ? WHERE chat_id = ?
    `);
    stmt.run(JSON.stringify(answers), chatId);
  }

  deletePendingQuestion(chatId: string): boolean {
    const stmt = this.db.prepare('DELETE FROM pending_questions WHERE chat_id = ?');
    const result = stmt.run(chatId);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}

let defaultDb: BotDatabase | null = null;

/** 初始化数据库 */
export function initializeDatabase(dbPath: string): BotDatabase {
  if (defaultDb) {
    defaultDb.close();
  }
  defaultDb = new BotDatabase(dbPath);
  return defaultDb;
}

/** 获取默认数据库实例 */
export function getDatabase(): BotDatabase {
  if (!defaultDb) {
    throw new Error('数据库未初始化，请先调用 initializeDatabase()');
  }
  return defaultDb;
}
