import type {
  HookEventType,
  AnyHookEvent,
  HookHandler,
  HookRegistration,
  HookManager,
} from '../types/hook';
import { logger } from '../utils/logger';

let hookIdCounter = 0;

function generateHookId(): string {
  return `hook_${++hookIdCounter}_${Date.now().toString(36)}`;
}

export class DefaultHookManager implements HookManager {
  private handlers = new Map<HookEventType, HookRegistration[]>();

  register<T extends HookEventType>(
    event: T,
    handler: HookHandler,
    options: { priority?: number; source?: string } = {}
  ): string {
    const id = generateHookId();
    const registration: HookRegistration = {
      id,
      event,
      handler,
      priority: options.priority ?? 0,
      source: options.source ?? 'unknown',
    };

    const handlers = this.handlers.get(event) ?? [];
    handlers.push(registration);
    handlers.sort((a, b) => b.priority - a.priority);
    this.handlers.set(event, handlers);

    logger.debug('Hook registered', { id, event, priority: registration.priority, source: registration.source });
    return id;
  }

  unregister(id: string): void {
    for (const [event, handlers] of this.handlers.entries()) {
      const index = handlers.findIndex(h => h.id === id);
      if (index !== -1) {
        handlers.splice(index, 1);
        logger.debug('Hook unregistered', { id, event });
        return;
      }
    }
  }

  async emit<T extends AnyHookEvent>(event: T): Promise<void> {
    const handlers = this.handlers.get(event.type) ?? [];
    
    if (handlers.length === 0) {
      return;
    }

    logger.debug('Emitting hook event', { type: event.type, handlerCount: handlers.length });

    for (const registration of handlers) {
      try {
        await registration.handler(event);
      } catch (error) {
        logger.error('Hook handler error', {
          hookId: registration.id,
          event: event.type,
          source: registration.source,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  getHandlers(event: HookEventType): HookRegistration[] {
    return this.handlers.get(event) ?? [];
  }

  clear(): void {
    this.handlers.clear();
  }

  getRegisteredEvents(): HookEventType[] {
    return Array.from(this.handlers.keys());
  }

  getHandlerCount(event?: HookEventType): number {
    if (event) {
      return this.handlers.get(event)?.length ?? 0;
    }
    let total = 0;
    for (const handlers of this.handlers.values()) {
      total += handlers.length;
    }
    return total;
  }
}

let globalHookManager: DefaultHookManager | null = null;

export function getHookManager(): DefaultHookManager {
  if (!globalHookManager) {
    globalHookManager = new DefaultHookManager();
  }
  return globalHookManager;
}

export function createHookManager(): DefaultHookManager {
  return new DefaultHookManager();
}
