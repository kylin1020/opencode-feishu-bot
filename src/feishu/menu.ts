import type { ProjectConfig } from '../config';
import { type CardTemplate, colors } from './design-tokens';

export type MenuAction = 
  | 'new_session'
  | 'switch_model'
  | 'compact'
  | 'clear_history'
  | 'show_status'
  | 'show_cost';

export interface ModelInfo {
  id: string;
  name: string;
}

function createHeader(title: string, color: CardTemplate = colors.primary) {
  return {
    template: color,
    title: { tag: 'plain_text', content: title },
  };
}

function createDivider() {
  return { tag: 'hr' };
}

function createMarkdown(content: string) {
  return {
    tag: 'markdown',
    content,
  };
}

export function createProjectSelectCard(projects: ProjectConfig[], description?: string, currentProject?: string): object {
  const elements: object[] = [];

  if (projects.length === 0) {
    elements.push(createMarkdown('*暂无配置项目，请在 .env 中配置 PROJECTS*'));
    return {
      config: { wide_screen_mode: true },
      header: createHeader('🆕 新建会话'),
      elements,
    };
  }

  if (description) {
    elements.push(createMarkdown(description));
    elements.push(createDivider());
  }

  const projectList = projects.map((p, i) => `**${i + 1}.** \`${p.name}\` - ${p.path}`).join('\n');
  
  elements.push(createMarkdown('**可用项目：**\n' + projectList));
  elements.push(createDivider());
  elements.push(createMarkdown('发送指令创建会话：\n`/new <编号>` 例如：`/new 1`'));

  if (currentProject) {
    elements.push(createDivider());
    elements.push(createMarkdown(`当前项目：\`${currentProject}\``));
  }

  return {
    config: { wide_screen_mode: true },
    header: createHeader('🆕 新建会话'),
    elements,
  };
}

export function createModelSelectCard(models: ModelInfo[], currentModel?: string, chatId?: string): object {
  const elements: object[] = [];

  if (models.length === 0) {
    elements.push(createMarkdown('*暂无可用模型*'));
    return {
      config: { wide_screen_mode: true },
      header: createHeader('🔄 切换模型'),
      elements,
    };
  }

  if (currentModel) {
    elements.push(createMarkdown(`当前模型：\`${currentModel}\``));
  }

  const options = models.map(m => ({
    text: { tag: 'plain_text', content: m.name },
    value: m.id,
  }));

  const currentModelInfo = currentModel 
    ? models.find(m => m.id === currentModel)
    : undefined;

  const modelSelect: Record<string, unknown> = {
    tag: 'select_static',
    placeholder: { tag: 'plain_text', content: '选择模型' },
    value: { action: 'switch_model', chatId },
    options,
  };

  if (currentModelInfo) {
    modelSelect.initial_option = currentModelInfo.id;
  }

  elements.push({
    tag: 'action',
    actions: [modelSelect],
  });

  return {
    config: { wide_screen_mode: true },
    header: createHeader('🔄 切换模型'),
    elements,
  };
}

export interface SessionStatus {
  sessionId: string;
  projectPath: string;
  model?: string;
  messageCount?: number;
  isActive: boolean;
}

export function createStatusCard(status: SessionStatus): object {
  const lines = [
    `**会话 ID**: \`${status.sessionId}\``,
    `**项目路径**: \`${status.projectPath}\``,
    status.model ? `**当前模型**: \`${status.model}\`` : null,
    status.messageCount !== undefined ? `**消息数量**: ${status.messageCount}` : null,
    `**状态**: ${status.isActive ? '🟢 活跃' : '⚪ 空闲'}`,
  ].filter(Boolean);

  return {
    config: { wide_screen_mode: true },
    header: createHeader('📊 会话状态', 'green'),
    elements: [createMarkdown(lines.join('\n'))],
  };
}

export interface CostInfo {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost?: string;
}

export function createCostCard(cost: CostInfo): object {
  const lines = [
    `**输入 Tokens**: ${cost.inputTokens.toLocaleString()}`,
    `**输出 Tokens**: ${cost.outputTokens.toLocaleString()}`,
    `**总计 Tokens**: ${cost.totalTokens.toLocaleString()}`,
    cost.estimatedCost ? `**预估费用**: ${cost.estimatedCost}` : null,
  ].filter(Boolean);

  return {
    config: { wide_screen_mode: true },
    header: createHeader('💰 费用统计', 'orange'),
    elements: [createMarkdown(lines.join('\n'))],
  };
}

export function createConfirmCard(
  title: string,
  message: string,
  confirmAction: string,
  confirmText = '确认',
  cancelText = '取消'
): object {
  return {
    config: { wide_screen_mode: true },
    header: createHeader(title, 'orange'),
    elements: [
      createMarkdown(message),
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: confirmText },
            type: 'primary',
            value: { action: confirmAction, confirm: true },
          },
          {
            tag: 'button',
            text: { tag: 'plain_text', content: cancelText },
            type: 'default',
            value: { action: confirmAction, confirm: false },
          },
        ],
      },
    ],
  };
}

export function createSuccessCard(title: string, message: string): object {
  return {
    config: { wide_screen_mode: true },
    header: createHeader(title, 'green'),
    elements: [createMarkdown(message)],
  };
}

export function createSessionChatCreatedCard(chatId: string, sessionId: string, projectPath: string): object {
  const shortSessionId = sessionId.replace(/^ses_/, '').slice(0, 8);
  const chatLink = `https://applink.feishu.cn/client/chat/open?openChatId=${chatId}`;
  const projectName = projectPath.split('/').pop() || projectPath;
  
  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '🎉 会话群已创建' },
      template: 'green',
    },
    elements: [
      {
        tag: 'div',
        text: { tag: 'lark_md', content: `**📁 项目**：${projectName}\n**🔑 会话**：\`${shortSessionId}\`` },
      },
      {
        tag: 'markdown',
        content: `路径：\`${projectPath}\``,
      },
      { tag: 'hr' },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '🚀 进入会话群' },
            type: 'primary',
            url: chatLink,
          },
        ],
      },
      {
        tag: 'note',
        elements: [{ tag: 'plain_text', content: '进入群组后，直接发送消息即可与 AI 对话' }],
      },
    ],
  };
}

export function createErrorCard(title: string, message: string): object {
  return {
    config: { wide_screen_mode: true },
    header: createHeader(title, 'red'),
    elements: [createMarkdown(message)],
  };
}

export interface SessionChatWelcomeInfo {
  sessionId: string;
  projectPath: string;
  projects: ProjectConfig[];
  chatId: string;
  models: ModelInfo[];
  currentModel?: string;
}

export function createSessionChatWelcomeCard(info: SessionChatWelcomeInfo): object {
  const shortSessionId = info.sessionId.replace(/^ses_/, '').slice(0, 8);
  const projectName = info.projectPath.split('/').pop() || info.projectPath;
  const currentModelName = info.currentModel 
    ? info.models.find(m => m.id === info.currentModel)?.name || info.currentModel.split('/').pop()
    : '默认模型';
  
  const elements: object[] = [];

  elements.push({
    tag: 'div',
    text: { 
      tag: 'lark_md', 
      content: `📁 **项目**：${projectName}　　🤖 **模型**：${currentModelName}　　🔑 **会话**：\`${shortSessionId}\`` 
    },
  });

  const settingsActions: object[] = [];

  if (info.projects.length > 0) {
    const projectOptions = info.projects.map(p => ({
      text: { tag: 'plain_text', content: p.name },
      value: p.path,
    }));

    settingsActions.push({
      tag: 'select_static',
      placeholder: { tag: 'plain_text', content: '📂 切换项目' },
      value: { action: 'switch_project_in_chat', chatId: info.chatId },
      options: projectOptions,
    });
  }

  if (info.models.length > 0) {
    const modelOptions = info.models.map(m => ({
      text: { tag: 'plain_text', content: m.name.length > 25 ? m.name.slice(0, 25) + '...' : m.name },
      value: m.id,
    }));

    const currentModelInfo = info.currentModel 
      ? info.models.find(m => m.id === info.currentModel)
      : undefined;

    const modelSelect: Record<string, unknown> = {
      tag: 'select_static',
      placeholder: { tag: 'plain_text', content: '🤖 切换模型' },
      value: { action: 'switch_model', chatId: info.chatId },
      options: modelOptions,
    };

    if (currentModelInfo) {
      modelSelect.initial_option = currentModelInfo.id;
    }

    settingsActions.push(modelSelect);
  }

  if (settingsActions.length > 0) {
    elements.push({ tag: 'hr' });
    elements.push({
      tag: 'action',
      actions: settingsActions,
    });
  }

  elements.push({ tag: 'hr' });
  elements.push({
    tag: 'markdown',
    content: [
      '**💡 常用命令**',
      '`/abort` 中止任务　`/clear` 清除历史　`/compact` 压缩上下文　`/status` 查看状态',
    ].join('\n'),
  });

  elements.push({
    tag: 'note',
    elements: [{ tag: 'plain_text', content: '⚡ 直接发送消息即可开始对话，无需 @机器人' }],
  });

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: 'plain_text', content: '🚀 会话已就绪' },
      template: 'blue',
    },
    elements,
  };
}

export function createProjectSwitchedCard(projectName: string, projectPath: string, sessionId: string): object {
  const shortSessionId = sessionId.replace(/^ses_/, '').slice(0, 8);
  return {
    config: { wide_screen_mode: true },
    header: createHeader('✅ 项目已切换', 'green'),
    elements: [
      createMarkdown(
        `**${projectName}**\n` +
        `- 📁 路径：\`${projectPath}\`\n` +
        `- 🔑 新会话：\`${shortSessionId}\``
      ),
    ],
  };
}

export interface QuickActionsInfo {
  chatId: string;
  projects: ProjectConfig[];
  models: ModelInfo[];
  currentModel?: string;
}

function createActionButton(text: string, action: string, chatId: string, type: 'default' | 'primary' | 'danger' = 'default') {
  return {
    tag: 'button',
    text: { tag: 'plain_text', content: text },
    type,
    value: { action, chatId },
  };
}

export function createQuickActionsCard(info: QuickActionsInfo): object {
  const { chatId, projects, models, currentModel } = info;
  const elements: object[] = [];

  elements.push(createMarkdown('**📝 会话操作**'));
  elements.push({
    tag: 'action',
    actions: [
      createActionButton('🆕 新建会话', 'quick_new_session', chatId),
      createActionButton('🗜️ 压缩上下文', 'quick_compact', chatId),
      createActionButton('🧹 清除历史', 'quick_clear', chatId),
    ],
  });
  elements.push({
    tag: 'action',
    actions: [
      createActionButton('⏹️ 中止任务', 'quick_abort', chatId, 'danger'),
      createActionButton('📊 查看状态', 'quick_status', chatId),
      createActionButton('📖 帮助', 'quick_help', chatId),
    ],
  });

  elements.push(createDivider());
  elements.push(createMarkdown('**⚙️ 设置**'));

  const settingsActions: object[] = [];

  if (models.length > 0) {
    const modelOptions = models.slice(0, 10).map(m => ({
      text: { tag: 'plain_text', content: m.name.length > 20 ? m.name.slice(0, 20) + '...' : m.name },
      value: m.id,
    }));

    const currentModelInfo = currentModel 
      ? models.find(m => m.id === currentModel)
      : undefined;

    const modelSelect: Record<string, unknown> = {
      tag: 'select_static',
      placeholder: { tag: 'plain_text', content: '🤖 切换模型' },
      value: { action: 'switch_model', chatId },
      options: modelOptions,
    };

    if (currentModelInfo) {
      modelSelect.initial_option = currentModelInfo.id;
    }

    settingsActions.push(modelSelect);
  }

  if (projects.length > 0) {
    const projectOptions = projects.map(p => ({
      text: { tag: 'plain_text', content: p.name },
      value: p.path,
    }));
    settingsActions.push({
      tag: 'select_static',
      placeholder: { tag: 'plain_text', content: '📂 切换项目' },
      value: { action: 'switch_project_in_chat', chatId },
      options: projectOptions,
    });
  }

  if (settingsActions.length > 0) {
    elements.push({
      tag: 'action',
      actions: settingsActions,
    });
  } else {
    elements.push(createMarkdown('💡 使用 `/model` 切换模型，`/switch_project <路径>` 切换项目'));
  }

  elements.push(createDivider());
  elements.push({
    tag: 'note',
    elements: [{ tag: 'plain_text', content: '💡 发送 /menu 可再次显示此面板' }],
  });

  return {
    config: { wide_screen_mode: true },
    header: createHeader('⚡ 快捷操作', 'blue'),
    elements,
  };
}
