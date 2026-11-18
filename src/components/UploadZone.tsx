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
        className={`tombstone stone mossy relative border-2 border-dashed px-5 pb-10 pt-10 text-center transition-[border-color,box-shadow] duration-300 sm:px-10 sm:pt-14 ${
          dragging
            ? 'border-status-living shadow-[0_0_40px_rgba(52,211,153,0.35)]'
            : 'border-night-600 hover:border-mist-faint'
        }`}
      >
        <p aria-hidden="true" className="engraved font-display text-sm tracking-[0.5em] text-mist-faint">
          R · I · P
        </p>
        <p className="mt-4 text-5xl sm:text-6xl" aria-hidden="true">
          <span className={`inline-block ${dragging ? 'ghost-bob' : ''}`}>{dragging ? '👻' : '⚰️'}</span>
        </p>
        <p className="engraved mt-4 text-balance font-display text-2xl text-mist sm:text-3xl">
          {dragging ? 'Release it into the graveyard' : 'Drop a document into the graveyard'}
        </p>
        <p id={hintId} className="mx-auto mt-2 max-w-md text-pretty text-sm text-mist-muted">
          PDF, Markdown or HTML, up to 10 MB. Files are read in memory and never stored.
        </p>

        <div className="mx-auto mt-7 flex max-w-xs flex-col items-stretch gap-3 sm:max-w-none sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            aria-describedby={hintId}
            className="min-h-11 rounded-full bg-mist px-6 py-2.5 font-semibold text-night shadow-[0_0_20px_rgba(230,237,243,0.15)] transition hover:bg-white disabled:opacity-50"
          >
            Choose a file
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onDemo}
            className="min-h-11 rounded-full border border-status-living/60 px-4 py-2.5 font-semibold sm:px-6 text-status-living transition hover:bg-status-living/10 hover:shadow-[0_0_24px_rgba(52,211,153,0.3)] disabled:opacity-50"
          >
            <span aria-hidden="true" className="flicker inline-block">🕯️</span> Try the demo document
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setPasting((p) => !p)}
            aria-expanded={pasting}
            aria-controls={pasteId}
            className="min-h-11 rounded-full px-4 py-2.5 text-sm text-mist-muted underline-offset-4 hover:text-mist hover:underline disabled:opacity-50"
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
        <div id={pasteId} className="stone mt-4 rounded-xl border border-night-600 p-4 sm:p-5">
          <label htmlFor={`${pasteId}-text`} className="block font-display text-lg text-mist">
            Markdown with links
          </label>
          <textarea
            id={`${pasteId}-text`}
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={6}
            placeholder={'See [the study](https://example.com/paper). Retrieved 2019-05-01.'}
            className="mt-2 w-full resize-y rounded-lg border border-night-600 bg-night-900/90 p-3 font-mono text-sm text-mist placeholder:text-mist-faint focus:border-status-living/60"
          />
          <button
            type="button"
            disabled={disabled || pasted.trim() === ''}
            onClick={() => accept(new File([pasted], 'pasted.md', { type: 'text/markdown' }))}
            className="mt-3 min-h-11 w-full rounded-full bg-mist px-6 py-2 font-semibold text-night hover:bg-white disabled:opacity-50 sm:w-auto"
          >
            Check these links
          </button>
        </div>
      )}
    </section>
  );
}
