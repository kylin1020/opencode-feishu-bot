export interface BindingMatch {
  channelId?: string | string[];
  channelType?: string | string[];
  chatType?: 'private' | 'group' | '*';
  chatId?: string | string[];
  userId?: string | string[];
  messagePattern?: string | RegExp;
  custom?: (context: BindingContext) => boolean;
}

export interface Binding {
  id: string;
  name?: string;
  match?: BindingMatch;
  agentId: string;
  priority: number;
  enabled: boolean;
}

export interface BindingContext {
  channelId: string;
  channelType: string;
  chatId: string;
  chatType: 'private' | 'group';
  userId: string;
  messageText?: string;
  metadata?: Record<string, unknown>;
}

export interface BindingResult {
  binding: Binding;
  agentId: string;
  matchedBy: string[];
}

export interface BindingsConfig {
  defaultAgent: string;
  bindings: Binding[];
}

export interface IBindingsRouter {
  addBinding(binding: Binding): void;
  removeBinding(id: string): void;
  updateBinding(id: string, updates: Partial<Binding>): void;
  
  route(context: BindingContext): BindingResult;
  
  getBindings(): Binding[];
  getBinding(id: string): Binding | undefined;
  getBindingsByAgent(agentId: string): Binding[];
}
