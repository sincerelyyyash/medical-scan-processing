Build a working slice of the pipeline. You'll have your laptop, your preferred IDE, and an AI coding assistant. We encourage AI tools — we want to see how you wield them.
The brief:
Build a backend service that implements a simplified but real multi-step reporting pipeline:
Step 1 — Intake & routing: Accept an image upload with metadata (modality, body part, clinical context). Route to the correct pipeline configuration based on modality.
Step 2 — Orchestrate a prompt chain (minimum 2 chained LLM calls):
Call 1: Analyze the image → extract a structured list of findings (JSON with location, description, severity, confidence score)
Call 2: Take the findings from Call 1 → generate an assembled report with impression, recommendations, and urgency flag
The output of Call 1 must be validated/parsed before feeding into Call 2. Handle the case where Call 1 returns malformed output.
Step 3 — Structured API response: Return a response that a frontend could directly render — findings array, report sections, metadata, confidence indicators, and status flags for any steps that failed or were skipped.
Must-haves:
The two LLM calls must actually chain (output of first feeds into second) — not two independent calls
Intermediate output validation between steps (don't blindly pass garbage forward)
Structured JSON response with a clear contract (not free text dumped into a string field)
Basic error handling — if the LLM returns junk for Call 1, the API should still return a usable response with clear status flags, not crash
Stretch goals (if time permits):
Async processing: return a job ID immediately, process in background, expose a status/polling endpoint
Add a third pipeline step (e.g., quality check that flags low-confidence findings or contradictions between findings and impression)
A feedback endpoint where a radiologist can submit corrections on a finding, stored for future prompt improvement
Pipeline configuration that's data-driven (e.g., a config dict/YAML that defines which steps run for which modality) rather than hardcoded
Websocket or SSE endpoint that streams pipeline progress to the frontend in real time


https://upload.wikimedia.org/wikipedia/commons/a/a1/Normal_posteroanterior_%28PA%29_chest_radiograph_%28X-ray%29.jpg