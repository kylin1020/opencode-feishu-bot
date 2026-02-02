import { type CardTemplate, colors } from './design-tokens';

export interface QuestionOption {
  label: string;
  description: string;
}

export interface QuestionInfo {
  question: string;
  header: string;
  options: QuestionOption[];
  multiple?: boolean;
  custom?: boolean;
}

export interface QuestionRequest {
  id: string;
  sessionID: string;
  questions: QuestionInfo[];
  tool?: {
    messageID: string;
    callID: string;
  };
}

function createSelectOptions(options: QuestionOption[]) {
  return options.map((opt, idx) => ({
    text: { tag: 'plain_text', content: opt.label },
    value: String(idx),
  }));
}

function createQuestionFormCard(request: QuestionRequest): object {
  const headerTitle = request.questions[0]?.header || '🤔 请回答以下问题';
  const formElements: object[] = [];

  request.questions.forEach((q, questionIndex) => {
    formElements.push({
      tag: 'markdown',
      content: `**问题 ${questionIndex + 1}**: ${q.question}`,
      text_size: 'normal',
    });

    if (q.options && q.options.length > 0) {
      const descriptions = q.options.filter(opt => opt.description).map(opt => `• **${opt.label}**: ${opt.description}`).join('\n');
      if (descriptions) {
        formElements.push({
          tag: 'markdown',
          content: descriptions,
          text_size: 'normal',
        });
      }

      const selectTag = q.multiple ? 'multi_select_static' : 'select_static';
      const placeholder = q.multiple ? '请选择（可多选）' : '请选择';

      formElements.push({
        tag: selectTag,
        placeholder: { tag: 'plain_text', content: placeholder },
        options: createSelectOptions(q.options),
        type: 'default',
        width: 'default',
        required: true,
        name: `q_${questionIndex}`,
      });
    }

    if (questionIndex < request.questions.length - 1) {
      formElements.push({ tag: 'hr' });
    }
  });

  formElements.push({
    tag: 'column_set',
    flex_mode: 'flow',
    horizontal_spacing: '8px',
    horizontal_align: 'left',
    columns: [
      {
        tag: 'column',
        width: 'auto',
        elements: [
          {
            tag: 'button',
            text: { tag: 'plain_text', content: '提交答案' },
            type: 'primary_filled',
            width: 'default',
            form_action_type: 'submit',
            name: 'submit_btn',
          },
        ],
      },
    ],
  });

  formElements.push({
    tag: 'markdown',
    content: '💬 或直接发送消息输入自定义答案',
    text_size: 'notation',
  });

  return {
    schema: '2.0',
    config: { update_multi: true },
    header: {
      title: { tag: 'plain_text', content: headerTitle },
      template: 'orange',
    },
    body: {
      direction: 'vertical',
      elements: [
        {
          tag: 'form',
          name: `question_form_${request.id}`,
          elements: formElements,
          direction: 'vertical',
          vertical_spacing: '12px',
        },
      ],
    },
  };
}

export function createQuestionCard(request: QuestionRequest, _currentAnswers?: (string | null)[]): object {
  return createQuestionFormCard(request);
}

export function createAnsweredCard(question: string, answer: string): object {
  return {
    schema: '2.0',
    config: { update_multi: true },
    header: {
      title: { tag: 'plain_text', content: '✅ 已回答' },
      template: 'turquoise',  // 青绿：成功/已完成
    },
    body: {
      direction: 'vertical',
      elements: [
        { tag: 'markdown', content: `**问题**: ${question}` },
        { tag: 'markdown', content: `**答案**: ${answer}` },
      ],
    },
  };
}

export function createMultiAnsweredCard(questions: QuestionInfo[], answers: string[]): object {
  const elements: object[] = [];

  questions.forEach((q, idx) => {
    if (idx > 0) {
      elements.push({ tag: 'hr' });
    }
    elements.push({ tag: 'markdown', content: `**问题 ${idx + 1}**: ${q.question}` });
    elements.push({ tag: 'markdown', content: `**答案**: ${answers[idx] || '(未回答)'}` });
  });

  return {
    schema: '2.0',
    config: { update_multi: true },
    header: {
      title: { tag: 'plain_text', content: '✅ 已回答' },
      template: 'turquoise',  // 青绿：成功/已完成
    },
    body: {
      direction: 'vertical',
      elements,
    },
  };
}

export function createQuestionErrorCard(message: string): object {
  return {
    schema: '2.0',
    config: { update_multi: true },
    header: {
      title: { tag: 'plain_text', content: '❌ 操作失败' },
      template: 'carmine',  // 洋红：错误/失败
    },
    body: {
      direction: 'vertical',
      elements: [{ tag: 'markdown', content: message }],
    },
  };
}
