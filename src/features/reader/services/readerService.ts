const BASE = 'https://docvia-backend-production-281b.up.railway.app/api/pdf';

// Safely parse JSON — returns a fallback if the body is empty or non-JSON
async function safeJson<T>(res: Response, fallback: T): Promise<T> {
  try {
    const text = await res.text();
    if (!text) return fallback;
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  success: boolean;
  reply?: string;
  answer?: string;
  error?: string;
  message?: string;
  [key: string]: string | boolean | undefined;
}

export interface MicrotaskQuestion {
  type: 'multiple_choice' | 'true_false' | 'identification' | 'essay' | 'short_answer';
  question: string;
  options: string[];             // for MC / T-F
  correctAnswer?: string;
  hint?: string;
  explanation?: string;
}

export interface MicrotaskGenerateResult {
  success: boolean;
  tasks?: MicrotaskQuestion[];
  error?: string;
}

export interface MicrotaskEvaluateResult {
  success: boolean;
  correct?: boolean;
  isCorrect?: boolean;
  score?: number;
  feedback?: string;
  explanation?: string;
  correctAnswer?: string;
  error?: string;
}

export interface DeepExplainResult {
  success: boolean;
  keyConcepts?: string;
  examples?: string;
  commonMistakes?: string;
  furtherReading?: string;
  error?: string;
}

export interface ProgressResult {
  success: boolean;
  completedIds?: number[];
  error?: string;
}

export async function sendChat(
  pdfId: string,
  lessonTitle: string,
  lessonContent: string,
  question: string,
  history: ChatMessage[],
  token?: string
): Promise<ChatResponse> {
  const res = await fetch(`${BASE}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ pdfId, segmentTitle: lessonTitle, segmentContent: lessonContent, question, history }),
  });
  const raw = await safeJson<ChatResponse>(res, { success: false, error: 'Server did not return a response.' });
  const normalizedReply = raw.reply ?? raw.answer;
  return {
    ...raw,
    reply: normalizedReply,
    success: Boolean(raw.success && normalizedReply),
  };
}

export async function generateQuiz(
  segmentTitle: string,
  segmentContent: string,
  documentTitle: string,
  taskType: string,
  count: number,
  previousQuestions: string[],
  token?: string
): Promise<MicrotaskGenerateResult> {
  const res = await fetch(`${BASE}/microtask/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ segmentTitle, segmentContent, documentTitle, taskType, count, previousQuestions }),
  });
  return safeJson<MicrotaskGenerateResult>(res, { success: false, error: 'Server did not return a response.' });
}

export async function evaluateAnswer(
  task: MicrotaskQuestion,
  userAnswer: string | number,
  segmentTitle: string,
  segmentContent: string,
  token?: string
): Promise<MicrotaskEvaluateResult> {
  const res = await fetch(`${BASE}/microtask/evaluate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ task, userAnswer, segmentTitle, segmentContent }),
  });
  const raw = await safeJson<MicrotaskEvaluateResult>(res, { success: false, error: 'Server did not return a response.' });
  return {
    ...raw,
    isCorrect: raw.isCorrect ?? raw.correct,
  };
}

export async function deepExplain(
  pdfId: string,
  lessonId: string,
  lessonTitle: string,
  lessonContent: string
): Promise<DeepExplainResult> {
  const res = await fetch(`${BASE}/lessons/deep-explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pdfId, lessonId, lessonTitle, lessonContent }),
  });
  return safeJson<DeepExplainResult>(res, { success: false, error: 'Server did not return a response.' });
}

export async function loadProgress(pdfId: string, userId: string): Promise<ProgressResult> {
  const res = await fetch(
    `${BASE}/progress/${encodeURIComponent(pdfId)}?userId=${encodeURIComponent(userId)}`
  );
  return safeJson<ProgressResult>(res, { success: false, error: 'Server did not return a response.' });
}

export async function saveProgress(
  pdfId: string,
  userId: string,
  lessonId: string,
  token: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/progress`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ pdfId, userId, lessonId }),
  });
  return safeJson<{ success: boolean }>(res, { success: false });
}

export async function fetchDictionary(word: string): Promise<{ word: string; pos: string; def: string } | null> {
  try {
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.toLowerCase())}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || !data[0]) return null;
    const entry = data[0];
    const m = (entry.meanings || [])[0];
    if (!m) return null;
    const def = m.definitions?.[0]?.definition ?? '';
    if (!def) return null;
    return { word: entry.word, pos: m.partOfSpeech ?? '', def };
  } catch {
    return null;
  }
}