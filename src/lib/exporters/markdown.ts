/**
 * Markdown export (spec 04): rewrite a document with resurrected links.
 *
 * Edits are spliced into the ORIGINAL text at the positions remark reports,
 * instead of re-serializing the AST (remark-stringify), which would reformat
 * the whole document (list markers, emphasis, escaping). Everything that is
 * not a changed link stays byte-for-byte identical. Links inside code are not
 * link nodes, so they are never touched.
 */

import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import type { Root, Link, LinkReference, Definition, Html, Node as MdNode } from 'mdast';
import type { ExtractedLink } from '@/types/link';
import { ruleCursor, summaryLine, NECROLINK_URL, type ReplacementRule, type ExportStats } from './replacement-map';

interface Edit {
  start: number;
  end: number;
  text: string;
}

export const MARKERS = { ghost: '👻→⏮️ ', zombie: '🧟 ', lost: '🪦 ' } as const;

/** Footnote label namespaced so it never collides with the author's own [^1]. */
export const footnoteLabel = (n: number) => `[^necrolink-${n}]`;

/** Escape text so it renders literally in Markdown (no links, HTML or emphasis). */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<>#|]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : `\\${c}`));
}

const offsetOf = (node: MdNode | undefined, edge: 'start' | 'end') => node?.position?.[edge]?.offset;

/** Offsets of a link's text (between its brackets), from its children or the bracket. */
function textRange(content: string, node: Link | LinkReference): { start: number; end: number } | undefined {
  const nodeStart = offsetOf(node, 'start');
  if (nodeStart === undefined || content[nodeStart] !== '[') return undefined;
  const first = node.children[0];
  const last = node.children[node.children.length - 1];
  const start = offsetOf(first, 'start') ?? nodeStart + 1;
  const end = offsetOf(last, 'end') ?? content.indexOf(']', nodeStart);
  return end >= start ? { start, end } : undefined;
}

/**
 * Apply replacement rules to a Markdown document.
 * @param links the links extracted from this same content (for matching rules)
 */
export function exportMarkdown(
  content: string,
  links: Pick<ExtractedLink, 'id' | 'originalUrl'>[],
  rules: ReplacementRule[],
  stats: ExportStats,
  now: Date = new Date()
): string {
  const tree = unified().use(remarkParse).parse(content) as Root;
  const definitions = new Map<string, string>();
  visit(tree, 'definition', (node: Definition) => {
    definitions.set(node.identifier.toLowerCase(), node.url);
  });

  const cursor = ruleCursor(links, rules);
  const edits: Edit[] = [];
  const notes: string[] = [];

  // Same traversal and filters as the Markdown extractor, so occurrences line up
  visit(tree, (node) => {
    let url: string | undefined;
    if (node.type === 'link') url = (node as Link).url;
    else if (node.type === 'linkReference') url = definitions.get((node as LinkReference).identifier.toLowerCase());
    else if (node.type === 'html') url = /^<(https?:\/\/[^>]+)>$/.exec((node as Html).value)?.[1];
    if (!url || url.startsWith('#') || url.startsWith('mailto:')) return;

    const rule = cursor.next(url);
    const start = offsetOf(node, 'start');
    const end = offsetOf(node, 'end');
    if (!rule || start === undefined || end === undefined) return;

    const source = content.slice(start, end);
    const isAngleAutolink = source.startsWith('<');
    const range = node.type === 'html' || isAngleAutolink ? undefined : textRange(content, node as Link | LinkReference);
    const marker = MARKERS[rule.type];

    if (rule.type === 'ghost') {
      const newUrl = rule.newUrl!;
      if (!range) {
        // <https://dead.example> → 👻→⏮️ <https://web.archive.org/...>
        edits.push({ start, end, text: `${marker}<${newUrl}>` });
        return;
      }
      const label = content.slice(range.start, range.end);
      // Inline link: swap just the URL if it appears verbatim after "](";
      // otherwise (reference link, escaped URL) rewrite as an inline link
      const destStart = content.indexOf('](', range.end);
      const urlAt = node.type === 'link' && destStart !== -1 && destStart < end ? content.indexOf(url, destStart) : -1;
      if (urlAt !== -1 && urlAt + url.length <= end) {
        edits.push({ start: range.start, end: range.start, text: marker });
        edits.push({ start: urlAt, end: urlAt + url.length, text: newUrl });
      } else {
        edits.push({ start, end, text: `[${marker}${label}](${newUrl})` });
      }
      return;
    }

    // Zombie or lost soul: keep the URL, mark it, add a footnote reference
    const n = rule.footnote!;
    edits.push({ start: range ? range.start : start, end: range ? range.start : start, text: marker });
    edits.push({ start: end, end, text: footnoteLabel(n) });
    const prefix = rule.type === 'zombie' ? '🧟 This link may have changed:' : '🪦 Lost soul:';
    notes.push(`${footnoteLabel(n)}: ${prefix} ${escapeMarkdown(rule.note ?? '')}`);
  });

  // Apply from the end so earlier offsets stay valid
  let output = content;
  for (const edit of edits.sort((a, b) => b.start - a.start || b.end - a.end)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }

  const date = now.toISOString().slice(0, 10);
  let appendix = '\n\n---\n\n';
  if (notes.length > 0) appendix += `## 🪦 Necrolink Notes\n\n${notes.join('\n\n')}\n\n`;
  appendix += `*Fixed by [Necrolink](${NECROLINK_URL}) on ${date}: ${summaryLine(stats)}.*\n`;
  return output.replace(/\s*$/, '') + appendix;
}
