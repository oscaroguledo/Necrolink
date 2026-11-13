# 👻 Kiro Demo Checklist for Necrolink

This document tracks **how** you're using Kiro IDE features for the hackathon write-up and judging criteria.

## 🎯 Kiro Features to Demonstrate

### 1. Steering Files ✅ (Always-Included Context)

**Purpose**: Provide persistent context about product vision, technical standards, and API usage.

**What we created**:
- `.kiro/steering/product-vision.md` - The spooky theme and UX principles
- `.kiro/steering/technical-conventions.md` - Code standards, architecture, testing strategy
- `.kiro/steering/api-guidelines.md` - Rate limits, caching, error handling for external APIs

**How it helps**:
- Kiro always knows the spooky theme when writing UI components
- Every API integration follows rate-limiting best practices automatically
- TypeScript strict mode and Result types are used consistently
- Property-based testing is always considered for parsers

**For the write-up**: 
> "Steering files act as persistent project memory. When I asked Kiro to build the URL parser, it automatically wrote property-based tests because that's documented in technical-conventions.md. When designing the results UI, it used the graveyard metaphor from product-vision.md without me repeating it."

### 2. Specs ✅ (Feature Documentation)

**Purpose**: Structured feature specifications with clear success criteria.

**What we created**:
- `.kiro/specs/01-link-extraction.md` - First spec for parsing PDFs, Markdown, HTML

**What we'll create**:
- `.kiro/specs/02-link-checking.md` - Ghost/lost soul/zombie/living classification
- `.kiro/specs/03-zombie-detection.md` - AI-powered content comparison
- `.kiro/specs/04-document-export.md` - Reconstructing fixed documents

**How it helps**:
- Clear acceptance criteria before coding
- Edge cases documented upfront
- API contracts defined early
- Testing strategy specified

**For the write-up**:
> "Each spec defined property-based tests before implementation. The link-extraction spec caught URL normalization bugs that manual tests would have missed."

### 3. Hooks ✅ (Automated Workflows)

**Purpose**: Run commands or prompts automatically on file events.

**What we created**:
- `test-on-save.json` - Runs tests whenever `.ts` or `.tsx` files are saved
- `update-readme-on-spec-change.json` - Agent prompt to sync README when specs change

**What we'll create**:
- `lint-kiro-folder.json` - Verify steering files and specs follow conventions
- `property-test-on-commit.json` - Run property tests before allowing commits

**How it helps**:
- Immediate feedback loop when coding
- Documentation stays in sync automatically
- No forgotten test runs

**For the write-up**:
> "The test-on-save hook provided instant feedback during development. The README-sync hook meant documentation never lagged behind implementation."

### 4. Custom MCP Server 🚧 (The Star Feature)

**Purpose**: Build a Wayback Machine MCP server for seamless API integration in Kiro.

**What we'll create**:
```
.kiro/mcp-servers/wayback/
├── index.ts
├── server.json
└── README.md
```

**Tools it will expose**:
- `wayback_search` - Query CDX API for snapshots
- `wayback_get` - Fetch archived page content
- `wayback_closest` - Find snapshot closest to date

**How it helps**:
- Use Wayback API directly in Kiro chat
- Test the API while building
- Share with other Kiro users

**For the write-up**:
> "The custom Wayback Machine MCP server was the most valuable Kiro feature. I could test API queries directly in the IDE, debug rate limiting issues in real-time, and the server itself became a reusable deliverable. Other developers can install it and use the Wayback Machine in their Kiro sessions."

### 5. Property-Based Testing 🚧 (Innovation Points)

**Purpose**: Catch edge cases in parsers that manual tests would miss.

**What we'll test**:
- URL normalization is idempotent: `normalize(normalize(x)) === normalize(x)`
- URL normalization preserves domain and path
- Date extraction never crashes (even on garbage input)
- Document reconstruction preserves non-URL content

**How it helps**:
- Found bugs before users did
- Increased confidence in parsers
- Great content for the blog post

**For the write-up**:
> "Property-based testing caught X bugs in URL normalization:
> 1. URLs with multiple consecutive slashes weren't handled
> 2. Tracking parameters in fragments were preserved
> 3. IDN domains caused crashes
> Each bug was found automatically by generating thousands of random URLs."

### 6. Kiro CLI or Web 🚧 (Bonus Points)

**Purpose**: Try Kiro outside the IDE for at least one task.

**What we'll try**:
- Run Kiro CLI to generate test fixtures
- Use Kiro Web to write the blog post
- Or: Use CLI to debug a tricky API integration

**For the write-up**:
> "I used the Kiro CLI to [specific task]. It was [comparison to IDE experience]."

## 📝 Write-Up Structure

### Section 1: The Problem
Link rot is real. (Statistics from Pew Research)

### Section 2: The Solution
Necrolink resurrects dead links and catches zombies.

### Section 3: How Kiro Accelerated Development

#### 3.1 Steering Files as Persistent Memory
- Product vision kept UI consistent
- Technical conventions enforced best practices
- API guidelines prevented rate-limit issues

#### 3.2 Specs Drove Quality
- Clear success criteria
- Property tests specified upfront
- Edge cases documented

#### 3.3 Hooks Automated the Tedious
- Test-on-save provided instant feedback
- README stayed in sync automatically

#### 3.4 Custom MCP Server (The Highlight)
- Built Wayback Machine server
- Tested API directly in IDE
- Server is now a standalone deliverable
- [Screenshot of using MCP server in Kiro]

#### 3.5 Property-Based Testing Caught Real Bugs
- List actual bugs found
- Show the test code that caught them
- Explain why manual tests would have missed them

### Section 4: AWS Integration
- Deployed on AWS Amplify
- Used S3 for temporary file storage
- CloudWatch for logging
- Secrets Manager for API keys

### Section 5: Innovation
- Public API (Internet Archive)
- Novel zombie detection
- Property-based testing on parsers
- Custom MCP server

### Section 6: Demo
- Link to video (< 3 minutes)
- Link to live deployment
- Link to repository

## 🎬 Video Script (< 3 minutes)

### 0:00–0:20 Hook
"Links rot. Here's an academic paper with 40 citations. Let me show you how many are already dead."

### 0:20–0:40 Upload
Upload the PDF to Necrolink, show the graveyard loading animation.

### 0:40–1:20 Results
"9 ghosts resurrected from the archive, 2 lost souls with no copy, 3 zombies (changed content), 26 living. Look at this zombie: it used to be a research page, now it's a gambling site."

### 1:20–2:00 Kiro MCP Server
"I built this using Kiro IDE. Here's the custom Wayback Machine MCP server I created—I can query the Internet Archive directly in my editor."

### 2:00–2:30 Property-Based Testing
"Kiro's property-based testing caught bugs in the URL parser that I would have missed. Here's one: [show test code and bug it caught]."

### 2:30–3:00 Resurrection
"Now watch: I resurrect all the dead links with one click. The fixed document replaces broken URLs with archived snapshots. Download and done."

## 📊 Impact Metrics for Demo

Prepare a real document with known broken links:

**Target**: A published academic paper from 2015–2018
- Expected: 30–50 citations
- Expected dead links: 20–30%
- Expected zombies: 5–10%

**Where to find it**: 
- arXiv (open access)
- A professor's course syllabus (with permission)
- Your own undergraduate thesis

**Demo script**:
1. "This is [Paper X] published in [Year]"
2. "It has 42 links in the references"
3. Upload → Show graveyard view
4. "11 are dead (404s)"
5. "3 are zombies—look, this link now points to a casino"
6. Click "Resurrect All"
7. Download fixed document
8. "Here's the before and after in the PDF"

## ✅ Final Checklist

### Before Submitting
- [ ] All commits after Oct 30, 2024
- [ ] MIT License visible on GitHub
- [ ] `.kiro/` folder committed (not in `.gitignore`)
- [ ] README is comprehensive
- [ ] Video is < 3 minutes, uploaded to YouTube (unlisted)
- [ ] Write-up mentions Kiro features used
- [ ] Blog post published
- [ ] Live demo deployed on AWS

### Write-Up Must Include
- [ ] List of Kiro features used (steering, specs, hooks, MCP server)
- [ ] Custom MCP server description + code link
- [ ] Property-based testing bugs found (with examples)
- [ ] Screenshot of MCP server in action
- [ ] Comparison: Kiro IDE vs traditional development

### Video Must Show
- [ ] Real document with broken links
- [ ] The graveyard results interface
- [ ] At least one zombie detection
- [ ] The resurrection process
- [ ] Before/after comparison
- [ ] (Bonus) The Kiro MCP server in the IDE

---

**Next Steps**:
1. Install dependencies and start implementing link extraction
2. Write property-based tests for URL normalization
3. Create the Wayback Machine MCP server
4. Document every bug the property tests catch
5. Take screenshots of Kiro features in action

Good luck! 🚀👻