import type { Binding, BindingMatch, BindingContext, BindingResult, IBindingsRouter } from '../types/binding';

export class BindingsRouter implements IBindingsRouter {
  private bindings: Binding[] = [];
  private defaultAgent: string;

  constructor(defaultAgent: string) {
    this.defaultAgent = defaultAgent;
  }

  addBinding(binding: Binding): void {
    this.bindings.push(binding);
    this.sortBindings();
  }

  removeBinding(id: string): void {
    this.bindings = this.bindings.filter(b => b.id !== id);
  }

  updateBinding(id: string, updates: Partial<Binding>): void {
    const index = this.bindings.findIndex(b => b.id === id);
    if (index !== -1) {
      this.bindings[index] = { ...this.bindings[index]!, ...updates };
      this.sortBindings();
    }
  }

  route(context: BindingContext): BindingResult {
    for (const binding of this.bindings) {
      if (!binding.enabled) continue;
      
      const matchedBy = this.matchBinding(binding, context);
      if (matchedBy.length > 0) {
        return {
          binding,
          agentId: binding.agentId,
          matchedBy,
        };
      }
    }

    return {
      binding: {
        id: 'default',
        agentId: this.defaultAgent,
        priority: -1,
        enabled: true,
        match: {},
      },
      agentId: this.defaultAgent,
      matchedBy: ['default'],
    };
  }

  getBindings(): Binding[] {
    return [...this.bindings];
  }

  getBinding(id: string): Binding | undefined {
    return this.bindings.find(b => b.id === id);
  }

  getBindingsByAgent(agentId: string): Binding[] {
    return this.bindings.filter(b => b.agentId === agentId);
  }

  setDefaultAgent(agentId: string): void {
    this.defaultAgent = agentId;
  }

  private sortBindings(): void {
    this.bindings.sort((a, b) => b.priority - a.priority);
  }

  private matchBinding(binding: Binding, context: BindingContext): string[] {
    const match = binding.match;
    if (!match) return ['wildcard'];

    const matchedBy: string[] = [];

    if (match.channelId !== undefined) {
      if (!this.matchValue(match.channelId, context.channelId)) return [];
      matchedBy.push('channelId');
    }

    if (match.channelType !== undefined) {
      if (!this.matchValue(match.channelType, context.channelType)) return [];
      matchedBy.push('channelType');
    }

    if (match.chatType !== undefined && match.chatType !== '*') {
      if (match.chatType !== context.chatType) return [];
      matchedBy.push('chatType');
    }

    if (match.chatId !== undefined) {
      if (!this.matchValue(match.chatId, context.chatId)) return [];
      matchedBy.push('chatId');
    }

    if (match.userId !== undefined) {
      if (!this.matchValue(match.userId, context.userId)) return [];
      matchedBy.push('userId');
    }

    if (match.messagePattern !== undefined && context.messageText) {
      const pattern = typeof match.messagePattern === 'string' 
        ? new RegExp(match.messagePattern) 
        : match.messagePattern;
      if (!pattern.test(context.messageText)) return [];
      matchedBy.push('messagePattern');
    }

    if (match.custom !== undefined) {
      if (!match.custom(context)) return [];
      matchedBy.push('custom');
    }

    return matchedBy.length > 0 ? matchedBy : ['wildcard'];
  }

  private matchValue(pattern: string | string[], value: string): boolean {
    if (Array.isArray(pattern)) {
      return pattern.includes(value);
    }
    return pattern === value;
  }
}
