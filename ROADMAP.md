# 🗓️ Necrolink Development Roadmap

**Hackathon Deadline**: December 4, 2024, 2:00 PM Pacific (5:00 PM Eastern)

## Week 1: Nov 12–18 (Foundation)

### Day 1-2: Project Setup ✅
- [x] Initialize repository with MIT license
- [x] Set up Next.js + TypeScript + Jest
- [x] Create steering documents (product, technical, API)
- [x] Write first spec (link extraction)
- [x] Configure Kiro hooks (test-on-save, README sync)
- [x] Create comprehensive README

### Day 3-4: Link Extraction
- [ ] Install dependencies (pdf-parse, unified, cheerio, fast-check)
- [ ] Implement URL normalization with property-based tests
- [ ] Implement Markdown link extractor
- [ ] Implement HTML link extractor
- [ ] Start PDF link extractor (basic version)
- [ ] Create `/api/extract` endpoint
- [ ] Test with real documents

### Day 5-7: Document First MVP
- [ ] Get ONE real PDF working end-to-end
- [ ] Show extracted links in simple UI
- [ ] Verify property tests catch actual bugs
- [ ] Document bugs found for write-up
- [ ] Update README with progress

**Deliverable**: Can extract links from a real academic paper

## Week 2: Nov 19–25 (Core Features)

### Day 8-10: Wayback Machine Integration
- [ ] Write spec for link checking
- [ ] Implement CDX API client with rate limiting
- [ ] Build response caching layer (in-memory for now)
- [ ] Create link status classifier (ghost/zombie/living)
- [ ] Create `/api/check` endpoint
- [ ] Test with rate limiting and error handling

### Day 11-12: Custom MCP Server
- [ ] Design Wayback Machine MCP server protocol
- [ ] Implement MCP server for Wayback API
- [ ] Test MCP server within Kiro
- [ ] Document MCP server setup
- [ ] Add to `.kiro/mcp-servers/`

**Key for write-up**: This is the standout Kiro feature

### Day 13-14: Zombie Detection
- [ ] Write spec for zombie detection
- [ ] Implement page content fetcher
- [ ] Build AI comparison prompt
- [ ] Integrate kiro kiro API
- [ ] Test with known zombie cases
- [ ] Create `/api/zombie` endpoint

**Deliverable**: Can detect when a link's content has changed

## Week 3: Nov 26–Dec 1 (Polish & Deploy)

### Day 15-16: Graveyard Interface
- [ ] Design graveyard results view (Figma or sketch)
- [ ] Build upload interface
- [ ] Build results dashboard with ghost/zombie/living sections
- [ ] Add resurrection action (replace with archive URL)
- [ ] Show before/after preview

### Day 17-18: Document Export
- [ ] Write spec for document reconstruction
- [ ] Implement fixed document generator
- [ ] Add download functionality
- [ ] Test that structure is preserved
- [ ] Property test: reconstruction preserves non-URL content

### Day 19-20: Deployment
- [ ] Set up AWS deployment (Amplify or Elastic Beanstalk)
- [ ] Configure environment variables
- [ ] Add Redis for caching (production)
- [ ] Test deployed version
- [ ] Set up monitoring/logging

### Day 21: Start Dev Log
- [ ] Begin blog post draft
- [ ] Document interesting bugs found by property tests
- [ ] Screenshot the MCP server in action
- [ ] List all Kiro features used

**Deliverable**: Working app deployed on AWS

## Week 4: Dec 2–4 (Submission)

### Day 22-23: Video Demo
- [ ] Write script (under 3 minutes)
- [ ] Record screen capture
- [ ] Show real broken document → fixed version
- [ ] Highlight zombie detection
- [ ] Demonstrate MCP server
- [ ] Edit and add captions (no copyrighted music!)

### Day 24: Write-up & Submit
- [ ] Final README polish
- [ ] Complete blog post
- [ ] Write hackathon write-up document
- [ ] Record Kiro features used
- [ ] Link to YouTube video
- [ ] Verify all requirements met
- [ ] Submit by 2 PM Pacific ⏰

## Requirements Checklist

### Repository ✅
- [x] Public repository
- [x] MIT License visible in GitHub
- [x] `.kiro/` directory committed
- [x] All commits after Oct 30, 2024
- [ ] Comprehensive README
- [ ] Clear setup instructions

### Kiro Usage 🚧
- [x] Steering files (3 created)
- [x] Specs (1 created, 3+ planned)
- [x] Hooks (2 created)
- [ ] Custom MCP server (Wayback Machine)
- [ ] Property-based testing
- [ ] Kiro CLI or Web usage documented

### AWS Integration 🚧
- [ ] Deployed on AWS (Amplify, Beanstalk, or Lambda)
- [ ] Uses AWS services (S3, CloudWatch, Secrets Manager)
- [ ] Documented in write-up

### Innovation Points 🎯
- [x] Uses public APIs (Internet Archive)
- [ ] Zombie detection (novel feature)
- [ ] Property-based testing on parsers
- [x] Spooky theme makes results scannable

### Deliverables 🚧
- [ ] Video (< 3 minutes, unlisted YouTube)
- [ ] Write-up document
- [ ] Blog post
- [ ] Social media posts

## Stretch Goals (If Time Permits)

### Browser Extension
- [ ] Manifest V3 setup
- [ ] Check links on current page
- [ ] Quick resurrection button

### GitHub Action
- [ ] YAML workflow
- [ ] Check repo docs for broken links
- [ ] Post comment with results

### BibTeX Support
- [ ] Parse .bib files
- [ ] Extract DOIs and URLs
- [ ] Generate fixed .bib file

### Batch Processing
- [ ] Queue system
- [ ] Process multiple documents
- [ ] Email results when done

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| PDF parsing too hard | Focus on Markdown/HTML first; PDF is stretch |
| Wayback API rate limits | Implement aggressive caching early |
| kiro API costs | Only check suspicious links, not all |
| Time crunch | MVP first, polish later; cut stretch goals |
| Deployment issues | Have Vercel as backup to AWS |

## Daily Standup Questions

1. What did I ship yesterday?
2. What will I ship today?
3. What's blocking me?
4. Am I on track for the deadline?

## Success Metrics for Demo

- ✅ Show extraction from real academic paper
- ✅ Find at least 5 dead links
- ✅ Catch at least 1 zombie (changed content)
- ✅ Demonstrate MCP server
- ✅ Show before/after document
- ✅ Mention bugs found by property tests

---

**Last Updated**: 2024-11-12  
**Status**: On track ✅
