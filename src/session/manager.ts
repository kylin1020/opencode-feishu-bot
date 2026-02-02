import type {
  SessionKey,
  SessionKeyType,
  SessionState,
  SessionStatus,
  SessionConfig,
  SessionGroupInfo,
  CompactionResult,
  ISessionManager,
} from '../types/session';
import type { IAgentRuntime } from '../types/agent';
import type { IChannel } from '../types/channel';
import { logger } from '../utils/logger';

export interface SessionManagerConfig extends SessionConfig {
  persistPath?: string;
  eventDedupeWindowMs?: number;
}

export interface SessionManagerDependencies {
  getAgent: (agentId: string) => IAgentRuntime | undefined;
  getChannel: (channelId: string) => IChannel | undefined;
  createChat?: (name: string, userIds: string[]) => Promise<{ chatId: string } | null>;
  updateChatName?: (chatId: string, name: string) => Promise<boolean>;
  deleteChat?: (chatId: string) => Promise<boolean>;
}

interface ProcessingTask {
  sessionKey: string;
  messageId: string;
  startTime: number;
  abortController?: AbortController;
}

interface EventRecord {
  eventId: string;
  timestamp: number;
}

export class SessionManager implements ISessionManager {
  private sessions = new Map<string, SessionState>();
  private sessionGroups = new Map<string, SessionGroupInfo>();
  private processedEvents = new Map<string, EventRecord>();
  private activeTasks = new Map<string, ProcessingTask>();
  private subtaskMap = new Map<string, Set<string>>();
  
  private config: SessionManagerConfig;
  private deps: SessionManagerDependencies;
  private persistTimer?: ReturnType<typeof setInterval>;

  constructor(config: SessionManagerConfig, deps: SessionManagerDependencies) {
    this.config = {
      keyType: config.keyType || 'chat',
      idleTimeoutMs: config.idleTimeoutMs || 30 * 60 * 1000,
      maxHistoryLength: config.maxHistoryLength || 100,
      autoCompact: config.autoCompact ?? true,
      compactThreshold: config.compactThreshold || 50,
      eventDedupeWindowMs: config.eventDedupeWindowMs || 5 * 60 * 1000,
      persistPath: config.persistPath,
    };
    this.deps = deps;

    this.loadPersistedState();
    this.startPeriodicCleanup();
  }

  private buildKeyString(key: SessionKey): string {
    switch (key.keyType) {
      case 'user':
        return `${key.channelId}:user:${key.userId}`;
      case 'chat':
        return `${key.channelId}:chat:${key.chatId}`;
      case 'user_chat':
        return `${key.channelId}:user_chat:${key.chatId}:${key.userId}`;
      default:
        return `${key.channelId}:chat:${key.chatId}`;
    }
  }

  private parseKeyString(keyStr: string): SessionKey | null {
    const parts = keyStr.split(':');
    if (parts.length < 3) return null;

    const channelId = parts[0]!;
    const keyType = parts[1] as SessionKeyType;

    switch (keyType) {
      case 'user':
        return { channelId, chatId: '', userId: parts[2], keyType };
      case 'chat':
        return { channelId, chatId: parts[2]!, keyType };
      case 'user_chat':
        return { channelId, chatId: parts[2]!, userId: parts[3], keyType };
      default:
        return null;
    }
  }

  getSession(key: SessionKey): SessionState | undefined {
    const keyStr = this.buildKeyString(key);
    return this.sessions.get(keyStr);
  }

  async createSession(key: SessionKey, projectPath: string, model?: string): Promise<SessionState> {
    const keyStr = this.buildKeyString(key);
    const existingSession = this.sessions.get(keyStr);
    
    if (existingSession) {
      logger.debug('Session already exists', { key: keyStr });
      return existingSession;
    }

    const agentId = 'opencode';
    const agent = this.deps.getAgent(agentId);
    
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const agentSessionId = await agent.createSession(projectPath, model);

    const session: SessionState = {
      key,
      agentSessionId,
      agentId,
      status: 'active',
      projectPath,
      model,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      messageCount: 0,
    };

    this.sessions.set(keyStr, session);
    this.persistState();

    logger.info('Session created', { key: keyStr, agentSessionId });
    return session;
  }

  async getOrCreateSession(key: SessionKey, projectPath: string, model?: string): Promise<SessionState> {
    const existing = this.getSession(key);
    if (existing) {
      existing.lastActiveAt = Date.now();
      return existing;
    }
    return this.createSession(key, projectPath, model);
  }

  updateSession(key: SessionKey, updates: Partial<SessionState>): void {
    const keyStr = this.buildKeyString(key);
    const session = this.sessions.get(keyStr);
    
    if (session) {
      Object.assign(session, updates, { lastActiveAt: Date.now() });
      this.persistState();
    }
  }

  deleteSession(key: SessionKey): void {
    const keyStr = this.buildKeyString(key);
    this.sessions.delete(keyStr);
    this.activeTasks.delete(keyStr);
    this.subtaskMap.delete(keyStr);
    this.persistState();
    logger.info('Session deleted', { key: keyStr });
  }

  async switchModel(key: SessionKey, model: string): Promise<void> {
    const session = this.getSession(key);
    if (!session) {
      throw new Error('Session not found');
    }

    const agent = this.deps.getAgent(session.agentId);
    if (!agent) {
      throw new Error('Agent not found');
    }

    await agent.switchModel(session.agentSessionId, model);
    session.model = model;
    session.lastActiveAt = Date.now();
    this.persistState();
  }

  async switchProject(key: SessionKey, projectPath: string): Promise<void> {
    const keyStr = this.buildKeyString(key);
    const oldSession = this.sessions.get(keyStr);
    
    if (oldSession) {
      this.sessions.delete(keyStr);
      this.activeTasks.delete(keyStr);
    }

    await this.createSession(key, projectPath, oldSession?.model);
  }

  async switchAgent(key: SessionKey, agentId: string): Promise<void> {
    const session = this.getSession(key);
    if (!session) {
      throw new Error('Session not found');
    }

    const newAgent = this.deps.getAgent(agentId);
    if (!newAgent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const newSessionId = await newAgent.createSession(session.projectPath, session.model);
    session.agentId = agentId;
    session.agentSessionId = newSessionId;
    session.lastActiveAt = Date.now();
    this.persistState();
  }

  async compact(key: SessionKey): Promise<CompactionResult> {
    const session = this.getSession(key);
    if (!session) {
      return { success: false, error: 'Session not found' };
    }

    const agent = this.deps.getAgent(session.agentId);
    if (!agent) {
      return { success: false, error: 'Agent not found' };
    }

    const success = await agent.summarize(session.agentSessionId);
    return { success };
  }

  async clearHistory(key: SessionKey): Promise<void> {
    const keyStr = this.buildKeyString(key);
    const session = this.sessions.get(keyStr);
    
    if (session) {
      const agent = this.deps.getAgent(session.agentId);
      if (agent) {
        const newSessionId = await agent.createSession(session.projectPath, session.model);
        session.agentSessionId = newSessionId;
        session.messageCount = 0;
        session.lastActiveAt = Date.now();
        this.persistState();
      }
    }
  }

  isSessionGroup(chatId: string): boolean {
    return this.sessionGroups.has(chatId);
  }

  getSessionGroup(chatId: string): SessionGroupInfo | undefined {
    return this.sessionGroups.get(chatId);
  }

  async createSessionGroup(userId: string, projectPath: string): Promise<SessionGroupInfo> {
    if (!this.deps.createChat) {
      throw new Error('createChat not configured');
    }

    const result = await this.deps.createChat('新会话', [userId]);
    if (!result) {
      throw new Error('Failed to create chat');
    }

    const sessionKey: SessionKey = {
      channelId: 'feishu',
      chatId: result.chatId,
      keyType: 'chat',
    };

    await this.createSession(sessionKey, projectPath);

    const groupInfo: SessionGroupInfo = {
      chatId: result.chatId,
      sessionKey,
      createdAt: Date.now(),
      createdBy: userId,
    };

    this.sessionGroups.set(result.chatId, groupInfo);
    this.persistState();

    return groupInfo;
  }

  async deleteSessionGroup(chatId: string): Promise<void> {
    const groupInfo = this.sessionGroups.get(chatId);
    if (!groupInfo) return;

    this.deleteSession(groupInfo.sessionKey);
    this.sessionGroups.delete(chatId);

    if (this.deps.deleteChat) {
      await this.deps.deleteChat(chatId);
    }

    this.persistState();
  }

  async updateSessionGroupTitle(chatId: string, title: string): Promise<void> {
    const groupInfo = this.sessionGroups.get(chatId);
    if (!groupInfo) return;

    groupInfo.title = title;

    if (this.deps.updateChatName) {
      const sessionId = this.getSession(groupInfo.sessionKey)?.agentSessionId || '';
      const shortId = sessionId.slice(0, 6);
      const fullTitle = `o${shortId}-${title}`;
      await this.deps.updateChatName(chatId, fullTitle);
    }

    this.persistState();
  }

  getAllSessions(): SessionState[] {
    return Array.from(this.sessions.values());
  }

  getSessionsByChannel(channelId: string): SessionState[] {
    return this.getAllSessions().filter(s => s.key.channelId === channelId);
  }

  getSessionsByUser(userId: string): SessionState[] {
    return this.getAllSessions().filter(s => s.key.userId === userId);
  }

  isDuplicateEvent(eventId: string): boolean {
    const existing = this.processedEvents.get(eventId);
    if (!existing) return false;
    
    const windowMs = this.config.eventDedupeWindowMs || 5 * 60 * 1000;
    return Date.now() - existing.timestamp < windowMs;
  }

  markEventProcessed(eventId: string): void {
    this.processedEvents.set(eventId, {
      eventId,
      timestamp: Date.now(),
    });
  }

  startTask(key: SessionKey, messageId: string): AbortController {
    const keyStr = this.buildKeyString(key);
    const controller = new AbortController();

    const task: ProcessingTask = {
      sessionKey: keyStr,
      messageId,
      startTime: Date.now(),
      abortController: controller,
    };

    this.activeTasks.set(keyStr, task);

    const session = this.sessions.get(keyStr);
    if (session) {
      session.status = 'processing';
    }

    return controller;
  }

  completeTask(key: SessionKey): void {
    const keyStr = this.buildKeyString(key);
    this.activeTasks.delete(keyStr);

    const session = this.sessions.get(keyStr);
    if (session) {
      session.status = 'active';
      session.messageCount++;
      session.lastActiveAt = Date.now();
    }
  }

  abortTask(key: SessionKey): boolean {
    const keyStr = this.buildKeyString(key);
    const task = this.activeTasks.get(keyStr);
    
    if (task?.abortController) {
      task.abortController.abort();
      this.activeTasks.delete(keyStr);
      
      const session = this.sessions.get(keyStr);
      if (session) {
        session.status = 'active';
      }
      
      return true;
    }
    
    return false;
  }

  getActiveTask(key: SessionKey): ProcessingTask | undefined {
    const keyStr = this.buildKeyString(key);
    return this.activeTasks.get(keyStr);
  }

  registerSubtask(key: SessionKey, subtaskId: string): void {
    const keyStr = this.buildKeyString(key);
    let subtasks = this.subtaskMap.get(keyStr);
    if (!subtasks) {
      subtasks = new Set();
      this.subtaskMap.set(keyStr, subtasks);
    }
    subtasks.add(subtaskId);
  }

  completeSubtask(key: SessionKey, subtaskId: string): void {
    const keyStr = this.buildKeyString(key);
    const subtasks = this.subtaskMap.get(keyStr);
    if (subtasks) {
      subtasks.delete(subtaskId);
    }
  }

  getActiveSubtasks(key: SessionKey): string[] {
    const keyStr = this.buildKeyString(key);
    const subtasks = this.subtaskMap.get(keyStr);
    return subtasks ? Array.from(subtasks) : [];
  }

  private loadPersistedState(): void {
    if (!this.config.persistPath) return;

    try {
      const file = Bun.file(this.config.persistPath);
      if (!file.size) return;

      const data = JSON.parse(file.toString()) as {
        sessions: Array<{ key: string; state: SessionState }>;
        groups: Array<{ chatId: string; info: SessionGroupInfo }>;
      };

      for (const { key, state } of data.sessions || []) {
        this.sessions.set(key, state);
      }

      for (const { chatId, info } of data.groups || []) {
        this.sessionGroups.set(chatId, info);
      }

      logger.info('Loaded persisted session state', {
        sessions: this.sessions.size,
        groups: this.sessionGroups.size,
      });
    } catch {
      logger.debug('No persisted state to load');
    }
  }

  private persistState(): void {
    if (!this.config.persistPath) return;

    const data = {
      sessions: Array.from(this.sessions.entries()).map(([key, state]) => ({ key, state })),
      groups: Array.from(this.sessionGroups.entries()).map(([chatId, info]) => ({ chatId, info })),
    };

    try {
      Bun.write(this.config.persistPath, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error('Failed to persist session state', { error });
    }
  }

  private startPeriodicCleanup(): void {
    const cleanupInterval = 60 * 1000;
    
    this.persistTimer = setInterval(() => {
      this.cleanupStaleEvents();
      this.cleanupIdleSessions();
    }, cleanupInterval);
  }

  private cleanupStaleEvents(): void {
    const now = Date.now();
    const windowMs = this.config.eventDedupeWindowMs || 5 * 60 * 1000;

    for (const [eventId, record] of this.processedEvents) {
      if (now - record.timestamp > windowMs) {
        this.processedEvents.delete(eventId);
      }
    }
  }

  private cleanupIdleSessions(): void {
    const now = Date.now();
    const idleTimeout = this.config.idleTimeoutMs || 30 * 60 * 1000;

    for (const [keyStr, session] of this.sessions) {
      if (now - session.lastActiveAt > idleTimeout && session.status !== 'processing') {
        logger.debug('Cleaning up idle session', { key: keyStr });
      }
    }
  }

  shutdown(): void {
    if (this.persistTimer) {
      clearInterval(this.persistTimer);
    }
    this.persistState();
  }
}

export function createSessionManager(
  config: SessionManagerConfig,
  deps: SessionManagerDependencies
): SessionManager {
  return new SessionManager(config, deps);
}
