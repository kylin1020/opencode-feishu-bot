import type { IChannel } from '../types/channel';
import type { IAgentRuntime } from '../types/agent';
import { BindingsRouter } from './router';
import type { Binding } from '../types/binding';
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
}
