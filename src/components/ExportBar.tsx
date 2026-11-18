'use client';

import { useEffect, useRef } from 'react';

interface Props {
  isReport: boolean;
  fixCount: number;
  busy: boolean;
  preview?: string;
  onPreview: () => void;
  onClosePreview: () => void;
  onDownload: () => void;
  onReset: () => void;
}

export function ExportBar({ isReport, fixCount, busy, preview, onPreview, onClosePreview, onDownload, onReset }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (preview !== undefined && !dialog.open) dialog.showModal();
    if (preview === undefined && dialog.open) dialog.close();
  }, [preview]);

  const what = isReport ? 'resurrection report' : 'fixed document';

  return (
    <>
      <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-10 mt-10 rounded-2xl border border-status-living/25 bg-night-900/95 p-3 shadow-[0_-8px_40px_-12px_rgba(52,211,153,0.25),0_20px_50px_-10px_rgba(0,0,0,0.8)] backdrop-blur-sm sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-pretty text-sm text-mist-muted">
            <span aria-hidden="true">⚱️ </span>
            {isReport
              ? 'PDFs are not rewritten: download a report of every link and its fix.'
              : `${fixCount} ${fixCount === 1 ? 'link' : 'links'} will be resurrected or flagged. Everything else stays exactly as written.`}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
            <button
              type="button"
              onClick={onReset}
              className="order-3 col-span-2 min-h-11 rounded-full px-4 py-2 text-sm text-mist-muted hover:text-mist sm:order-none sm:col-span-1"
            >
              Check another document
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onPreview}
              className="min-h-11 rounded-full border border-night-600 px-4 py-2 text-sm font-semibold text-mist hover:border-mist-muted disabled:opacity-50"
            >
              Preview
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDownload}
              className="min-h-11 rounded-full bg-status-living px-5 py-2 text-sm font-bold text-night shadow-[0_0_24px_rgba(52,211,153,0.45)] transition hover:bg-emerald-200 hover:shadow-[0_0_36px_rgba(52,211,153,0.65)] disabled:opacity-50"
            >
              <span aria-hidden="true">⚡ </span>
              {busy ? 'Preparing…' : `Download ${what}`}
            </button>
          </div>
        </div>
      </div>

      <dialog
        ref={dialogRef}
        onClose={onClosePreview}
        aria-labelledby="preview-heading"
        className="m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-night-900 p-0 text-mist sm:m-auto sm:h-auto sm:max-h-[85vh] sm:w-[min(56rem,92vw)] sm:rounded-2xl sm:border sm:border-night-600"
      >
        <div className="flex h-full flex-col sm:max-h-[85vh]">
          <div className="flex items-center justify-between gap-3 border-b border-night-600 px-4 py-3 sm:px-5">
            <h2 id="preview-heading" className="font-display text-lg sm:text-xl">
              <span aria-hidden="true">📜 </span>Preview of the {what}
            </h2>
            <button
              type="button"
              onClick={onClosePreview}
              className="min-h-11 shrink-0 rounded-full px-4 text-sm text-mist-muted hover:text-mist"
            >
              Close
            </button>
          </div>
          {/* Shown as text, never rendered: the content includes other sites' titles */}
          <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap wrap-break-word p-4 font-mono text-xs leading-relaxed text-mist sm:p-5">
            {preview}
          </pre>
        </div>
      </dialog>
    </>
  );
}
