import type { IChannel, MessageEvent, AnyChannelEvent } from '../types/channel';
import type { IAgentRuntime, AnyAgentEvent } from '../types/agent';
import type { UnifiedMessage, MessageContext } from '../types/message';
import { BindingsRouter } from './router';
import type { Binding, BindingContext } from '../types/binding';
import { LaneQueue } from '../queue/lane-queue';
import { logger } from '../utils/logger';

export interface GatewayConfig {
  defaultAgent: string;
  bindings?: Binding[];
  maxConcurrency?: number;
}

export class Gateway {
  private channels = new Map<string, IChannel>();
  private agents = new Map<string, IAgentRuntime>();
  private router: BindingsRouter;
  private queue: LaneQueue;
  private config: GatewayConfig;
  private started = false;

  constructor(config: GatewayConfig) {
    this.config = config;
    this.router = new BindingsRouter(config.defaultAgent);
    this.queue = new LaneQueue({
      maxConcurrency: config.maxConcurrency ?? 10,
    });

    if (config.bindings) {
      for (const binding of config.bindings) {
        this.router.addBinding(binding);
      }
    }
  }

  registerChannel(channel: IChannel): void {
    if (this.channels.has(channel.id)) {
      throw new Error(`Channel ${channel.id} already registered`);
    }
    
    this.channels.set(channel.id, channel);
    this.setupChannelHandlers(channel);
    logger.info('Channel registered', { channelId: channel.id, type: channel.type });
  }

  unregisterChannel(channelId: string): void {
    const channel = this.channels.get(channelId);
    if (channel) {
      this.channels.delete(channelId);
      logger.info('Channel unregistered', { channelId });
    }
  }

  registerAgent(agent: IAgentRuntime): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent ${agent.id} already registered`);
    }
    
    this.agents.set(agent.id, agent);
    logger.info('Agent registered', { agentId: agent.id, type: agent.type });
  }

  unregisterAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      this.agents.delete(agentId);
      logger.info('Agent unregistered', { agentId });
    }
  }

  getChannel(id: string): IChannel | undefined {
    return this.channels.get(id);
  }

  getAgent(id: string): IAgentRuntime | undefined {
    return this.agents.get(id);
  }

  getRouter(): BindingsRouter {
    return this.router;
  }

  getQueue(): LaneQueue {
    return this.queue;
  }

  async start(): Promise<void> {
    if (this.started) return;

    for (const agent of this.agents.values()) {
      if (!agent.initialized) {
        await agent.initialize();
      }
    }

    for (const channel of this.channels.values()) {
      if (!channel.isConnected()) {
        await channel.connect();
      }
    }

    this.started = true;
    logger.info('Gateway started', {
      channels: Array.from(this.channels.keys()),
      agents: Array.from(this.agents.keys()),
    });
  }

  async stop(): Promise<void> {
    if (!this.started) return;

    for (const channel of this.channels.values()) {
      if (channel.isConnected()) {
        await channel.disconnect();
      }
    }

    for (const agent of this.agents.values()) {
      if (agent.initialized) {
        await agent.shutdown();
      }
    }

    this.started = false;
    logger.info('Gateway stopped');
  }

  isStarted(): boolean {
    return this.started;
  }

  private setupChannelHandlers(channel: IChannel): void {
    channel.on('message', async (event) => {
      await this.handleMessage(channel, event as MessageEvent);
    });
  }

  private async handleMessage(channel: IChannel, event: MessageEvent): Promise<void> {
    const context: BindingContext = {
      channelId: channel.id,
      channelType: channel.type,
      chatId: event.chatId,
      chatType: event.chatType,
      userId: event.senderId,
      messageText: event.content,
    };

    const routeResult = this.router.route(context);
    const agent = this.agents.get(routeResult.agentId);
    
    if (!agent) {
      logger.warn('No agent found for message', { 
        agentId: routeResult.agentId, 
        chatId: event.chatId 
      });
      return;
    }

    const sessionKey = `${channel.id}:${event.chatId}`;
    
    await this.queue.enqueue(sessionKey, async () => {
      await this.processMessage(channel, agent, event, context);
    });
  }

  private async processMessage(
    channel: IChannel,
    agent: IAgentRuntime,
    event: MessageEvent,
    context: BindingContext
  ): Promise<void> {
    try {
      const sessionId = await agent.getOrCreateSession(process.cwd());
      
      await agent.send(sessionId, event.content);
      
    } catch (error) {
      logger.error('Error processing message', { 
        channelId: channel.id, 
        chatId: event.chatId,
        error 
      });
    }
  }
}
