import { test, expect, describe } from 'bun:test';
import {
  createCard,
  createStatusCard,
  formatCodeBlock,
  formatToolOutput,
  formatThinkingBlock,
  formatError,
  truncateContent,
  formatMessageParts,
  buildStreamingCard,
  buildStreamingCardsV2,
  type OrderedPart,
} from '../feishu/formatter';

describe('Formatter', () => {
  describe('createCard', () => {
    test('creates basic card without title', () => {
      const card = createCard('Hello world');
      
      expect(card.config?.wide_screen_mode).toBe(true);
      expect(card.elements).toHaveLength(1);
      
      const firstElement = card.elements[0]!;
      expect(firstElement.tag).toBe('markdown');
      expect((firstElement as { content: string }).content).toBe('Hello world');
      expect(card.header).toBeUndefined();
    });

    test('creates card with title', () => {
      const card = createCard('Content', 'My Title');
      
      expect(card.header).toBeDefined();
      expect(card.header!.title.content).toBe('My Title');
      expect(card.header!.template).toBe('indigo');
    });

    test('creates card with custom template', () => {
      const card = createCard('Content', 'Title', 'turquoise');
      
      expect(card.header?.template).toBe('turquoise');
    });
  });

  describe('createStatusCard', () => {
    test('creates error card with carmine template', () => {
      const card = createStatusCard('Error occurred');
      
      expect(card.header?.template).toBe('carmine');
    });

    test('creates complete card with turquoise template', () => {
      const card = createStatusCard('Task complete');
      
      expect(card.header?.template).toBe('turquoise');
    });

    test('creates running card with violet template', () => {
      const card = createStatusCard('Running task');
      
      expect(card.header?.template).toBe('violet');
    });
  });

  describe('formatCodeBlock', () => {
    test('formats code without language', () => {
      const result = formatCodeBlock('const x = 1;');
      
      expect(result).toBe('```\nconst x = 1;\n```');
    });

    test('formats code with language', () => {
      const result = formatCodeBlock('const x = 1;', 'typescript');
      
      expect(result).toBe('```typescript\nconst x = 1;\n```');
    });
  });

  describe('formatToolOutput', () => {
    test('formats tool with running status', () => {
      const result = formatToolOutput('read_file', 'running');
      
      expect(result).toContain('read_file');
      expect(result).toContain('⏳');
    });

    test('formats tool with completed status', () => {
      const result = formatToolOutput('write_file', 'completed');
      
      expect(result).toContain('✅');
    });

    test('formats tool with output', () => {
      const result = formatToolOutput('bash', 'completed', 'output text');
      
      expect(result).toContain('output text');
      expect(result).toContain('```');
    });

    test('truncates long output', () => {
      const longOutput = 'x'.repeat(3000);
      const result = formatToolOutput('bash', 'completed', longOutput);
      
      expect(result).toContain('截断');
    });
  });

  describe('formatThinkingBlock', () => {
    test('formats thinking text with blockquote', () => {
      const result = formatThinkingBlock('Let me think...');
      
      expect(result).toContain('>');
      expect(result).toContain('Let me think...');
    });

    test('truncates long thinking text', () => {
      const longText = 'x'.repeat(600);
      const result = formatThinkingBlock(longText);
      
      expect(result.length).toBeLessThan(600);
      expect(result).toContain('...');
    });

    test('handles multi-line thinking text', () => {
      const multiLine = 'Line 1\nLine 2\nLine 3';
      const result = formatThinkingBlock(multiLine);
      
      expect(result).toContain('> Line 1');
      expect(result).toContain('> Line 2');
    });
  });

  describe('formatError', () => {
    test('formats error message', () => {
      const result = formatError('Something went wrong');
      
      expect(result).toContain('❌');
      expect(result).toContain('错误');
      expect(result).toContain('Something went wrong');
    });
  });

  describe('truncateContent', () => {
    test('returns short content as-is', () => {
      const content = 'Short content';
      const result = truncateContent(content);
      
      expect(result).toBe(content);
    });

    test('truncates long content', () => {
      const longContent = 'x'.repeat(30000);
      const result = truncateContent(longContent);
      
      expect(result.length).toBeLessThan(30000);
      expect(result).toContain('截断');
    });
  });

  describe('formatMessageParts', () => {
    test('formats text parts', () => {
      const parts = [{ type: 'text', text: 'Hello' }];
      const result = formatMessageParts(parts);
      
      expect(result).toBe('Hello');
    });

    test('formats reasoning parts with blockquote', () => {
      const parts = [{ type: 'reasoning', text: 'Thinking...' }];
      const result = formatMessageParts(parts);
      
      expect(result).toContain('> Thinking...');
    });

    test('formats tool-call parts', () => {
      const parts = [{ type: 'tool-call', name: 'read_file', state: 'running' }];
      const result = formatMessageParts(parts);
      
      expect(result).toContain('read_file');
    });

    test('formats multiple parts', () => {
      const parts = [
        { type: 'text', text: 'First' },
        { type: 'text', text: 'Second' },
      ];
      const result = formatMessageParts(parts);
      
      expect(result).toContain('First');
      expect(result).toContain('Second');
    });
  });

  describe('buildStreamingCard', () => {
    test('builds incomplete card with violet template', () => {
      const card = buildStreamingCard('Content', false);
      
      expect(card.header?.template).toBe('violet');
      expect(card.header?.title.content).toBe('处理中...');
    });

    test('builds complete card with turquoise template', () => {
      const card = buildStreamingCard('Content', true);
      
      expect(card.header?.template).toBe('turquoise');
      expect(card.header?.title.content).toBe('响应完成');
    });

    test('uses custom title', () => {
      const card = buildStreamingCard('Content', false, 'Custom Title');
      
      expect(card.header?.title.content).toBe('Custom Title');
    });
  });

  describe('buildStreamingCardsV2 - Special Tool Formatting', () => {
    test('formats todowrite tool as checklist', () => {
      const parts: OrderedPart[] = [{
        type: 'tool-call',
        name: 'todowrite',
        state: 'completed',
        input: {
          todos: [
            { id: '1', content: 'Task 1', status: 'completed', priority: 'high' },
            { id: '2', content: 'Task 2', status: 'in_progress', priority: 'medium' },
            { id: '3', content: 'Task 3', status: 'pending', priority: 'low' },
          ],
        },
      }];
      
      const result = buildStreamingCardsV2(parts, true);
      const cardBody = (result.cards[0] as { body: { elements: object[] } }).body;
      const panelElement = cardBody.elements[0] as { elements: object[] };
      const content = (panelElement.elements[0] as { content: string }).content;
      
      expect(content).toContain('✅');
      expect(content).toContain('🔄');
      expect(content).toContain('⬜');
      expect(content).toContain('~~Task 1~~');
      expect(content).toContain('Task 2');
    });

    test('formats edit tool as diff view', () => {
      const parts: OrderedPart[] = [{
        type: 'tool-call',
        name: 'edit',
        state: 'completed',
        input: {
          filePath: '/path/to/file.ts',
          oldString: 'const x = 1;',
          newString: 'const x = 2;',
        },
      }];
      
      const result = buildStreamingCardsV2(parts, true);
      const cardBody = (result.cards[0] as { body: { elements: object[] } }).body;
      const panelElement = cardBody.elements[0] as { elements: object[] };
      
      const filePathContent = (panelElement.elements[0] as { content: string }).content;
      expect(filePathContent).toContain('/path/to/file.ts');
      
      const diffContent = (panelElement.elements[1] as { content: string }).content;
      expect(diffContent).toContain('- const x = 1;');
      expect(diffContent).toContain('+ const x = 2;');
    });

    test('formats bash tool with command and output', () => {
      const parts: OrderedPart[] = [{
        type: 'tool-call',
        name: 'bash',
        state: 'completed',
        input: {
          command: 'ls -la',
          description: 'List files',
        },
        output: 'file1.txt\nfile2.txt',
      }];
      
      const result = buildStreamingCardsV2(parts, true);
      const cardBody = (result.cards[0] as { body: { elements: object[] } }).body;
      const panelElement = cardBody.elements[0] as { elements: object[] };
      
      const elements = panelElement.elements.map((e: { content?: string }) => e.content ?? '').join('\n');
      expect(elements).toContain('List files');
      expect(elements).toContain('$ ls -la');
      expect(elements).toContain('file1.txt');
    });

    test('formats glob tool with search results', () => {
      const parts: OrderedPart[] = [{
        type: 'tool-call',
        name: 'glob',
        state: 'completed',
        input: {
          pattern: '**/*.ts',
          path: '/src',
        },
        output: 'file1.ts\nfile2.ts\nfile3.ts',
      }];
      
      const result = buildStreamingCardsV2(parts, true);
      const cardBody = (result.cards[0] as { body: { elements: object[] } }).body;
      const panelElement = cardBody.elements[0] as { elements: object[] };
      
      const elements = panelElement.elements.map((e: { content?: string }) => e.content ?? '').join('\n');
      expect(elements).toContain('**/*.ts');
      expect(elements).toContain('找到 3 个结果');
    });

    test('formats delegate_task tool with agent info', () => {
      const parts: OrderedPart[] = [{
        type: 'tool-call',
        name: 'delegate_task',
        state: 'running',
        input: {
          description: 'Analyze codebase',
          subagent_type: 'explore',
          run_in_background: true,
        },
      }];
      
      const result = buildStreamingCardsV2(parts, false);
      const cardBody = (result.cards[0] as { body: { elements: object[] } }).body;
      const panelElement = cardBody.elements[0] as { elements: object[] };
      
      const allContent = panelElement.elements.map((e: { content?: string }) => e.content ?? '').join('\n');
      expect(allContent).toContain('explore');
      expect(allContent).toContain('Analyze codebase');
      expect(allContent).toContain('后台运行');
    });

    test('background delegate_task shows pending status when just launched', () => {
      const parts: OrderedPart[] = [{
        type: 'tool-call',
        name: 'delegate_task',
        state: 'completed',
        input: {
          description: 'Search news',
          subagent_type: 'librarian',
          run_in_background: true,
        },
        output: 'Background task launched.\nTask ID: bg_123',
      }];
      
      const result = buildStreamingCardsV2(parts, false);
      const cardBody = (result.cards[0] as { body: { elements: object[] } }).body;
      const panelElement = cardBody.elements[0] as { header: { title: { content: string } }; elements: object[] };
      
      expect(panelElement.header.title.content).toContain('⏳');
      expect(panelElement.header.title.content).not.toContain('✅');
      
      const allContent = panelElement.elements.map((e: { content?: string }) => e.content ?? '').join('\n');
      expect(allContent).toContain('执行中');
      expect(allContent).toContain('后台运行');
    });

    test('falls back to generic format for unknown tools', () => {
      const parts: OrderedPart[] = [{
        type: 'tool-call',
        name: 'unknown_tool',
        state: 'completed',
        input: { param1: 'value1' },
        output: 'some output',
      }];
      
      const result = buildStreamingCardsV2(parts, true);
      const cardBody = (result.cards[0] as { body: { elements: object[] } }).body;
      const panelElement = cardBody.elements[0] as { elements: object[] };
      
      const elements = panelElement.elements.map((e: { content?: string }) => e.content ?? '').join('\n');
      expect(elements).toContain('param1');
      expect(elements).toContain('some output');
    });
  });
});
