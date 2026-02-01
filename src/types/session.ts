export type SessionKeyType = 'user' | 'chat' | 'user_chat';

export interface SessionKey {
  channelId: string;
  chatId: string;
  userId?: string;
  keyType: SessionKeyType;
}

export interface SessionConfig {
  keyType: SessionKeyType;
  idleTimeoutMs?: number;
  maxHistoryLength?: number;
  autoCompact?: boolean;
  compactThreshold?: number;
}

export type SessionStatus = 'active' | 'idle' | 'processing' | 'error';

export interface SessionState {
  key: SessionKey;
  agentSessionId: string;
  agentId: string;
  status: SessionStatus;
  projectPath: string;
  model?: string;
  createdAt: number;
  lastActiveAt: number;
  messageCount: number;
  metadata?: Record<string, unknown>;
}

export interface SessionGroupInfo {
  chatId: string;
  sessionKey: SessionKey;
  title?: string;
  createdAt: number;
  createdBy: string;
}

export interface CompactionResult {
  success: boolean;
  beforeTokens?: number;
  afterTokens?: number;
  error?: string;
}

export interface ISessionManager {
  getSession(key: SessionKey): SessionState | undefined;
  createSession(key: SessionKey, projectPath: string, model?: string): Promise<SessionState>;
  getOrCreateSession(key: SessionKey, projectPath: string, model?: string): Promise<SessionState>;
  
  updateSession(key: SessionKey, updates: Partial<SessionState>): void;
  deleteSession(key: SessionKey): void;
  
  switchModel(key: SessionKey, model: string): Promise<void>;
  switchProject(key: SessionKey, projectPath: string): Promise<void>;
  switchAgent(key: SessionKey, agentId: string): Promise<void>;
  
  compact(key: SessionKey): Promise<CompactionResult>;
  clearHistory(key: SessionKey): Promise<void>;
  
  isSessionGroup(chatId: string): boolean;
  getSessionGroup(chatId: string): SessionGroupInfo | undefined;
  createSessionGroup(userId: string, projectPath: string): Promise<SessionGroupInfo>;
  deleteSessionGroup(chatId: string): Promise<void>;
  
  getAllSessions(): SessionState[];
  getSessionsByChannel(channelId: string): SessionState[];
  getSessionsByUser(userId: string): SessionState[];
}
