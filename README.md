# medsee

Backend service that implements a multi-step medical image reporting pipeline. It accepts a medical image (file upload or URL), runs it through chained LLM calls via OpenRouter to produce structured radiology-style findings and a report, and streams pipeline progress over WebSocket.

## How it works

The pipeline has three stages:

1. **Intake and routing** -- Validates the image and metadata (modality, body part, clinical context). Routes to a modality-specific pipeline configuration (XR, CT, MRI, US) which determines the model, prompts, and parameters for each LLM call.

2. **Chained LLM analysis** -- Two sequential calls through OpenRouter:
   - **Call 1 (Analysis):** Sends the image to GPT-4.1 with a modality-specific radiology prompt. Returns structured JSON findings (location, description, severity, confidence score).
   - **Intermediate validation:** The raw LLM output is parsed, sanitized (markdown fences stripped, brace-balanced JSON extraction), and validated against a Zod schema. If malformed, the pipeline produces a partial response with status flags instead of crashing.
   - **Call 2 (Report):** Takes the validated findings and generates an assembled report with impression, recommendations, and urgency flag.

3. **Quality check** -- Scans findings for low-confidence scores and flags them with `requiresRadiologistReview`. Computes overall confidence indicators.

Processing is asynchronous. The API returns a job ID immediately and the pipeline runs in the background. Clients can poll via HTTP or subscribe via WebSocket for real-time stage updates.

## Project structure

```
src/
  index.ts                      Express server, routes, WebSocket handler
  types/index.ts                Shared TypeScript interfaces and enums
  config/pipeline.ts            Data-driven pipeline config per modality
  prompts/
    analysis.ts                 Modality-specific image analysis prompts
    report.ts                   Report generation prompt
  client/openrouter.ts          OpenRouter SDK client with retry and timeout
  feedback/store.ts             In-memory feedback store for radiologist corrections
  pipeline/
    state.ts                    In-memory job state store with TTL eviction
    runner.ts                   Pipeline orchestrator (chains steps, updates state)
    steps/
      intake.ts                 Input validation, image URL reachability check
      analyze.ts                LLM Call 1 wrapper
      report.ts                 LLM Call 2 wrapper
      quality-check.ts          Confidence flagging and review indicators
  validation/findings.ts        Zod schemas, JSON sanitizer for LLM output
  utils/errors.ts               Custom error classes
scripts/
  test-e2e.sh                   E2E test script (URL and file upload modes)
  ws-subscribe.ts               WebSocket subscriber for watching job progress
```

## Setup

Requires [Bun](https://bun.sh) and an [OpenRouter](https://openrouter.ai) API key.

```bash
bun install
cp .env.example .env
```

Edit `.env`:

```
OPENROUTER_API_KEY=your_key_here
PORT=3000
```

Start the server:

```bash
bun run index.ts
```

## API

### `POST /api/analyze`

Submit an image for analysis. Accepts two formats:

**JSON body (image URL):**

```bash
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://example.com/scan.jpg",
    "modality": "XR",
    "bodyPart": "chest",
    "clinicalContext": "Persistent cough"
  }'
```

**Multipart form (file upload):**

```bash
curl -X POST http://localhost:3000/api/analyze \
  -F "image=@/path/to/scan.jpg" \
  -F "modality=MRI" \
  -F "bodyPart=brain" \
  -F "clinicalContext=Headache"
```

Returns `202` with:

```json
{ "jobId": "uuid", "status": "queued" }
```

### `GET /api/jobs/:id`

Poll job status and results.

```bash
curl http://localhost:3000/api/jobs/<jobId>
```

Response (when complete):

```json
{
  "jobId": "uuid",
  "status": "completed",
  "metadata": { "modality": "XR", "bodyPart": "chest", "clinicalContext": "..." },
  "findings": [
    {
      "location": "right lower lobe",
      "description": "...",
      "severity": "moderate",
      "confidenceScore": 0.82,
      "requiresRadiologistReview": false
    }
  ],
  "report": {
    "impression": "...",
    "recommendations": "...",
    "urgencyFlag": "routine"
  },
  "confidenceIndicators": {
    "overallConfidence": 0.85,
    "requiresAdditionalReview": false,
    "lowConfidenceFindings": []
  },
  "stageStatuses": [
    { "stage": "intake", "status": "completed" },
    { "stage": "analysis", "status": "completed" },
    { "stage": "validation", "status": "completed" },
    { "stage": "report", "status": "completed" },
    { "stage": "qualityCheck", "status": "completed" }
  ],
  "errors": []
}
```

### `POST /api/jobs/:id/feedback`

Submit radiologist feedback on a finding. The feedback is stored and can be retrieved later for prompt improvement.

```bash
curl -X POST http://localhost:3000/api/jobs/<jobId>/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "findingIndex": 0,
    "action": "corrected",
    "correctedFinding": {
      "severity": "high",
      "description": "Opacity in the right lower lobe consistent with consolidation"
    },
    "comment": "Severity was underestimated, pattern is clearly consolidation",
    "radiologistId": "dr-smith"
  }'
```

**Fields:**

- `findingIndex` -- Index into the job's findings array. Set to `null` when `action` is `"added"`.
- `action` -- One of `"corrected"` (fix a finding), `"confirmed"` (agree with a finding), `"rejected"` (dismiss a false positive), `"added"` (add a missed finding).
- `correctedFinding` -- Partial finding object with corrected fields. Required when action is `"corrected"`.
- `comment` -- Free-text explanation of the correction.
- `radiologistId` -- Optional identifier for the reviewing radiologist.

Returns `201` with the stored feedback entry.

### `GET /api/jobs/:id/feedback`

Get all feedback submitted for a specific job.

### `GET /api/feedback`

List all feedback entries across all jobs, sorted newest first.

### `GET /api/errors`

List all failed jobs.

### `GET /api/errors/:id`

Get error details for a specific failed job.

### `WS /ws`

WebSocket endpoint for real-time pipeline progress.

Subscribe to a job:

```json
{ "subscribe": "jobId" }
```

Subscribe to all error events:

```json
{ "subscribeErrors": true }
```

A single connection can subscribe to multiple jobs. The server pushes the full job state on every stage transition.

## Testing

Run the E2E test script:

```bash
# URL mode (uses sample chest X-ray from requirement.md)
./scripts/test-e2e.sh url

# File upload mode
./scripts/test-e2e.sh upload /path/to/image.jpg
```

Watch job progress in real time:

```bash
bun run scripts/ws-subscribe.ts <jobId>
```

## Error handling

- If the LLM returns malformed output for Call 1, the pipeline returns a partial response with `status: "partial"` and clear error details. It does not crash.
- If Call 2 fails, the findings from Call 1 are still returned with the report section omitted.
- All errors are recorded in the job state and surfaced in the API response.
- Failed jobs are pushed to the error state registry and broadcast to WebSocket error subscribers.
- Completed and failed jobs are evicted from memory after 30 minutes.

## Dependencies

- **@openrouter/sdk** -- OpenRouter API client
- **express** -- HTTP server
- **ws** -- WebSocket server
- **multer** -- Multipart file upload parsing
- **zod** -- Runtime schema validation for LLM outputs and API inputs
