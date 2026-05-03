// src/features/reader/components/PDFViewer.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { cn } from '../../../shared/utils/cn';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// Use whichever API base URL env var is configured (both are supported)
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? import.meta.env.VITE_API_URL ?? '') + '/api/pdf';

interface PDFViewerProps {
  documentId: string;
  initialPage?: number;
  isDark: boolean;
  token?: string;
}

/** One PDF page rendered to canvas (stacked for continuous scroll). */
function PDFPageCanvas({
  pdfDoc,
  pageNumber,
  scale,
  isDark,
}: {
  pdfDoc: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  isDark: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    (async () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          /* ignore */
        }
        renderTaskRef.current = null;
      }

      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const task = page.render({ canvasContext: ctx, canvas, viewport });
        renderTaskRef.current = task;
        await task.promise;
        renderTaskRef.current = null;
      } catch (err) {
        if ((err as { name?: string })?.name === 'RenderingCancelledException') return;
      }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          /* ignore */
        }
        renderTaskRef.current = null;
      }
    };
  }, [pdfDoc, pageNumber, scale]);

  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[900px] flex justify-center',
        'pb-6 last:pb-2',
      )}
    >
      <canvas
        ref={canvasRef}
        className={cn(
          'shadow-lg rounded-md border max-w-full h-auto',
          isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-white',
        )}
      />
    </div>
  );
}

export default function PDFViewer({ documentId, initialPage = 1, isDark, token }: PDFViewerProps) {
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const loadedDocRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);

  // Load PDF via fetch + ArrayBuffer so auth works reliably (pdf.js range requests often omit headers).
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setPdfDoc(null);
    setTotalPages(0);

    if (!documentId?.trim()) {
      setError('No PDF is linked to this lesson. Open the reader from a document on your dashboard.');
      setIsLoading(false);
      return;
    }

    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/file/${encodeURIComponent(documentId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!res.ok) {
          if (res.status === 401) {
            throw new Error('Sign in required to view this PDF.');
          }
          throw new Error(`Could not load file (${res.status}).`);
        }

        const buf = await res.arrayBuffer();
        if (cancelled) return;

        const doc = await pdfjsLib.getDocument({ data: buf }).promise;
        if (cancelled) {
          await doc.destroy().catch(() => {});
          return;
        }

        if (loadedDocRef.current) {
          await loadedDocRef.current.destroy().catch(() => {});
        }
        loadedDocRef.current = doc;

        setPdfDoc(doc);
        setTotalPages(doc.numPages);
        setIsLoading(false);
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Could not load PDF.';
        setError(msg);
        setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (loadedDocRef.current) {
        void loadedDocRef.current.destroy().catch(() => {});
        loadedDocRef.current = null;
      }
      setPdfDoc(null);
    };
  }, [documentId, token]);

  // Scroll to initial page once pages are mounted
  useEffect(() => {
    if (!pdfDoc || totalPages < 1 || isLoading) return;
    const target = Math.min(Math.max(initialPage, 1), totalPages);
    requestAnimationFrame(() => {
      const el = pageRefs.current.get(target);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [pdfDoc, totalPages, initialPage, isLoading]);

  const zoomOut = useCallback(() => {
    setScale((s) => Math.max(0.5, parseFloat((s - 0.1).toFixed(1))));
  }, []);

  const zoomIn = useCallback(() => {
    setScale((s) => Math.min(2.0, parseFloat((s + 0.1).toFixed(1))));
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ fontFamily: 'Poppins, sans-serif' }}>
      {/* Continuous scroll: all pages stacked */}
      <div
        className={cn(
          'flex-1 min-h-0 overflow-y-auto overflow-x-hidden',
          'bg-zinc-200/80 dark:bg-[#0c1220]',
        )}
      >
        {isLoading && (
          <div className="p-6 max-w-2xl mx-auto">
            <div className="animate-pulse bg-zinc-300 dark:bg-zinc-700 rounded-lg w-full h-[50vh]" />
            <div className="animate-pulse bg-zinc-200 dark:bg-zinc-800 rounded mt-3 w-1/3 h-4 mx-auto" />
          </div>
        )}

        {error && !isLoading && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-center px-4 py-16">
            <div className="text-4xl mb-4">📄</div>
            <p className="text-[#111827] dark:text-[#F1F5F9] font-medium text-base mb-2">
              Could not load PDF
            </p>
            <p className="text-[#6B7280] dark:text-[#94A3B8] text-sm max-w-md">{error}</p>
          </div>
        )}

        {!isLoading && !error && pdfDoc && totalPages > 0 && (
          <div className="py-6 px-3 md:px-6">
            {Array.from({ length: totalPages }, (_, i) => {
              const n = i + 1;
              return (
                <div
                  key={n}
                  ref={(el) => {
                    if (el) pageRefs.current.set(n, el);
                    else pageRefs.current.delete(n);
                  }}
                  className="mb-2"
                >
                  <p
                    className={cn(
                      'text-center text-[11px] font-semibold uppercase tracking-wider mb-2',
                      'text-zinc-500 dark:text-zinc-500',
                    )}
                  >
                    Page {n} of {totalPages}
                  </p>
                  <PDFPageCanvas pdfDoc={pdfDoc} pageNumber={n} scale={scale} isDark={isDark} />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Zoom only — scroll handles navigation */}
      <div
        className={cn(
          'shrink-0 h-12 flex items-center justify-center gap-4 px-4',
          'bg-white dark:bg-[#1e293b]',
          'border-t border-black/10 dark:border-white/10',
        )}
      >
        <button
          type="button"
          onClick={zoomOut}
          disabled={scale <= 0.5}
          className={cn(
            'p-2 rounded-lg transition-colors',
            scale > 0.5
              ? 'text-[#6B7280] dark:text-[#94A3B8] hover:bg-gray-100 dark:hover:bg-white/10'
              : 'text-gray-300 dark:text-white/20 cursor-not-allowed',
          )}
          aria-label="Zoom out"
        >
          <ZoomOut size={18} />
        </button>

        <span className="text-sm font-medium text-[#6B7280] dark:text-[#94A3B8] min-w-14 text-center tabular-nums">
          {Math.round(scale * 100)}%
        </span>

        <button
          type="button"
          onClick={zoomIn}
          disabled={scale >= 2.0}
          className={cn(
            'p-2 rounded-lg transition-colors',
            scale < 2.0
              ? 'text-[#6B7280] dark:text-[#94A3B8] hover:bg-gray-100 dark:hover:bg-white/10'
              : 'text-gray-300 dark:text-white/20 cursor-not-allowed',
          )}
          aria-label="Zoom in"
        >
          <ZoomIn size={18} />
        </button>

        <span className="text-xs text-[#9CA3AF] dark:text-[#64748B] hidden sm:inline pl-2 border-l border-black/10 dark:border-white/10">
          Scroll to read · {totalPages} {totalPages === 1 ? 'page' : 'pages'}
        </span>
      </div>
    </div>
  );
}