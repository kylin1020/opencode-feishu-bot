import { BaseAgent } from './base';
import type { ModelInfo, SendOptions, AnyAgentEvent } from '../types/agent';
import {
  OpencodeWrapper,
  createOpencodeWrapper,
  extractTextFromPart,
  extractToolCallFromPart,
  extractSubtaskFromPart,
  parseModelId,
  type OpencodeEventData,
} from '../opencode/client';
import { logger } from '../utils/logger';

export interface OpencodeAgentConfig {
  directory?: string;
}

export class OpencodeAgent extends BaseAgent {
  readonly id = 'opencode';
  readonly type = 'opencode';

  private wrapper: OpencodeWrapper;
  private sessionUnsubscribers = new Map<string, () => void>();
  private sessionModels = new Map<string, string>();
  private sessionProjects = new Map<string, string>();

  constructor(config: OpencodeAgentConfig = {}) {
    super();
    this.wrapper = createOpencodeWrapper({ directory: config.directory });
  }

  async initialize(): Promise<void> {
    if (this._initialized) return;
    
    await this.wrapper.start();
    this.setInitialized(true);
    logger.info('OpencodeAgent initialized');
  }

  async shutdown(): Promise<void> {
    for (const unsub of this.sessionUnsubscribers.values()) {
      unsub();
    }
    this.sessionUnsubscribers.clear();
    this.wrapper.stop();
    this.setInitialized(false);
    logger.info('OpencodeAgent shutdown');
  }

  async createSession(projectPath: string, model?: string): Promise<string> {
    this.ensureInitialized();
    const sessionId = await this.wrapper.createSession();
    
    this.sessionProjects.set(sessionId, projectPath);
    if (model) {
      this.sessionModels.set(sessionId, model);
    }
    
    this.setupEventSubscription(sessionId);
    
    this.notifyHandlers(sessionId, {
      type: 'session.created',
      sessionId,
      timestamp: Date.now(),
      projectPath,
      model,
    });
    
    return sessionId;
  }

  async getOrCreateSession(projectPath: string, model?: string): Promise<string> {
    return this.createSession(projectPath, model);
  }

  async switchModel(sessionId: string, model: string): Promise<void> {
    this.sessionModels.set(sessionId, model);
  }

  async clearHistory(sessionId: string): Promise<void> {
    logger.info('Clear history requested', { sessionId });
  }

  async send(sessionId: string, message: string, options?: SendOptions): Promise<void> {
    this.ensureInitialized();
    
    const model = this.sessionModels.get(sessionId);
    const modelSelection = model ? parseModelId(model) : undefined;
    
    const images = options?.images?.map(img => ({
      data: img.data,
      mimeType: img.mimeType,
      filename: img.filename,
    }));
    
    await this.wrapper.sendPrompt(
      sessionId, 
      message, 
      images, 
      modelSelection ?? undefined
    );
  }

  async abort(sessionId: string): Promise<boolean> {
    this.ensureInitialized();
    return this.wrapper.abortSession(sessionId);
  }

  async executeCommand(sessionId: string, command: string): Promise<string> {
    this.ensureInitialized();
    
    if (command.startsWith('/')) {
      const [cmd, ...args] = command.slice(1).split(' ');
      const success = await this.wrapper.executeCommand(sessionId, cmd!, args.join(' '));
      return success ? 'Command executed' : 'Command failed';
    }
    
    if (command.startsWith('!')) {
      const shellCmd = command.slice(1);
      const model = this.sessionModels.get(sessionId);
      const modelSelection = model ? parseModelId(model) : undefined;
      const success = await this.wrapper.executeShell(sessionId, shellCmd, modelSelection ?? undefined);
      return success ? 'Shell command executed' : 'Shell command failed';
    }
    
    return 'Unknown command format';
  }

  async listModels(): Promise<ModelInfo[]> {
    this.ensureInitialized();
    const models = await this.wrapper.listModels();
    
    return models.map(m => ({
      id: m.id,
      name: m.name,
      provider: m.providerId,
    }));
  }

  async getSessionInfo(sessionId: string): Promise<{
    model?: string;
    projectPath?: string;
    messageCount?: number;
  } | null> {
    const detail = await this.wrapper.getSessionDetail(sessionId);
    if (!detail) return null;
    
    const messages = await this.wrapper.getSessionMessages(sessionId);
    
    return {
      model: this.sessionModels.get(sessionId),
      projectPath: this.sessionProjects.get(sessionId),
      messageCount: messages.length,
    };
  }

  async summarize(sessionId: string): Promise<boolean> {
    this.ensureInitialized();
    const model = this.sessionModels.get(sessionId);
    const modelSelection = model ? parseModelId(model) : undefined;
    return this.wrapper.summarizeSession(sessionId, modelSelection ?? undefined);
  }

  async replyQuestion(requestId: string, answers: string[][]): Promise<boolean> {
    return this.wrapper.replyQuestion(requestId, answers);
  }

  async rejectQuestion(requestId: string): Promise<boolean> {
    return this.wrapper.rejectQuestion(requestId);
  }

  getWrapper(): OpencodeWrapper {
    return this.wrapper;
  }

  private ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('OpencodeAgent not initialized. Call initialize() first.');
    }
  }

  private setupEventSubscription(sessionId: string): void {
    this.wrapper.subscribeToEvents(sessionId, (event) => {
      this.handleOpencodeEvent(sessionId, event);
    }).then(unsub => {
      this.sessionUnsubscribers.set(sessionId, unsub);
    });
  }

  private handleOpencodeEvent(sessionId: string, event: OpencodeEventData): void {
    const properties = event.properties;
    const part = properties.part as Record<string, unknown> | undefined;

    switch (event.type) {
      case 'assistant.thinking':
        this.notifyHandlers(sessionId, {
          type: 'thinking.delta',
          sessionId,
          timestamp: Date.now(),
          delta: (part?.text as string) ?? '',
        });
        break;

      case 'assistant.text':
        this.notifyHandlers(sessionId, {
          type: 'message.delta',
          sessionId,
          timestamp: Date.now(),
          messageId: (properties.messageID as string) ?? '',
          delta: (part?.text as string) ?? '',
        });
        break;

      case 'assistant.tool':
        const toolInfo = extractToolCallFromPart(part);
        if (toolInfo) {
          const toolEvent: AnyAgentEvent = toolInfo.state === 'completed' || toolInfo.state === 'error'
            ? {
                type: 'tool.complete',
                sessionId,
                timestamp: Date.now(),
                toolCallId: toolInfo.name,
                toolName: toolInfo.name,
                success: toolInfo.state === 'completed',
                output: toolInfo.output,
                error: toolInfo.error,
              }
            : {
                type: 'tool.start',
                sessionId,
                timestamp: Date.now(),
                toolCallId: toolInfo.name,
                toolName: toolInfo.name,
                input: toolInfo.input,
              };
          this.notifyHandlers(sessionId, toolEvent);
        }
        break;

      case 'message.completed':
        this.notifyHandlers(sessionId, {
          type: 'message.complete',
          sessionId,
          timestamp: Date.now(),
          messageId: (properties.messageID as string) ?? '',
          content: [],
        });
        break;

      case 'session.error':
        this.notifyHandlers(sessionId, {
          type: 'error',
          sessionId,
          timestamp: Date.now(),
          message: (properties.error as string) ?? 'Unknown error',
          recoverable: false,
        });
        break;
    }
  }
}
