# Voxora — Autonomous AI Sales Voice Agent

A local browser MVP for demonstrating a complete inbound sales workflow: microphone or text conversation → lead qualification → grounded product answer → appointment booking → call summary and CRM-ready record. Speech recognition runs on the user's computer using Whisper Tiny; no hosted speech service or API key is used.

**Complete technical and presentation guide:** [PROJECT_DOCUMENTATION.md](PROJECT_DOCUMENTATION.md) — architecture and diagram glossary, technology/API details, recruiter demo prompts, full workflow, privacy and scaling notes, GitHub publishing steps, and viva questions with suggested answers.

## Run it

The UI has no build step. Local speech transcription requires Python and downloads the open Whisper Tiny model (~150 MB) the first time you send a recording.

1. Open a terminal in this folder and create/activate a virtual environment if desired.
2. Install runtime dependencies: `python -m pip install -r requirements.txt`
3. Start the combined UI and local transcription server: `python server.py`
4. Visit `http://localhost:8765` and allow microphone access.
5. Select **Start a demo call**, click the microphone to start recording, then click it again to transcribe. The first transcription downloads Whisper Tiny from Hugging Face; subsequent requests run locally.
6. Share needs (for example: “We need a CRM integration, have a $500 budget, and want to start next month”), ask about pricing, book a future appointment, then end the call.
7. Inspect **Leads**, **Knowledge base**, and **Insights**.

Text input works in all modern browsers. Microphone capture uses `getUserMedia` and Web Audio; transcription is sent only to the local Python service. The Whisper weights are downloaded once from Hugging Face, but recordings are not uploaded to Hugging Face or another speech provider. Use the local server rather than `python -m http.server`; the latter does not include the transcription endpoint. Agent replies can be read aloud with the speaker toggle; available system voices depend on the device. English, Spanish, French and Hindi are supported for transcription. The MVP has no external AI or CRM connection: its response logic is deterministic, sentiment is a small keyword heuristic, and RAG is transparent keyword-overlap retrieval. The included pricing and product details are fictional demo content; replace them before presenting a real offer.

## Business problem and MVP value

Sales teams lose inbound opportunities when they cannot respond promptly, ask consistent qualification questions, or keep follow-ups organized. Voxora demonstrates how an always-available assistant could capture buyer intent, retrieve approved answers, qualify consistently, and schedule a human follow-up. The prototype is useful for validating the workflow and interface, not for making claims about production conversion lift.

## End-to-end workflow

1. Start a demo call; a prospect and local CRM lead record are created.
2. Record a short message for local Whisper transcription or type. The conversation captures interest, budget, timing, and a basic sentiment signal.
3. Ask a product question. Matching excerpts from the local knowledge base appear alongside the response.
4. Save an email address, schedule a future meeting, and see the booking recorded against the lead.
5. End the conversation to persist a short summary and outcome; use lead search/filter, CSV export, pipeline, and outcome insights.

Leads, calls and bookings are stored in this browser's `localStorage`. **Clear local demo data** in Settings removes them. Speech recordings are sent to `localhost` and processed on the same computer; they are held in memory only and are not written to disk by the server. The first transcription downloads model weights from Hugging Face. Browser speech synthesis uses installed system voices.

## System architecture

```mermaid
flowchart LR
  User[Prospect / Sales operator] --> UI[Responsive browser workspace]
  UI --> Capture[Microphone capture and WAV encoding]
  Capture --> LocalAPI[Local Python transcription endpoint]
  LocalAPI --> Whisper[Whisper Tiny on CPU]
  Whisper --> LocalAPI
  UI --> TTS[Browser SpeechSynthesis]
  UI --> Dialog[Demo conversation and qualification rules]
  Dialog --> Sentiment[Rule-based sentiment and lead signals]
  Dialog --> RAG[Keyword retrieval over approved demo notes]
  RAG --> KB[(Local knowledge sources)]
  Dialog --> CRM[Local CRM adapter]
  CRM --> Store[(Browser localStorage)]
  CRM --> Booking[Appointment and call summary]
  Booking --> Store
  Store --> Views[Pipeline, leads, CSV export and insights]

  subgraph Production extension (not included)
    Telephony[Telephony / streaming gateway] --> API[Authenticated stateless API]
    API --> LLM[LLM + streaming STT/TTS]
    API --> Vector[(Tenant-scoped vector search)]
    API --> Queue[Event queue]
    Queue --> SQL[(Encrypted CRM database)]
    API --> Calendar[CRM and calendar APIs]
    API --> Metrics[Monitoring, audit and analytics]
  end
```

### Implementation

| Area | MVP implementation | Production replacement |
|---|---|---|
| UI | Semantic HTML, responsive CSS, plain JavaScript | Keep the client thin; deploy versioned static assets behind a CDN |
| STT / TTS | Local Whisper Tiny service; browser SpeechSynthesis; typed input fallback | Streaming provider/telephony integration, consent prompts, interruption handling, fallback and human handoff |
| Conversation | Deterministic local question and response rules | Guardrailed LLM orchestration, tool permissions, latency budgets and human escalation |
| Qualification / sentiment | Explainable keyword and regex signals | Calibrated, evaluated models; confidence, audit trail and human review |
| RAG | Keyword overlap across local notes, with visible source snippets | Tenant-filtered hybrid/vector retrieval, document access control, freshness and citations |
| CRM / booking | `localStorage` adapter; CSV export; future-date validation | Authenticated backend adapters, idempotent jobs, OAuth token vault, calendar availability and retries |
| Persistence | Data stays in one browser profile | Encrypted, tenant-scoped database with backup, retention and deletion workflows |

## Scalability strategy: 100,000 users

100,000 registered users is a design target, not a capacity claim for this local demo. Treat concurrency and voice minutes as separate workload drivers; estimate peak sessions from observed busy-hour concurrency and load tests rather than multiplying users by a guessed call rate.

1. Serve the static frontend through a CDN. Keep APIs stateless and horizontally autoscaled across zones.
2. Put call control and streaming media behind a managed telephony/SIP gateway; isolate long-lived audio sessions from ordinary request workers.
3. Use bounded queues for summaries, CRM sync, and analytics. Make jobs idempotent, retry with backoff, and route poison messages to a dead-letter queue.
4. Partition data by tenant; enforce tenant authorization at every API and retrieval boundary. Use PostgreSQL for transactional leads/bookings and managed vector search (or PostgreSQL vector extension) for knowledge retrieval.
5. Cache tenant-safe product knowledge, apply per-tenant concurrency/rate limits, and use model routing, token budgets, and graceful degradation to control latency and spend.
6. Load-test staged traffic (for example 1k, 10k, then 100k registered accounts) with realistic concurrent calls, retrieval, CRM failures, and regional failover. Track p95 response latency, call completion, queue age, error rate, cost per connected minute, and recovery objectives.

## Security, deployment and operations

- Obtain recording/transcription consent, disclose AI use, minimize collected personal data, and provide access/deletion/retention controls appropriate to applicable laws.
- Production: TLS everywhere, encryption at rest, managed secrets/KMS, SSO/OIDC, role-based access, tenant isolation, least privilege, audit logs, dependency scanning, backups and tested restore procedures.
- Treat retrieved documents and spoken input as untrusted. Prevent prompt injection from becoming tool authorization; allowlist tools and validate every booking/CRM action server-side.
- Deploy static files to a CDN and APIs/workers to a managed container or serverless platform, with separate staging/production environments, CI checks, health probes, alerting and rollback.
- Monitor transcription errors, model/tool outcomes, latency, cost and abuse. Avoid storing raw audio by default; make any retention opt-in, disclosed and configurable.
- Never put provider secrets in this frontend. A real CRM, calendar, telephony, STT/TTS, or LLM integration must go through a protected backend.

### Illustrative monthly operating cost

These are planning ranges in USD, not vendor quotes. They assume an early production service with 100,000 registered users, modest usage, one primary region, and exclude engineering, taxes, support staff, sales, and significant PSTN charges. Actual spend is driven mainly by connected voice minutes, model choice, retention, and availability targets.

| Cost area | Early-stage estimate / month |
|---|---:|
| CDN, frontend, API and background workers | $300–$2,000 |
| Database, backups and vector retrieval | $500–$3,000 |
| Monitoring, logging and security services | $300–$2,000 |
| Managed STT/TTS and LLM at 10k connected minutes | $500–$5,000 |
| Telephony, depending on destinations and minutes | $500–$5,000+ |
| **Indicative total** | **$2,100–$17,000+** |

Validate current regional provider prices with a usage model before committing. A commercial model could use per-seat tiers plus included minutes and metered overage; track cost per qualified conversation and booked meeting to test gross margin. The local demo itself has no service operating cost.

## Live-coding walkthrough

- Start with a text-only conversation, add budget/timing language, and observe qualification update.
- Add a knowledge note, then test retrieval and ask the same question during a conversation.
- Book an appointment, filter the lead, export CSV, and end the call to inspect the generated summary.
- Change the response/qualification heuristic in `app.js`, refresh, and repeat the workflow.

## Project files

- `index.html` — application structure and views.
- `styles.css` — responsive workspace design.
- `app.js` — browser interactions, local workflow, heuristics and persistence.
- `server.py` — local web server and CPU-based Whisper transcription endpoint.
- `requirements.txt` — Python dependencies for local speech recognition.
- `README.md` — setup, architecture, trade-offs, scale, security and commercial assumptions.
- `PROJECT_DOCUMENTATION.md` — detailed project, architecture, live-demo and viva guide.
- `.gitignore` — excludes local environments, model caches, recordings, secrets and generated files from Git.
