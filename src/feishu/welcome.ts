import type { FeishuCard, CardElement } from './formatter';
import { colors } from './design-tokens';

export interface BotInfo {
  projectPath: string;
  version?: string;
  activeSessionCount: number;
}

export function createWelcomeCard(info: BotInfo, chatName?: string): FeishuCard {
  const greeting = chatName ? `已加入「${chatName}」` : '你好！';
  
  const elements: CardElement[] = [
    {
      tag: 'markdown',
      content: `我是 OpenCode AI 编程助手，可以帮助你完成编程任务。

**当前状态**
- 工作目录：\`${info.projectPath}\`
- 活跃会话：${info.activeSessionCount} 个
${info.version ? `- 版本：${info.version}` : ''}`,
    },
    { tag: 'hr' },
    {
      tag: 'markdown',
      content: `**常用命令**
\`/help\` - 显示帮助信息
\`/status\` - 查看当前状态
\`/new_session\` - 创建新会话
\`/switch_project <路径>\` - 切换项目目录
\`/abort\` - 中止当前任务`,
    },
    { tag: 'hr' },
    {
      tag: 'note',
      elements: [{ tag: 'plain_text', content: '直接发送消息即可开始对话' }],
    },
  ];

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: greeting },
      template: colors.welcome,
    },
    elements,
  };
}

export function createPrivateChatWelcomeCard(info: BotInfo): FeishuCard {
  const elements: CardElement[] = [
    {
      tag: 'markdown',
      content: `我是 OpenCode AI 编程助手。

**当前配置**
- 工作目录：\`${info.projectPath}\`

发送任何消息开始对话，或使用 \`/help\` 查看所有可用命令。`,
    },
  ];

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '你好！' },
      template: colors.welcome,
    },
    elements,
  };
}
