import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const analyzeMistakeImage = async (base64Data: string, mimeType: string) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: [
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      },
      '请分析这张图片中的题目。提取出题目的完整文本、所属学科（如数学、物理、英语等），以及该题目考察的核心知识点（1-3个）。',
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          originalText: {
            type: Type.STRING,
            description: '题目的完整文本内容',
          },
          subject: {
            type: Type.STRING,
            description: '所属学科，例如：数学、物理、化学、语文、英语等',
          },
          knowledgePoints: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
            description: '考察的核心知识点列表',
          },
        },
        required: ['originalText', 'subject', 'knowledgePoints'],
      },
    },
  });

  if (!response.text) {
    throw new Error('Failed to analyze image');
  }

  return JSON.parse(response.text) as {
    originalText: string;
    subject: string;
    knowledgePoints: string[];
  };
};

export const generateSimilarQuestions = async (
  subject: string,
  knowledgePoints: string[],
  originalText: string
) => {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: `基于以下原题和知识点，生成2道举一反三的相似题目。
学科：${subject}
知识点：${knowledgePoints.join('、')}
原题：${originalText}

要求：
1. 题目难度与原题相当。
2. 语言风格必须亲切、生动，完全符合小学三年级（8-9岁）学生的认知水平（具体运算阶段）。多用生活中的具体事物（如苹果、分糖果、排队等）打比方。
3. 提供详细的解析，解析也要像老师给三年级小朋友讲课一样通俗易懂，帮助他们理解“运演过程”。
4. 必须包含“易错点分析”，指出小朋友在做这类题目时容易犯的错误。`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            text: {
              type: Type.STRING,
              description: '生成的题目文本',
            },
            explanation: {
              type: Type.STRING,
              description: '题目的详细解析',
            },
            commonMistakes: {
              type: Type.STRING,
              description: '易错点分析',
            },
          },
          required: ['text', 'explanation', 'commonMistakes'],
        },
      },
    },
  });

  if (!response.text) {
    throw new Error('Failed to generate questions');
  }

  return JSON.parse(response.text) as {
    text: string;
    explanation: string;
    commonMistakes: string;
  }[];
};

export const chatWithSocraticTutor = async (
  questionText: string,
  explanation: string,
  history: { role: 'user' | 'model'; content: string }[],
  newMessage: string
) => {
  const systemInstruction = `你现在是一位非常有耐心、亲切的小学三年级辅导老师。
学生在做下面这道题时遇到了困难：
题目：${questionText}
正确解析参考：${explanation}

你的任务是使用【苏格拉底式提问法】引导学生自己得出答案。
核心原则：
1. 绝对不要直接告诉学生答案！
2. 每次只问一个简单的小问题，引导学生思考下一步。
3. 语言必须符合三年级（8-9岁）儿童的认知（具体运算阶段），多用生活中的具体事物（如分糖果、搭积木、排队等）打比方，帮助他们理解“运演过程”。
4. 鼓励和肯定学生的每一次尝试，即使错了也要温和地引导。
5. 如果学生完全没有头绪，可以先给出一个极度简化的类似例子。`;

  const contents = history.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.content }]
  }));
  contents.push({ role: 'user', parts: [{ text: newMessage }] });

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents,
    config: {
      systemInstruction,
    }
  });

  if (!response.text) {
    throw new Error('Failed to get chat response');
  }

  return response.text;
};
