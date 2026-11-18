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
import { STATUS, STATUS_ORDER, type ResultStatus } from './status';

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
    <main
      data-phase={phase}
      className="mx-auto min-h-dvh w-full max-w-6xl px-4 pb-[clamp(7rem,24vh,15rem)] pt-8 sm:px-6 sm:pt-12 lg:px-8"
    >
      <header className="mb-8 text-center sm:mb-12">
        <h1 className="font-spooky text-[clamp(2.75rem,11vw,5.5rem)] leading-none">
          <span className="spooky-title inline-flex items-center gap-2 sm:gap-4">
            <span aria-hidden="true" className="ghost-bob inline-block text-[0.8em]">
              👻
            </span>
            Necrolink
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-mist-muted sm:text-lg">
          Find the dead and zombie links in your papers, then raise them from the Internet Archive.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="mx-auto mb-6 flex max-w-2xl items-start gap-3 rounded-xl border border-status-ghost/50 bg-status-ghost/10 px-4 py-3 text-status-ghost"
        >
          <span aria-hidden="true" className="text-xl leading-none">
            🦇
          </span>
          <p>{error}</p>
        </div>
      )}

      {phase === 'idle' && (
        <>
          <UploadZone onFile={start} onDemo={() => start(new File([DEMO_DOCUMENT], DEMO_FILENAME, { type: 'text/markdown' }))} />
          <ul
            className="mx-auto mt-10 grid max-w-4xl grid-cols-2 gap-3 text-sm sm:mt-14 sm:gap-4 lg:grid-cols-4"
            aria-label="What Necrolink finds"
          >
            {(['ghost', 'zombie', 'lost', 'living'] as const).map((s) => (
              <li key={s} className={`tombstone stone mossy haunt border px-3 pb-5 pt-5 text-center sm:px-4 ${STATUS[s].border}`}>
                <ScanLegend status={s} />
              </li>
            ))}
          </ul>
        </>
      )}

      {phase === 'extracting' && <Digging />}

      {doc && (phase === 'checking' || phase === 'done') && (
        <div className="space-y-10 sm:space-y-12">
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

      <footer className="mt-16 text-pretty text-center text-xs text-mist-faint sm:mt-20">
        Archived copies come from the{' '}
        <a href="https://web.archive.org/" target="_blank" rel="noopener noreferrer" className="underline hover:text-mist">
          Internet Archive Wayback Machine
        </a>
        . Built for Kiroween 2026.
      </footer>
    </main>
  );
}

/** Shown while the document is read: a shovel at work and graves rising. */
function Digging() {
  return (
    <section aria-labelledby="digging-heading" className="mx-auto max-w-2xl text-center">
      <p aria-hidden="true" className="dig inline-block text-5xl sm:text-6xl">
        ⚰️
      </p>
      <h2 id="digging-heading" className="mt-4 font-display text-2xl text-mist sm:text-3xl" aria-live="polite">
        Digging up the links…
      </h2>
      <p className="mt-2 text-sm text-mist-muted">Reading your document. Nothing is stored.</p>
      <div aria-hidden="true" className="mt-10 flex items-end justify-center gap-3 sm:gap-5">
        {[0, 0.25, 0.5].map((delay, i) => (
          <div
            key={i}
            className="tombstone stone rise-up w-20 border border-night-600 sm:w-28"
            style={{ height: `${[5.5, 7, 6][i]}rem`, animationDelay: `${delay}s` }}
          >
            <div className="mx-auto mt-6 h-2 w-10 rounded bg-night-600/80 sm:w-14" />
            <div className="mx-auto mt-2 h-2 w-8 rounded bg-night-600/60 sm:w-10" />
          </div>
        ))}
      </div>
    </section>
  );
}

function ScanLegend({ status }: { status: 'ghost' | 'zombie' | 'lost' | 'living' }) {
  const text = {
    ghost: ['👻', 'Ghosts', 'Dead links, raised from the archive'],
    zombie: ['🧟', 'Zombies', 'Still load, but the content changed'],
    lost: ['🪦', 'Lost souls', 'Dead, with no archived copy'],
    living: ['🕯️', 'Living', 'Still breathing. Nothing to fix'],
  }[status];
  return (
    <>
      <p aria-hidden="true" className={`text-2xl sm:text-3xl ${status === 'living' ? 'flicker' : ''}`}>
        {text[0]}
      </p>
      <p className={`engraved mt-2 font-display text-lg ${STATUS[status].text}`}>{text[1]}</p>
      <p className="mt-1 text-pretty text-xs text-mist-muted sm:text-sm">{text[2]}</p>
    </>
  );
}
