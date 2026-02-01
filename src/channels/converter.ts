import type {
  UnifiedMessage,
  UnifiedReply,
  ContentBlock,
  TextBlock,
  CodeBlock,
  ToolCallBlock,
  ThinkingBlock,
  MessageAttachment,
  ReplyStatus,
} from '../types/message';

export class MessageConverter {
  static toPlainText(blocks: ContentBlock[]): string {
    const parts: string[] = [];

    for (const block of blocks) {
      switch (block.type) {
        case 'text':
          parts.push(block.content);
          break;
        case 'code':
          if (block.language) {
            parts.push(`\`\`\`${block.language}\n${block.content}\n\`\`\``);
          } else {
            parts.push(`\`\`\`\n${block.content}\n\`\`\``);
          }
          break;
        case 'thinking':
          parts.push(`[Thinking: ${block.content.slice(0, 100)}...]`);
          break;
        case 'tool_call':
          parts.push(`[Tool: ${block.toolName} - ${block.status}]`);
          break;
        case 'tool_result':
          parts.push(`[Result: ${block.toolName} - ${block.success ? 'success' : 'failed'}]`);
          break;
        case 'error':
          parts.push(`[Error: ${block.message}]`);
          break;
        case 'image':
          parts.push('[Image]');
          break;
        case 'file':
          parts.push(`[File: ${block.filename}]`);
          break;
      }
    }

    return parts.join('\n\n');
  }

  static extractText(blocks: ContentBlock[]): string {
    return blocks
      .filter((b): b is TextBlock => b.type === 'text')
      .map(b => b.content)
      .join('\n');
  }

  static extractCode(blocks: ContentBlock[]): CodeBlock[] {
    return blocks.filter((b): b is CodeBlock => b.type === 'code');
  }

  static extractToolCalls(blocks: ContentBlock[]): ToolCallBlock[] {
    return blocks.filter((b): b is ToolCallBlock => b.type === 'tool_call');
  }

  static extractThinking(blocks: ContentBlock[]): ThinkingBlock[] {
    return blocks.filter((b): b is ThinkingBlock => b.type === 'thinking');
  }

  static createTextReply(text: string, status: ReplyStatus = 'completed'): UnifiedReply {
    return {
      status,
      blocks: [{ type: 'text', content: text }],
      plainText: text,
    };
  }

  static createErrorReply(message: string, code?: string): UnifiedReply {
    return {
      status: 'error',
      blocks: [{ type: 'error', message, code }],
      plainText: `Error: ${message}`,
    };
  }

  static createStreamingReply(blocks: ContentBlock[]): UnifiedReply {
    return {
      status: 'streaming',
      blocks,
      plainText: this.toPlainText(blocks),
    };
  }

  static appendBlock(reply: UnifiedReply, block: ContentBlock): UnifiedReply {
    const newBlocks = [...reply.blocks, block];
    return {
      ...reply,
      blocks: newBlocks,
      plainText: this.toPlainText(newBlocks),
    };
  }

  static updateLastBlock(reply: UnifiedReply, updater: (block: ContentBlock) => ContentBlock): UnifiedReply {
    if (reply.blocks.length === 0) return reply;
    
    const newBlocks = [...reply.blocks];
    newBlocks[newBlocks.length - 1] = updater(newBlocks[newBlocks.length - 1]!);
    
    return {
      ...reply,
      blocks: newBlocks,
      plainText: this.toPlainText(newBlocks),
    };
  }

  static parseMarkdownToBlocks(markdown: string): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(markdown)) !== null) {
      if (match.index > lastIndex) {
        const text = markdown.slice(lastIndex, match.index).trim();
        if (text) {
          blocks.push({ type: 'text', content: text });
        }
      }

      blocks.push({
        type: 'code',
        language: match[1] || undefined,
        content: match[2]!.trim(),
      });

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < markdown.length) {
      const text = markdown.slice(lastIndex).trim();
      if (text) {
        blocks.push({ type: 'text', content: text });
      }
    }

    return blocks.length > 0 ? blocks : [{ type: 'text', content: markdown }];
  }
}
