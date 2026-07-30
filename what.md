nayana.ai — AI Search Console Agent Spec

## Overview

An **AI Visibility & Perception Engine** for the LLM era. Helps companies understand, measure, and improve how AI systems perceive their product, website, and documentation.

Traditional SEO shows how a site performs on search engines. **nayana.ai** focuses on the next layer: how answer engines, AI assistants, and LLM-powered discovery tools understand a company's content.

It scans a target website, evaluates how confidently AI can answer real user questions from that content, compares visibility against competitors, and turns content gaps into developer-ready fixes.

---

## What the Agent Needs to Do

### 1. Content Ingestion & Crawling

- Crawl a target website (sitemap, crawl depth, docs, landing pages, blog)
- Parse and chunk content into semantically meaningful units
- Detect content types: product pages, API docs, FAQs, pricing, changelogs, etc.

### 2. AI Perception Evaluation

- Generate a bank of **real user questions** the target audience would ask an AI assistant (e.g., "What does X do?", "How do I integrate X with Y?", "Does X support Z?")
- Send those questions to multiple LLMs (GPT-4o, Claude, Gemini, Perplexity, etc.)
- Measure:
    - **Answer confidence** — does the LLM answer with certainty or hedge?
    - **Answer accuracy** — does the response match ground truth on your site?
    - **Source attribution** — is your site cited? Is a competitor cited instead?
    - **Coverage** — what % of your feature set / use cases are answerable?

### 3. Gap Detection

- Identify questions the AI **cannot answer** or answers **incorrectly** from your content
- Map gaps back to specific pages or missing pages
- Categorize: missing content, thin content, ambiguous content, buried content

### 4. Competitive AI Visibility

- Run the same question bank against competitor domains
- Compare how often each brand is mentioned/cited in LLM answers
- Track share-of-voice across answer engines

### 5. Fix Generation (Developer-Ready)

- For each gap, generate:
    - A suggested FAQ/Q&A block to add
    - A rewritten paragraph that explicitly answers the question
    - Structured data / schema markup suggestions (speakable, FAQPage, etc.)
    - Suggested new doc pages with outlines
- Output as Markdown, JSON, or directly pushable to a CMS/GitHub

### 6. Monitoring & Alerting

- Re-run evaluations on a schedule (weekly/monthly)
- Track score changes over time (AI visibility score)
- Alert when a competitor gains mention share or your content regresses

---

## How the Agent Works (Architecture)

```
Target URL
    │
    ▼
[Crawler] → sitemap + page content + metadata
    │
    ▼
[Question Generator] → LLM generates question bank per page/topic
    │
    ├──► [AI Perception Tester] → queries GPT, Claude, Gemini, Perplexity
    │         └── scores: confidence, accuracy, attribution, coverage
    │
    ├──► [Competitor Tracker] → same questions, different domain context
    │
    ▼
[Gap Analyzer] → maps low-score questions to content locations
    │
    ▼
[Fix Generator] → produces content patches, FAQ blocks, schema markup
    │
    ▼
[Dashboard / Report] → scores, gaps, diffs, changelogs over time
```

---

## Key Capabilities to Prioritize

| Priority | Capability | Why |
| --- | --- | --- |
| 🔴 Core | AI answer testing (multi-LLM) | The core value prop |
| 🔴 Core | Question bank generation | Drives everything |
| 🔴 Core | Gap → fix generation | Makes it actionable |
| 🟡 High | Competitor comparison | Huge differentiator |
| 🟡 High | Scheduled re-evaluation | Makes it a recurring tool |
| 🟢 Nice | CMS / GitHub push integration | Dev-ready fixes |
| 🟢 Nice | Structured data suggestions | Helps AI parsability |

---

## Metrics to Track (The "Search Console" Panel)

- **AI Coverage Score** — % of key questions answerable from your content
- **Confidence Score** — avg certainty of LLM responses about your product
- **Attribution Rate** — how often your domain is cited vs. a competitor
- **Gap Count** — number of unanswered/mis-answered questions
- **Fix Velocity** — how fast gaps are closed after fixes are published

---

## Stack Suggestions

| Layer | Tools |
| --- | --- |
| Crawling | Firecrawl, Apify, or Playwright |
| LLM Querying | OpenAI, Anthropic, Google APIs + Perplexity API |
| Accuracy Eval | OpenAI embeddings + cosine similarity (RAG-style) |
| Question Generation | GPT-4o with structured prompt per page |
| Storage | Postgres (scores over time) + vector DB (Pinecone/Qdrant) |
| Frontend | Dashboard with trend charts and a fix queue |