const BASE = 'https://docvia-backend-production-281b.up.railway.app/api/pdf';

export interface PDFFile {
  filename: string;   // storage name — used as pdfId (e.g. "1234_abc_myfile.pdf")
  name: string;       // display name
  uploadedAt: string;
  sizeLabel: string;
}

export interface UploadResult {
  success: boolean;
  data?: {
    filename: string;
    originalFilename: string;
    publicUrl: string;
    uploadedAt?: string;
  };
  error?: string;
}

export interface BackendLesson {
  id: number;
  title: string;
  explanation: string;
  key_points: string[];
}

export interface LessonSet {
  id: string;
  pdfId: string;
  title: string;
  overview: string;
  lessons: BackendLesson[];
  totalLessons: number;
}

export interface LessonSetResult {
  success: boolean;
  data?: LessonSet;
  error?: string;
  message?: string;
  /** 'complete' | 'generating' | 'not_started' | 'error' */
  status?: string;
  /** true when the server returned 202 (generation kicked off, poll /status) */
  queued?: boolean;
}

export interface LessonStatusResult {
  success: boolean;
  /** 'complete' | 'generating' | 'not_started' */
  status: string;
  data?: LessonSet;
  message?: string;
  error?: string;
}

export interface DuplicateCheckResult {
  success: boolean;
  isDuplicate: boolean;
  duplicates: Array<{ filename: string; displayName: string }>;
  message?: string;
  error?: string;
}

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

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

// The backend stores files as "timestamp_randomhex_originalname.pdf".
// Strip the prefix to get a readable display name.
function toDisplayName(filename: string): string {
  return filename
    .replace(/^\d+_[a-z0-9]+_/i, '')
    .replace(/_/g, ' ')
    .replace(/\.pdf$/i, '');
}

export async function uploadPDF(
  file: File,
  token: string,
  onProgress?: (progress: number) => void
): Promise<UploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();

    if (onProgress) {
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          onProgress(percentComplete);
        }
      });
    }

    xhr.addEventListener('load', async () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const result = safeJson<UploadResult>(
          new Response(xhr.responseText),
          { success: false, error: 'Server did not return a response.' }
        );
        resolve(result);
      } else {
        resolve({
          success: false,
          error: `Upload failed with status ${xhr.status}`,
        });
      }
    });

    xhr.addEventListener('error', () => {
      resolve({
        success: false,
        error: 'Network error during upload. Please try again.',
      });
    });

    xhr.addEventListener('abort', () => {
      resolve({
        success: false,
        error: 'Upload was cancelled.',
      });
    });

    const form = new FormData();
    form.append('pdf', file);

    xhr.open('POST', `${BASE}/upload`);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.send(form);
  });
}

export async function listPDFs(token?: string): Promise<PDFFile[]> {
  try {
    const res = await fetch(`${BASE}/list`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const json = await safeJson<{ success: boolean; data?: unknown[] }>(res, { success: false });
    if (!json.success || !Array.isArray(json.data)) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return json.data.map((raw: unknown): PDFFile => {
      const row = raw as Record<string, unknown>;
      const meta = row.metadata as { size?: number } | undefined;
      const sizeBytes = meta?.size;
      return {
        filename: String(row.name ?? ''),
        name: toDisplayName(String(row.name ?? '')),
        uploadedAt: String(
          row.updated_at ?? row.created_at ?? row.last_modified ?? ''
        ),
        sizeLabel: typeof sizeBytes === 'number' && sizeBytes > 0 ? formatSize(sizeBytes) : '',
      };
    });
  } catch {
    return [];
  }
}

export async function deletePDF(
  filename: string,
  token: string
): Promise<{ success: boolean }> {
  const res = await fetch(`${BASE}/${encodeURIComponent(filename)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return safeJson<{ success: boolean }>(res, { success: false });
}

/**
 * Trigger or retrieve lesson generation.
 *
 * The backend returns:
 *   - 200 { status: 'complete', data }   → lessons ready (cache hit or freshly generated)
 *   - 202 { status: 'generating' }       → generation started/in-progress, poll /status
 *   - 4xx/5xx                            → error
 *
 * Callers that need to wait for completion should poll `getLessonsStatus` after
 * receiving queued: true.
 */
export async function generateLessons(
  pdfId: string,
  userId: string,
  token?: string
): Promise<LessonSetResult> {
  const res = await fetch(`${BASE}/lessons/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ pdfId, userId }),
  });

  const json = await safeJson<LessonSetResult>(res, {
    success: false,
    error: 'Server did not return a response.',
  });

  // Attach a queued flag so callers can switch to polling without inspecting status strings
  if (res.status === 202) {
    return { ...json, queued: true };
  }

  return json;
}

/**
 * Non-blocking status check. Returns immediately without waiting for generation.
 * Use this to poll after receiving { queued: true } from generateLessons.
 */
export async function getLessonsStatus(
  pdfId: string,
  userId: string,
  token?: string
): Promise<LessonStatusResult> {
  const res = await fetch(
    `${BASE}/lessons/${encodeURIComponent(pdfId)}/status?userId=${encodeURIComponent(userId)}`,
    {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }
  );
  return safeJson<LessonStatusResult>(res, {
    success: false,
    status: 'error',
    error: 'Server did not return a response.',
  });
}

export async function getLessons(pdfId: string, userId: string, token?: string): Promise<LessonSetResult> {
  const res = await fetch(`${BASE}/lessons/${encodeURIComponent(pdfId)}?userId=${encodeURIComponent(userId)}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return safeJson<LessonSetResult>(res, { success: false, error: 'Server did not return a response.' });
}

/** Calculate SHA-256 hash of a file */
export async function calculateFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Check if a PDF with the same content already exists */
export async function checkForDuplicates(
  file: File,
  token: string
): Promise<DuplicateCheckResult> {
  try {
    const contentHash = await calculateFileHash(file);
    const title = file.name.replace(/\.pdf$/i, '').replace(/_/g, ' ');

    const res = await fetch(`${BASE}/check-duplicate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ contentHash, title }),
    });

    return safeJson<DuplicateCheckResult>(res, {
      success: false,
      isDuplicate: false,
      duplicates: [],
      error: 'Server did not return a response.',
    });
  } catch (error) {
    console.error('Error checking for duplicates:', error);
    return {
      success: false,
      isDuplicate: false,
      duplicates: [],
      error: 'Failed to check for duplicates. Please try again.',
    };
  }
}

// ─── DEADLINE SERVICE ──────────────────────────────────────────────

export interface Deadline {
  id: string;
  pdfId: string;
  deadline: string;
  isOverdue: boolean;
  isPenaltyApplied: boolean;
  createdAt: string;
}

export interface SetDeadlineResult {
  success: boolean;
  data?: {
    id: string;
    pdfId: string;
    deadline: string;
    createdAt: string;
  };
  error?: string;
  message?: string;
}

export async function setDeadline(
  pdfId: string,
  deadline: string,
  token: string
): Promise<SetDeadlineResult> {
  const res = await fetch(`${BASE}/deadline`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ pdfId, deadline }),
  });

  return safeJson<SetDeadlineResult>(res, {
    success: false,
    error: 'Failed to set deadline',
  });
}

export async function getDeadline(
  pdfId: string,
  token: string
): Promise<{
  success: boolean;
  data?: Deadline;
  error?: string;
}> {
  const res = await fetch(`${BASE}/deadline/${encodeURIComponent(pdfId)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return safeJson(res, { success: false });
}

export async function getAllDeadlines(
  token: string
): Promise<{
  success: boolean;
  data?: Deadline[];
  error?: string;
}> {
  const res = await fetch(`${BASE}/deadlines`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return safeJson(res, { success: false });
}

export async function deleteDeadline(
  pdfId: string,
  token: string
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${BASE}/deadline/${encodeURIComponent(pdfId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return safeJson(res, { success: false });
}