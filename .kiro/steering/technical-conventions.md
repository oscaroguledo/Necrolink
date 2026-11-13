---
name: Technical Conventions
description: Code standards, patterns, and architectural decisions for Necrolink
inclusion: always
---

# 🛠️ Technical Conventions

## Architecture Overview

```
┌─────────────────────────────────────────┐
│         Next.js Frontend                │
│  (React, TypeScript, Tailwind)          │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│       API Routes (Node.js)              │
│  /api/extract   - Pull links from docs  │
│  /api/check     - Classify link health  │
│  /api/resurrect - Fetch archive URLs    │
│  /api/export    - Generate fixed doc    │
└──────────────┬──────────────────────────┘
               │
      ┌────────┴────────┐
      │                 │
┌─────▼─────┐    ┌──────▼──────┐
│  Wayback  │    │   Claude    │
│  Machine  │    │  (Zombie    │
│    API    │    │  Detection) │
└───────────┘    └─────────────┘
```

## File Structure

```
necrolink/
├── .kiro/
│   ├── steering/          # Product and technical guidance
│   ├── specs/             # Feature specifications
│   ├── hooks/             # Automated workflows
│   └── mcp-servers/       # Custom Wayback Machine MCP server
├── src/
│   ├── app/               # Next.js App Router
│   │   ├── page.tsx       # Upload interface
│   │   ├── graveyard/     # Results view
│   │   └── api/           # API routes
│   ├── lib/
│   │   ├── extractors/    # PDF, MD, HTML parsers
│   │   ├── checkers/      # Link classification logic
│   │   ├── wayback/       # Internet Archive client
│   │   ├── zombie/        # AI content comparison
│   │   └── exporters/     # Document reconstruction
│   ├── components/        # React components
│   └── types/             # TypeScript definitions
├── tests/
│   ├── unit/              # Pure function tests
│   ├── integration/       # API route tests
│   └── property/          # Property-based tests
└── public/                # Static assets
```

## TypeScript Standards

### Strict Mode Always
```typescript
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

### Type Everything
- No `any` types except in explicit deserializer boundaries
- Use discriminated unions for variants
- Prefer interfaces for public contracts, types for internal shapes

### Core Types
```typescript
// src/types/link.ts
export type LinkStatus = 'ghost' | 'zombie' | 'living';

export interface Link {
  url: string;
  text: string;
  position: Position; // where in the document
  status: LinkStatus;
  error?: string;
  archived?: ArchivedSnapshot;
  zombie?: ZombieReport;
}

export interface Position {
  page?: number; // for PDFs
  line?: number; // for text formats
  offset: number; // character offset
}

export interface ArchivedSnapshot {
  url: string;
  timestamp: string; // ISO 8601
  closest: boolean; // is this the closest to citation date?
}

export interface ZombieReport {
  reason: string; // human-readable explanation
  confidence: number; // 0-1
  diff: ContentDiff;
}

export interface ContentDiff {
  titleChanged: boolean;
  bodyChanged: boolean;
  domainTakeover: boolean;
  redirectTarget?: string;
}
```

## Error Handling

### Use Result Types
```typescript
// src/lib/result.ts
export type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

// Usage
export async function checkLink(url: string): Promise<Result<LinkStatus>> {
  try {
    const response = await fetch(url);
    return { ok: true, value: classifyResponse(response) };
  } catch (error) {
    return { ok: false, error: error as Error };
  }
}
```

### Never Swallow Errors Silently
- Log all errors with context
- Return meaningful error messages to users
- Use structured logging (JSON)

## API Route Conventions

### Standard Response Shape
```typescript
// Success
{
  "success": true,
  "data": { /* result */ }
}

// Error
{
  "success": false,
  "error": {
    "code": "WAYBACK_TIMEOUT",
    "message": "Internet Archive is temporarily unavailable",
    "retryable": true
  }
}
```

### Rate Limiting
- Implement per-IP rate limiting on all API routes
- Return 429 with `Retry-After` header
- Use exponential backoff for external API calls

### Validation
- Validate all inputs with Zod schemas
- Return 400 with specific field errors
- Never trust client data

## Testing Strategy

### Property-Based Testing for Parsers
Use `fast-check` for URL normalization, date extraction, and document reconstruction:

```typescript
// tests/property/url-normalization.test.ts
import fc from 'fast-check';

test('URL normalization is idempotent', () => {
  fc.assert(
    fc.property(fc.webUrl(), (url) => {
      const once = normalizeUrl(url);
      const twice = normalizeUrl(once);
      expect(once).toBe(twice);
    })
  );
});

test('normalized URLs preserve domain and path', () => {
  fc.assert(
    fc.property(fc.webUrl(), (url) => {
      const normalized = normalizeUrl(url);
      const original = new URL(url);
      const result = new URL(normalized);
      expect(result.hostname).toBe(original.hostname);
      expect(result.pathname).toBe(original.pathname);
    })
  );
});
```

### Unit Tests for Business Logic
- Test each link checker independently
- Mock external APIs (Wayback, Claude)
- Aim for 80%+ coverage on `src/lib/`

### Integration Tests for API Routes
- Test the full request/response cycle
- Use real sample documents
- Verify error handling paths

## Performance Requirements

### Response Time Targets
- Upload acceptance: < 500ms
- Link extraction: < 2s per document
- Link checking: < 100ms per URL (with concurrency)
- Zombie detection: < 3s per suspicious link
- Document export: < 1s

### Concurrency
- Check links in parallel (max 10 concurrent)
- Rate limit Wayback queries to 5/second
- Batch zombie detection queries

### Caching
- Cache Wayback CDX lookups for 24 hours
- Cache link health checks for 1 hour
- Use Redis if deployed, in-memory for local dev

## Code Style

### Formatting
- Prettier with default settings
- 2-space indentation
- Single quotes for strings
- Trailing commas

### Naming
- Components: PascalCase (`GraveyardView.tsx`)
- Functions: camelCase (`checkLinkHealth()`)
- Constants: SCREAMING_SNAKE_CASE (`MAX_CONCURRENT_CHECKS`)
- Files: kebab-case for non-components (`url-parser.ts`)

### Component Patterns
```typescript
// Use composition over complex props
function GraveyardCard({ link }: { link: Link }) {
  return (
    <Card>
      <LinkIcon status={link.status} />
      <LinkDetails link={link} />
      <LinkActions link={link} />
    </Card>
  );
}

// Keep components small and focused
// If a component is > 150 lines, split it
```

## Git Workflow

### Commit Messages
Follow conventional commits:
```
feat(extraction): add PDF link parser
fix(wayback): handle CDX API timeouts
docs(readme): update setup instructions
test(zombie): add property tests for content diff
```

### Branches
- `main`: always deployable
- `feature/*`: new features
- `fix/*`: bug fixes
- `docs/*`: documentation only

### Important: Hackathon Rules
- All commits must be after Oct 30, 2024
- Commit `.kiro/` directory (don't add to `.gitignore`)
- Keep commit history clean and meaningful

## Environment Variables

```bash
# .env.local
WAYBACK_API_KEY=          # if we get API access
ANTHROPIC_API_KEY=        # for zombie detection
NEXT_PUBLIC_APP_URL=      # for CORS
NODE_ENV=development
RATE_LIMIT_MAX=100        # requests per 15 minutes
```

Never commit `.env.local` — use `.env.example` for documentation.

## Deployment

### AWS Deployment (Preferred for Hackathon)
- Use AWS Amplify or Elastic Beanstalk
- Store credentials in AWS Secrets Manager
- Set up CloudWatch for logging
- Enable HTTPS only

### Vercel (Backup)
- Zero-config deployment
- Automatic HTTPS and CDN
- Built-in analytics

## Monitoring and Logging

### Log Structured Data
```typescript
logger.info('link_checked', {
  url: link.url,
  status: link.status,
  duration_ms: elapsed,
  archived_found: !!link.archived
});
```

### Track Key Metrics
- Links checked per document (histogram)
- Ghost/zombie/living ratio (percentage)
- Wayback API latency (percentiles)
- Zombie detection accuracy (user feedback)

## Security Checklist

- [ ] Validate all file uploads (type, size)
- [ ] Sanitize URLs before checking
- [ ] Rate limit all endpoints
- [ ] Use HTTPS everywhere
- [ ] Set security headers (CSP, X-Frame-Options)
- [ ] Don't log sensitive data
- [ ] Expire uploaded files after 24 hours

---

**Remember**: We're building for a hackathon demo, but write production-quality code. The judges will read this, and the write-up should show we thought about edge cases, testing, and deployment.