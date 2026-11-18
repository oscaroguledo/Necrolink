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
      <div className="sticky bottom-4 z-10 mt-10 rounded-2xl border border-night-600 bg-night-900/95 p-4 shadow-2xl shadow-black/50 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-mist-muted">
            {isReport
              ? 'PDFs are not rewritten: download a report of every link and its fix.'
              : `${fixCount} ${fixCount === 1 ? 'link' : 'links'} will be resurrected or flagged. Everything else stays exactly as written.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onReset} className="rounded-full px-4 py-2 text-sm text-mist-muted hover:text-mist">
              Check another document
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onPreview}
              className="rounded-full border border-night-600 px-4 py-2 text-sm font-semibold text-mist hover:border-mist-muted disabled:opacity-50"
            >
              Preview
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onDownload}
              className="rounded-full bg-status-living px-5 py-2 text-sm font-bold text-night hover:bg-emerald-200 disabled:opacity-50"
            >
              <span aria-hidden="true">⏮️ </span>
              {busy ? 'Preparing…' : `Download ${what}`}
            </button>
          </div>
        </div>
      </div>

      <dialog
        ref={dialogRef}
        onClose={onClosePreview}
        aria-labelledby="preview-heading"
        className="w-[min(56rem,92vw)] rounded-2xl border border-night-600 bg-night-900 p-0 text-mist backdrop:bg-black/70"
      >
        <div className="flex items-center justify-between border-b border-night-600 px-5 py-3">
          <h2 id="preview-heading" className="font-display text-lg">
            Preview of the {what}
          </h2>
          <button type="button" onClick={onClosePreview} className="rounded-full px-3 py-1 text-sm text-mist-muted hover:text-mist">
            Close
          </button>
        </div>
        {/* Shown as text, never rendered: the content includes other sites' titles */}
        <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap wrap-break-word p-5 font-mono text-xs leading-relaxed text-mist">
          {preview}
        </pre>
      </dialog>
    </>
  );
}
