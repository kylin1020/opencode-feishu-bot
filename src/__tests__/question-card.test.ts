import { describe, test, expect } from 'bun:test';
import { createQuestionCard, createAnsweredCard, createQuestionErrorCard, createMultiAnsweredCard, type QuestionRequest } from '../feishu/question-card';

describe('createQuestionCard (Form Mode)', () => {
  test('renders select for single question', () => {
    const request: QuestionRequest = {
      id: 'req-1',
      sessionID: 'ses-1',
      questions: [{
        question: '选择认证方式？',
        header: '认证方式',
        options: [
          { label: 'OAuth', description: 'OAuth 2.0 认证' },
          { label: 'JWT', description: 'JWT Token' },
        ],
        multiple: false,
      }],
    };
    const card = createQuestionCard(request);
    
    const json = JSON.stringify(card);
    expect(json).toContain('"schema":"2.0"');
    expect(json).toContain('"tag":"form"');
    expect(json).toContain('"tag":"select_static"');
    expect(json).toContain('OAuth');
    expect(json).toContain('JWT');
    expect(json).toContain('提交答案');
  });

  test('renders multi_select for multiple choice question', () => {
    const request: QuestionRequest = {
      id: 'req-1',
      sessionID: 'ses-1',
      questions: [{
        question: '选择工具？',
        header: '工具',
        options: [
          { label: 'Docker', description: '' },
          { label: 'Git', description: '' },
        ],
        multiple: true,
      }],
    };
    const card = createQuestionCard(request);
    
    const json = JSON.stringify(card);
    expect(json).toContain('"tag":"multi_select_static"');
  });

  test('includes form with question names', () => {
    const request: QuestionRequest = {
      id: 'req-123',
      sessionID: 'ses-1',
      questions: [{
        question: '问题',
        header: '标题',
        options: [{ label: 'A', description: '' }],
      }],
    };
    const card = createQuestionCard(request);
    
    const json = JSON.stringify(card);
    expect(json).toContain('"name":"q_0"');
    expect(json).toContain('question_form_req-123');
  });

  test('renders multiple questions in form', () => {
    const request: QuestionRequest = {
      id: 'req-1',
      sessionID: 'ses-1',
      questions: [
        {
          question: '问题1',
          header: '第一个',
          options: [{ label: 'A', description: '' }],
        },
        {
          question: '问题2',
          header: '第二个',
          options: [{ label: 'X', description: '' }, { label: 'Y', description: '' }],
        },
      ],
    };
    const card = createQuestionCard(request);
    
    const json = JSON.stringify(card);
    expect(json).toContain('问题 1');
    expect(json).toContain('问题 2');
    expect(json).toContain('"name":"q_0"');
    expect(json).toContain('"name":"q_1"');
  });

  test('includes custom answer hint', () => {
    const request: QuestionRequest = {
      id: 'req-1',
      sessionID: 'ses-1',
      questions: [{
        question: '问题',
        header: '标题',
        options: [{ label: 'A', description: '' }],
      }],
    };
    const card = createQuestionCard(request);
    
    const json = JSON.stringify(card);
    expect(json).toContain('直接发送消息');
  });

  test('uses orange header', () => {
    const request: QuestionRequest = {
      id: 'req-1',
      sessionID: 'ses-1',
      questions: [{
        question: '问题',
        header: '标题',
        options: [{ label: 'A', description: '' }],
      }],
    };
    const card = createQuestionCard(request);
    
    const json = JSON.stringify(card);
    expect(json).toContain('"template":"orange"');
  });

  test('shows option descriptions when provided', () => {
    const request: QuestionRequest = {
      id: 'req-1',
      sessionID: 'ses-1',
      questions: [{
        question: '选择？',
        header: '选择',
        options: [
          { label: 'A', description: '选项A的描述' },
          { label: 'B', description: '选项B的描述' },
        ],
      }],
    };
    const card = createQuestionCard(request);
    
    const json = JSON.stringify(card);
    expect(json).toContain('选项A的描述');
    expect(json).toContain('选项B的描述');
  });
});

describe('createAnsweredCard', () => {
  test('shows answered state with turquoise header', () => {
    const card = createAnsweredCard('选择认证方式？', 'OAuth');
    const json = JSON.stringify(card);
    expect(json).toContain('已回答');
    expect(json).toContain('"template":"turquoise"');
    expect(json).toContain('OAuth');
    expect(json).toContain('选择认证方式？');
  });
});

describe('createMultiAnsweredCard', () => {
  test('shows all questions and answers', () => {
    const questions = [
      { question: '问题1', header: '标题1', options: [] },
      { question: '问题2', header: '标题2', options: [] },
    ];
    const answers = ['答案1', '答案2'];
    const card = createMultiAnsweredCard(questions, answers);
    
    const json = JSON.stringify(card);
    expect(json).toContain('问题 1');
    expect(json).toContain('问题 2');
    expect(json).toContain('答案1');
    expect(json).toContain('答案2');
    expect(json).toContain('"template":"turquoise"');
  });
});

describe('createQuestionErrorCard', () => {
  test('shows error with carmine header', () => {
    const card = createQuestionErrorCard('问题已过期');
    const json = JSON.stringify(card);
    expect(json).toContain('操作失败');
    expect(json).toContain('"template":"carmine"');
    expect(json).toContain('问题已过期');
  });
});

describe('edge cases', () => {
  test('empty options shows only text prompt', () => {
    const request: QuestionRequest = {
      id: 'req-1',
      sessionID: 'ses-1',
      questions: [{
        question: '请输入您的想法',
        header: '自由输入',
        options: [],
        custom: true,
      }],
    };
    const card = createQuestionCard(request);
    
    const json = JSON.stringify(card);
    expect(json).toContain('直接发送消息');
    expect(json).toContain('请输入您的想法');
  });
});
