'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  checkAllLinks,
  exportDocument,
  extractDocument,
  saveFile,
  ApiError,
  type ClientResult,
  type ExtractedDocument,
} from '@/lib/client/api';
import { DEMO_DOCUMENT, DEMO_FILENAME } from '@/lib/client/demo';
import { UploadZone } from './UploadZone';
import { ScanProgress } from './ScanProgress';
import { Graveyard } from './Graveyard';
import { ExportBar } from './ExportBar';
import { STATUS_ORDER, type ResultStatus } from './status';

type Phase = 'idle' | 'extracting' | 'checking' | 'done';

const FIXABLE = new Set(['ghost', 'zombie', 'lost']);

export function NecrolinkApp() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [doc, setDoc] = useState<ExtractedDocument>();
  const [content, setContent] = useState<string>();
  const [results, setResults] = useState<Map<string, ClientResult>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string>();
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState<string>();
  const abortRef = useRef<AbortController | undefined>(undefined);

  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<ResultStatus, number>;
    for (const r of results.values()) c[r.status as ResultStatus]++;
    return c;
  }, [results]);

  const start = useCallback(async (file: File) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(undefined);
    setResults(new Map());
    setSelected(new Set());
    setPreview(undefined);
    setPhase('extracting');

    try {
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      const [extracted, text] = await Promise.all([
        extractDocument(file, controller.signal),
        isPdf ? Promise.resolve(undefined) : file.text(),
      ]);
      setDoc(extracted);
      setContent(text);
      setPhase('checking');

      await checkAllLinks(
        extracted.links,
        (result) => {
          setResults((prev) => new Map(prev).set(result.linkId, result));
          // Selected for fixing by default; the user can untick any of them
          if (FIXABLE.has(result.status)) setSelected((prev) => new Set(prev).add(result.linkId));
        },
        controller.signal
      );
      setPhase('done');
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
      setPhase((p) => (p === 'checking' ? 'done' : 'idle'));
    }
  }, []);

  const cancel = () => {
    abortRef.current?.abort();
    setPhase('done');
  };

  const reset = () => {
    abortRef.current?.abort();
    setPhase('idle');
    setDoc(undefined);
    setContent(undefined);
    setResults(new Map());
    setSelected(new Set());
    setError(undefined);
    setPreview(undefined);
  };

  const toggle = (linkId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(linkId)) next.delete(linkId);
      else next.add(linkId);
      return next;
    });

  const runExport = async (mode: 'preview' | 'download') => {
    if (!doc) return;
    setExporting(true);
    setError(undefined);
    try {
      const file = await exportDocument(doc, content, [...results.values()], selected);
      if (mode === 'download') saveFile(file);
      else setPreview(file.text.length > 200_000 ? `${file.text.slice(0, 200_000)}\n\n… (preview truncated)` : file.text);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const fixCount = [...selected].filter((id) => results.has(id)).length;

  return (
    <main className="mx-auto min-h-screen max-w-5xl px-4 pb-16 pt-10 sm:px-6">
      <header className="mb-10 text-center">
        <h1 className="font-display text-5xl tracking-tight text-mist sm:text-6xl">
          <span aria-hidden="true" className="inline-block motion-safe:animate-ghost-float">
            👻
          </span>{' '}
          Necrolink
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-lg text-mist-muted">
          Find the dead and zombie links in your papers, then bring them back from the Internet Archive.
        </p>
      </header>

      {error && (
        <p role="alert" className="mx-auto mb-6 max-w-2xl rounded-xl border border-status-ghost/50 bg-status-ghost/10 px-4 py-3 text-status-ghost">
          {error}
        </p>
      )}

      {phase === 'idle' && (
        <>
          <UploadZone onFile={start} onDemo={() => start(new File([DEMO_DOCUMENT], DEMO_FILENAME, { type: 'text/markdown' }))} />
          <ul className="mx-auto mt-10 grid max-w-3xl gap-4 text-sm sm:grid-cols-4" aria-label="What Necrolink finds">
            {(['ghost', 'zombie', 'lost', 'living'] as const).map((s) => (
              <li key={s} className="rounded-xl border border-night-600 bg-night-800/50 p-4">
                <ScanLegend status={s} />
              </li>
            ))}
          </ul>
        </>
      )}

      {phase === 'extracting' && (
        <p className="text-center text-lg text-mist-muted" aria-live="polite">
          <span aria-hidden="true">🕯️ </span>Digging up the links…
        </p>
      )}

      {doc && (phase === 'checking' || phase === 'done') && (
        <div className="space-y-10">
          <ScanProgress filename={doc.filename} total={doc.links.length} counts={counts} checking={phase === 'checking'} onCancel={cancel} />
          <Graveyard links={doc.links} results={results} selected={selected} onToggle={toggle} />
          {phase === 'done' && results.size > 0 && (
            <ExportBar
              isReport={doc.type === 'pdf'}
              fixCount={fixCount}
              busy={exporting}
              preview={preview}
              onPreview={() => runExport('preview')}
              onClosePreview={() => setPreview(undefined)}
              onDownload={() => runExport('download')}
              onReset={reset}
            />
          )}
        </div>
      )}

      <footer className="mt-16 text-center text-xs text-mist-faint">
        Archived copies come from the{' '}
        <a href="https://web.archive.org/" target="_blank" rel="noopener noreferrer" className="underline hover:text-mist">
          Internet Archive Wayback Machine
        </a>
        . Built for Kiroween 2026.
      </footer>
    </main>
  );
}

function ScanLegend({ status }: { status: 'ghost' | 'zombie' | 'lost' | 'living' }) {
  const text = {
    ghost: ['👻', 'Ghosts', 'Dead links, resurrected from the archive'],
    zombie: ['🧟', 'Zombies', 'Still load, but the content changed'],
    lost: ['🪦', 'Lost souls', 'Dead, with no archived copy'],
    living: ['🕯️', 'Living', 'Still fine'],
  }[status];
  return (
    <>
      <p className="font-semibold text-mist">
        <span aria-hidden="true">{text[0]} </span>
        {text[1]}
      </p>
      <p className="mt-1 text-mist-muted">{text[2]}</p>
    </>
  );
}
