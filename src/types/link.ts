/**
 * Core types for Necrolink
 */

export type LinkStatus = 'ghost' | 'zombie' | 'living' | 'checking' | 'error';

export interface Position {
  page?: number; // for PDFs
  line?: number; // for text formats
  offset: number; // character offset in source
}

export interface Link {
  id: string; // unique identifier
  url: string; // normalized URL
  originalUrl: string; // URL as found in document
  text: string; // link text/anchor text
  position: Position;
  context: string; // surrounding text (for citation date extraction)
  status: LinkStatus;
  error?: string;
  archived?: ArchivedSnapshot;
  zombie?: ZombieReport;
  citationDate?: Date;
}

export interface ArchivedSnapshot {
  url: string; // Wayback Machine URL
  timestamp: string; // ISO 8601
  originalTimestamp: string; // YYYYMMDDhhmmss format from CDX
  statusCode: string;
  mimeType: string;
  closestToDate?: Date; // if we were looking for a specific date
}

export interface ZombieReport {
  reason: string; // human-readable explanation
  confidence: number; // 0-1
  changes: ContentChanges;
}

export interface ContentChanges {
  titleChanged: boolean;
  contentDrift: 'none' | 'minor' | 'major' | 'complete';
  possibleTakeover: boolean; // domain hijacking, parking page, spam
  redirectTarget?: string;
}

export interface DocumentMetadata {
  id: string;
  filename: string;
  type: 'pdf' | 'markdown' | 'html' | 'docx';
  uploadedAt: Date;
  size: number; // bytes
  linkCount: number;
}

export interface ExtractionResult {
  document: DocumentMetadata;
  links: Link[];
  stats: {
    total: number;
    unique: number;
    withDates: number;
  };
}

export interface CheckResult {
  linkId: string;
  url: string;
  status: LinkStatus;
  archived?: ArchivedSnapshot;
  zombie?: ZombieReport;
  error?: string;
  checkedAt: Date;
}

export interface GraveyardStats {
  ghosts: number;
  zombies: number;
  living: number;
  errors: number;
  total: number;
}
