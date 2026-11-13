# 🚀 Necrolink Quick Start

Get up and running in 5 minutes.

## Prerequisites

- Node.js 18+ installed
- npm or yarn
- Git

## Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/necrolink.git
cd necrolink

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Add your Anthropic API key
# Edit .env.local and add:
# ANTHROPIC_API_KEY=your_key_here
```

## Run Locally

```bash
# Start development server
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## Quick Test

1. Upload a Markdown file with some URLs
2. Wait for the graveyard view to appear
3. See links classified as ghosts 👻, zombies 🧟, or living 🕯️
4. Click "Resurrect All" to fix broken links
5. Download your fixed document

## Development Workflow

### Run Tests
```bash
npm test
```

### Run Property-Based Tests
```bash
npm test -- property
```

### Lint Code
```bash
npm run lint
```

### Build for Production
```bash
npm run build
npm start
```

## Using the Wayback Machine MCP Server

The custom MCP server is in `.kiro/mcp-servers/wayback/`.

To use it in Kiro IDE:

1. Open Kiro settings
2. Add MCP server configuration
3. Point to `.kiro/mcp-servers/wayback/`
4. Restart Kiro
5. Use `wayback_search`, `wayback_get`, `wayback_closest` tools in chat

## Project Structure

```
necrolink/
├── .kiro/               # Kiro IDE configuration
│   ├── steering/        # Always-included context
│   ├── specs/           # Feature specifications
│   ├── hooks/           # Automated workflows
│   └── mcp-servers/     # Custom MCP servers
├── src/
│   ├── app/             # Next.js pages and API routes
│   ├── lib/             # Core logic
│   │   ├── extractors/  # Link extraction from documents
│   │   ├── checkers/    # Link health checking
│   │   ├── wayback/     # Internet Archive client
│   │   └── zombie/      # AI-powered content comparison
│   └── components/      # React components
├── tests/               # Test suites
└── public/              # Static assets
```

## Common Tasks

### Add a New Link Extractor

1. Read the spec: `.kiro/specs/01-link-extraction.md`
2. Create file: `src/lib/extractors/your-format.ts`
3. Write property-based tests: `tests/property/your-format.test.ts`
4. Add to extractor factory: `src/lib/extractors/index.ts`

### Test the Wayback API

```bash
# Query for snapshots
curl "http://web.archive.org/cdx/search/cdx?url=example.com&output=json&limit=5"

# Get archived page
curl "https://web.archive.org/web/20230615120000/https://example.com"
```

### Check Rate Limiting

The rate limiter is in `src/lib/wayback/rate-limiter.ts`:
- Max 5 requests/second to Wayback API
- Exponential backoff on 429/503 responses
- Logs all rate limit hits

## Debugging

### Enable Verbose Logging

Edit `.env.local`:
```
LOG_LEVEL=debug
```

### Test Zombie Detection

```bash
curl -X POST http://localhost:3000/api/zombie \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/page",
    "archivedContent": "original content here",
    "currentContent": "different content here"
  }'
```

### Inspect Wayback CDX Response

```bash
node scripts/test-wayback.js https://example.com
```

## Deployment

### AWS Amplify

```bash
amplify init
amplify add hosting
amplify publish
```

### Vercel (Alternative)

```bash
vercel
```

## Troubleshooting

### "Module not found" errors
```bash
rm -rf node_modules package-lock.json
npm install
```

### PDF extraction fails
Ensure `pdf-parse` is installed:
```bash
npm install pdf-parse
```

### Wayback API timeouts
Check rate limiting settings in `.env.local`:
```
WAYBACK_RATE_LIMIT=5
```

### Tests hanging
Kill background processes:
```bash
pkill -f jest
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT - see [LICENSE](LICENSE) file.

## Questions?

- Check the specs in `.kiro/specs/`
- Read the steering docs in `.kiro/steering/`
- Open an issue on GitHub

---

**Happy link resurrection! 👻🪦✨**
