# AI Agent CRM Platform

An AI-powered platform that automates inbound lead workflows by integrating LLM agents directly with HubSpot CRM. Built with LangChain.js, Groq (Llama 3.3), Node.js, and AWS-compatible infrastructure (DynamoDB, designed for Lambda + SQS).

> Demonstrates: LLM agent orchestration, OAuth 2.0 integration, async workflow design, and production-grade error handling for tool-calling LLMs.

---

## What it does

Four autonomous AI workflows that operate on a real HubSpot CRM:

| Workflow | What the agent does |
|---|---|
| **Lead qualification** | Searches a contact, scores them 1-10 based on title/company/profile signals, updates `hs_lead_status`, and writes a reasoning note. |
| **Call summary** | Takes a raw call transcript, extracts key topics + action items + sentiment + objections, and logs a structured note to the contact. |
| **Email draft** | Reads a contact's record + recent notes, then drafts a personalized outreach email referencing specific context (no auto-send — human-in-the-loop). |
| **Follow-up triage** | Reviews recent contacts, prioritizes them by seniority + engagement + recency, and recommends specific next actions per contact. |

Each workflow is autonomous: the agent decides which tools to call, in what order, with what arguments — based on its system prompt and the tool descriptions.

---

## Architecture

\`\`\`
User request
    ↓
Express API (localhost:3001)
    ↓
LangChain AgentExecutor ─────→ Groq (Llama 3.3 70B)
    ↓                              ↑
Agent decides tool ───────────────┘
    ↓
HubSpotClient ──→ HubSpot REST API
    ↓
DynamoDB (token storage with auto-refresh)
\`\`\`

**Components:**

- `src/agents/crm-agent.ts` — General-purpose agent for ad-hoc requests
- `src/agents/tools/hubspot-tools.ts` — 6 LangChain tools wrapping HubSpot REST methods (search, get, list, update property, add note, get notes)
- `src/agents/workflows/` — 4 specialized workflows, each with a tuned system prompt
- `src/services/hubspot/` — OAuth 2.0 flow, token refresh logic, REST client
- `src/services/dynamodb.ts` — Token storage (local Docker for dev, real AWS in prod)

---

## Tech stack

- **Runtime:** Node.js 20 + TypeScript (ES Modules)
- **Framework:** Express.js
- **AI:** LangChain.js + Groq API (Llama 3.3 70B)
- **CRM:** HubSpot REST API (OAuth 2.0)
- **Storage:** DynamoDB (Docker locally, AWS in production)
- **Infrastructure design:** AWS Lambda + SQS compatible (workflow handlers are pure functions)

---

## Engineering notes

A few real-world challenges I solved during this build:

### 1. Llama 3.3's parallel-tool-call bug

Llama 3.3 occasionally emits multiple tool calls in a single response with concatenated JSON arguments, which Groq's streaming parser can't handle. I diagnosed this via verbose logs showing malformed `tool_call_chunks` and fixed it two ways:

- Disabled parallel tool calls at the Groq API level: `modelKwargs: { parallel_tool_calls: false }`
- Reinforced sequential reasoning in system prompts ("Call exactly ONE tool per response. STOP. Wait for result.")

### 2. Schema mismatch on nested object arguments

Llama struggled with the original `update_contact_properties({ contactId, properties: { ... } })` schema — it would flatten the nested object incorrectly. I refactored the tool to take three flat string arguments (`contactId`, `propertyName`, `propertyValue`) and instructed the agent to call it multiple times if needed. Result: 100% schema validation success.

### 3. OAuth token refresh

HubSpot access tokens expire after 30 minutes. The `HubSpotClient` checks expiry on every request (with a 5-minute buffer) and silently refreshes via the stored refresh token. Refresh tokens are rotated and persisted back to DynamoDB. Invisible to the agent.

### 4. Anti-hallucination prompt scaffolding

Early tests showed Llama occasionally invented field values (e.g. fabricating an email when the real one was `null`). System prompts now explicitly enforce: "Quote field values from tool results EXACTLY. If null, say 'not provided.'"

---

## Running locally

### Prerequisites
- Node.js 20+
- Docker Desktop (for local DynamoDB)
- A Groq API key ([free at console.groq.com](https://console.groq.com))
- A HubSpot developer account with a test portal and OAuth app

### Setup

\`\`\`bash
# 1. Install dependencies
cd backend && npm install

# 2. Start local DynamoDB
cd .. && docker-compose up -d

# 3. Create the tokens table
cd backend && npm run setup:tables

# 4. Add your secrets to backend/.env
echo 'GROQ_API_KEY=gsk_...' > .env
echo 'HUBSPOT_CLIENT_ID=...' >> .env
echo 'HUBSPOT_CLIENT_SECRET=...' >> .env
echo 'HUBSPOT_REDIRECT_URI=http://localhost:3001/oauth/callback' >> .env

# 5. Start the server
npm run dev
\`\`\`

Then visit `http://localhost:3001`, click "Connect HubSpot", and approve OAuth. You'll get a `userId` (e.g. `hub_12345678`) to use in workflow API calls.

### Sample workflow call

\`\`\`bash
curl -X POST http://localhost:3001/workflows/qualify-lead \\
  -H "Content-Type: application/json" \\
  -d '{
    "userId": "hub_12345678",
    "email": "lead@example.com"
  }'
\`\`\`

---

## API endpoints

| Method | Path | Body |
|---|---|---|
| GET | `/oauth/install` | (initiates OAuth flow) |
| GET | `/oauth/callback` | (HubSpot redirects here) |
| POST | `/agent/run` | `{ userId, input }` (general agent) |
| POST | `/workflows/qualify-lead` | `{ userId, email }` |
| POST | `/workflows/summarize-call` | `{ userId, email, transcript }` |
| POST | `/workflows/draft-email` | `{ userId, email, goal }` |
| POST | `/workflows/recommend-followups` | `{ userId }` |

---

## Future work

- Frontend dashboard for non-technical users
- Deploy to AWS (Lambda + API Gateway + real DynamoDB + SQS for async workflow execution)
- Frontier-model A/B testing (compare Llama 3.3 vs. Claude vs. GPT-4 on workflow accuracy)
- Add evaluation harness for prompt regression testing
- Multi-tenant support (currently single-user via OAuth)

---

## License

MIT