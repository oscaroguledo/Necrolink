# Contributing to Necrolink

This project is being developed for the AWS & Anthropic Hackathon (Dec 2024) using **Kiro IDE**.

## Development with Kiro

This project demonstrates Kiro's capabilities:

1. **Steering Files** (`.kiro/steering/`): Always-included context about product vision, technical conventions, and API usage
2. **Specs** (`.kiro/specs/`): Feature specifications with clear success criteria
3. **Hooks** (`.kiro/hooks/`): Automated workflows that run on file saves, test execution, etc.
4. **Custom MCP Server**: A Wayback Machine MCP server for seamless API integration

## Getting Started

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Run development server
npm run dev

# Run tests
npm test
```

## Development Workflow

### Making Changes

1. Read relevant steering files in `.kiro/steering/`
2. Check the spec in `.kiro/specs/` for the feature you're working on
3. Write property-based tests first (for parsers and normalization)
4. Implement the feature
5. Run tests and verify they pass
6. Commit with conventional commit messages

### Commit Message Format

```
feat(scope): add new feature
fix(scope): fix bug
docs(scope): update documentation
test(scope): add tests
refactor(scope): refactor code
```

Examples:
- `feat(extraction): add PDF link parser`
- `fix(wayback): handle CDX API timeouts`
- `test(zombie): add property tests for content diff`

### Hooks

Hooks in `.kiro/hooks/` will automatically:
- Run linters on file save
- Execute property tests before commits
- Update documentation when specs change

## Code Standards

- **TypeScript**: Strict mode always, no `any` types
- **Testing**: Property-based tests for parsers, unit tests for business logic
- **Formatting**: Prettier with 2-space indentation
- **Error Handling**: Use Result types, never swallow errors

See `.kiro/steering/technical-conventions.md` for full details.

## Testing

### Property-Based Tests
```bash
npm test -- property
```

Property-based tests use `fast-check` to generate random inputs and verify invariants:
- URL normalization is idempotent
- Document reconstruction preserves structure
- Date parsing never crashes

### Unit Tests
```bash
npm test -- unit
```

### Integration Tests
```bash
npm test -- integration
```

## API Development

All API routes follow a standard response shape:

```typescript
// Success
{ success: true, data: { /* result */ } }

// Error
{ success: false, error: { code: string, message: string } }
```

See `.kiro/steering/api-guidelines.md` for rate limiting and caching strategies.

## Hackathon Requirements

- ✅ All commits after Oct 30, 2024
- ✅ MIT License
- ✅ `.kiro/` directory committed (not in .gitignore)
- ✅ Public repository
- 🚧 Comprehensive README
- 🚧 Video demo (< 3 minutes)
- 🚧 Write-up document

## Questions?

Check the steering files first:
- Product questions → `.kiro/steering/product-vision.md`
- Technical questions → `.kiro/steering/technical-conventions.md`
- API questions → `.kiro/steering/api-guidelines.md`

## License

MIT - see LICENSE file
