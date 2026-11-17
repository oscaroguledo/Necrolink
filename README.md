# 👻 Necrolink

**Resurrect dead and zombie links from the digital graveyard**

Necrolink finds broken links in your documents and brings them back to life using the Internet Archive's Wayback Machine. Unlike traditional link checkers that only catch 404s, Necrolink also detects **zombie links** — URLs that still load but no longer show the content you originally cited.

## 🪦 The Problem

Links rot. Research shows that a large portion of web pages from just 10 years ago are already gone. Academic citations, course syllabi, and blog posts are slowly filling up with dead links. Students, researchers, journalists, and Wikipedia editors all struggle with link decay.

## ✨ What Necrolink Does

Drop in a PDF, document, web page, or Markdown file. Necrolink checks every link and sorts them into four categories:

- **👻 Ghosts (dead links)**: Returns 404 or domain is gone. Necrolink replaces these with archived snapshots from the Internet Archive.
- **🪦 Lost souls (unrecoverable)**: Dead, and the Internet Archive has no copy. Necrolink lists these separately so you know to find another source.
- **🧟 Zombies (changed content)**: The link loads, but the content has changed or the domain was hijacked. AI compares the archived and current versions to detect drift.
- **🕯️ Living (healthy links)**: Nothing to fix.

You get back a fixed document with dead links replaced by archive URLs and zombie links flagged with explanations.

## 🎯 Current Status

**In active development** for the Kiroween 2026 hackathon (Dec 2026).

This project demonstrates advanced usage of Kiro IDE including:

- Custom MCP server for Wayback Machine integration
- Property-based testing for URL parsers
- Automated workflows with hooks and steering files
- Spec-driven development process

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test
```

Visit `http://localhost:3000` to start checking links.

## 📦 Features

### MVP (Must-Have)

- [X] Project setup and structure
- [x] Link extraction from PDF, Markdown, and web pages (`POST /api/extract`)
- [x] Link health checker (ghost/lost soul/zombie/living classification, `POST /api/check`)
- [x] Internet Archive Wayback Machine integration
- [x] AI-powered zombie detection
- [ ] Graveyard results interface
- [x] Export fixed documents (`POST /api/export`)

### Stretch Goals

- [ ] Browser extension
- [ ] GitHub Action for CI/CD link checking
- [ ] BibTeX citation support
- [ ] Batch processing for large document sets

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React, TypeScript
- **Backend**: Node.js API routes
- **AI**: Kiro API (zombie detection)
- **APIs**: Internet Archive Wayback Machine CDX API
- **Deployment**: AWS (Vercel-compatible)
- **Testing**: Vitest with fast-check property-based testing
- **Development**: Kiro IDE with custom MCP server

## 📚 Documentation

- [API Reference](docs/API.md) - `POST /api/extract`, `POST /api/check` and `POST /api/export`
- [Bugs Found by Property Tests](BUGS_FOUND.md) - What fast-check caught and how each bug was fixed
- [Product Vision](/.kiro/steering/product-vision.md) - The spooky theme and user experience
- [Technical Conventions](/.kiro/steering/technical-conventions.md) - Code standards and patterns
- [API Guidelines](/.kiro/steering/api-guidelines.md) - Rate limits and caching for external services
- [Specs](/.kiro/specs/) - Feature specifications and implementation plans

## 🤝 Contributing

This is a hackathon project developed with Kiro IDE. The `.kiro/` directory is intentionally committed to demonstrate the development workflow.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🏆 Acknowledgments

Built for Kiroween 2026. Special thanks to the Internet Archive for providing the Wayback Machine API that makes this project possible.
Links rot. A large share of web pages from about ten years ago are already gone (Pew Research has measured this), and academic citations rot fast too. Students, researchers, journalists, librarians and Wikipedia editors all deal with it. Your thesis bibliography, your course syllabus and your old blog are slowly filling up with ghosts.
