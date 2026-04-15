export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

export interface Mistake {
  id: string;
  createdAt: number;
  originalImage?: string; // base64
  originalText: string;
  subject: string;
  knowledgePoints: string[];
  generatedQuestions: GeneratedQuestion[];
}

export interface GeneratedQuestion {
  id: string;
  text: string;
  explanation: string;
  commonMistakes: string;
  chatHistory?: ChatMessage[];
}
