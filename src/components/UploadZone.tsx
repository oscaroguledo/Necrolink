'use client';

import { useId, useRef, useState } from 'react';

const ACCEPT = '.pdf,.md,.markdown,.html,.htm,application/pdf,text/markdown,text/html';
const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  onFile: (file: File) => void;
  onDemo: () => void;
  disabled?: boolean;
}

export function UploadZone({ onFile, onDemo, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [problem, setProblem] = useState<string>();
  const hintId = useId();
  const pasteId = useId();

  const accept = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setProblem('That file is larger than 10 MB.');
      return;
    }
    setProblem(undefined);
    onFile(file);
  };

  return (
    <section aria-labelledby="upload-heading" className="mx-auto w-full max-w-2xl">
      <h2 id="upload-heading" className="sr-only">
        Choose a document
      </h2>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) accept(e.dataTransfer.files[0]);
        }}
        className={`tombstone border-2 border-dashed px-6 pb-8 pt-12 text-center transition-colors ${
          dragging ? 'border-status-living bg-status-living/5' : 'border-night-600 bg-night-800/70'
        }`}
      >
        <p className="text-5xl motion-safe:animate-ghost-float" aria-hidden="true">
          ⚰️
        </p>
        <p className="mt-4 font-display text-2xl text-mist">Drop a document into the graveyard</p>
        <p id={hintId} className="mt-2 text-sm text-mist-muted">
          PDF, Markdown or HTML, up to 10 MB. Files are read in memory and never stored.
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            aria-describedby={hintId}
            className="rounded-full bg-mist px-5 py-2.5 font-semibold text-night transition hover:bg-white disabled:opacity-50"
          >
            Choose a file
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onDemo}
            className="rounded-full border border-status-living/60 px-5 py-2.5 font-semibold text-status-living transition hover:bg-status-living/10 disabled:opacity-50"
          >
            <span aria-hidden="true">🕯️ </span>Try the demo document
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setPasting((p) => !p)}
            aria-expanded={pasting}
            aria-controls={pasteId}
            className="rounded-full px-4 py-2.5 text-sm text-mist-muted underline-offset-4 hover:text-mist hover:underline disabled:opacity-50"
          >
            {pasting ? 'Hide paste box' : 'Or paste Markdown'}
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            accept(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {problem && (
          <p role="alert" className="mt-4 text-sm text-status-ghost">
            {problem}
          </p>
        )}
      </div>

      {pasting && (
        <div id={pasteId} className="mt-4 rounded-xl border border-night-600 bg-night-800/70 p-4">
          <label htmlFor={`${pasteId}-text`} className="block text-sm font-medium text-mist">
            Markdown with links
          </label>
          <textarea
            id={`${pasteId}-text`}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={6}
            placeholder={'See [the study](https://example.com/paper). Retrieved 2019-05-01.'}
            className="mt-2 w-full rounded-lg border border-night-600 bg-night-900 p-3 font-mono text-sm text-mist placeholder:text-mist-faint"
          />
          <button
            type="button"
            disabled={disabled || pasted.trim() === ''}
            onClick={() => accept(new File([pasted], 'pasted.md', { type: 'text/markdown' }))}
            className="mt-3 rounded-full bg-mist px-5 py-2 font-semibold text-night hover:bg-white disabled:opacity-50"
          >
            Check these links
          </button>
        </div>
      )}
    </section>
  );
}
