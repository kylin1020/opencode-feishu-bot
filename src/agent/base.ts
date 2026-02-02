import type {
  IAgentRuntime,
  AgentEventHandler,
  ModelInfo,
  SendOptions,
} from '../types/agent';

export abstract class BaseAgent implements IAgentRuntime {
  abstract readonly id: string;
  abstract readonly type: string;
  
  protected _initialized = false;
  protected eventHandlers = new Map<string, Set<AgentEventHandler>>();

  get initialized(): boolean {
    return this._initialized;
  }

  abstract initialize(): Promise<void>;
  abstract shutdown(): Promise<void>;
  
  abstract createSession(projectPath: string, model?: string): Promise<string>;
  abstract getOrCreateSession(projectPath: string, model?: string): Promise<string>;
  abstract switchModel(sessionId: string, model: string): Promise<void>;
  abstract clearHistory(sessionId: string): Promise<void>;
  
  abstract send(sessionId: string, message: string, options?: SendOptions): Promise<void>;
  abstract abort(sessionId: string): Promise<boolean>;
  abstract executeCommand(sessionId: string, command: string): Promise<string>;
  abstract summarize(sessionId: string): Promise<boolean>;
  
  abstract listModels(): Promise<ModelInfo[]>;
  abstract getSessionInfo(sessionId: string): Promise<{
    model?: string;
    projectPath?: string;
    messageCount?: number;
  } | null>;

  subscribe(sessionId: string, handler: AgentEventHandler): () => void {
    const key = sessionId;
    if (!this.eventHandlers.has(key)) {
      this.eventHandlers.set(key, new Set());
    }
    this.eventHandlers.get(key)!.add(handler);
    
    return () => this.unsubscribe(sessionId, handler);
  }

  unsubscribe(sessionId: string, handler: AgentEventHandler): void {
    this.eventHandlers.get(sessionId)?.delete(handler);
  }

  protected notifyHandlers(sessionId: string, event: Parameters<AgentEventHandler>[0]): void {
    const handlers = this.eventHandlers.get(sessionId);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error('Error in agent event handler:', err);
        }
      }
    }
  }

  protected setInitialized(value: boolean): void {
    this._initialized = value;
  }
}
