import { createServer } from "node:http";
import express from "express";
import multer from "multer";
import { z } from "zod";
import { WebSocketServer } from "ws";
import { PipelineStateStore } from "./pipeline/state";
import { runPipelineForJob } from "./pipeline/runner";
import { runIntake, runIntakeFromUpload } from "./pipeline/steps/intake";
import { FeedbackStore } from "./feedback/store";
import type { ImageMetadata, PipelineConfig } from "./types";
import { toErrorResponse, ValidationError } from "./utils/errors";

const feedbackInputSchema = z.object({
  findingIndex: z.number().int().min(0).nullable(),
  action: z.enum(["corrected", "confirmed", "rejected", "added"]),
  correctedFinding: z
    .object({
      location: z.string().min(1).optional(),
      description: z.string().min(1).optional(),
      severity: z.enum(["low", "moderate", "high", "critical"]).optional(),
      confidenceScore: z.number().min(0).max(1).optional(),
    })
    .optional(),
  comment: z.string().min(1),
  radiologistId: z.string().min(1).optional(),
});

const app = express();

app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (_req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json({ limit: "1mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const subscribers = new Map<string, Set<import("ws").WebSocket>>();
const socketSubscriptions = new Map<import("ws").WebSocket, Set<string>>();
const errorSubscribers = new Set<import("ws").WebSocket>();

const feedbackStore = new FeedbackStore();

const stateStore = new PipelineStateStore((state) => {
  const sockets = subscribers.get(state.jobId);
  if (sockets) {
    const message = JSON.stringify(state);
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) {
        socket.send(message);
      }
    }
  }

  if (state.stage === "failed") {
    const errorSnapshot = JSON.stringify({
      type: "error-state",
      data: stateStore.getErrorState(state.jobId),
    });
    for (const socket of errorSubscribers) {
      if (socket.readyState === socket.OPEN) {
        socket.send(errorSnapshot);
      }
    }
  }
});

function startPipelineInBackground(
  jobId: string,
  metadata: ImageMetadata,
  config: PipelineConfig,
) {
  queueMicrotask(() => {
    runPipelineForJob(jobId, metadata, config, stateStore).catch((error) => {
      const parsed = toErrorResponse(error);
      stateStore.addError(jobId, {
        code: parsed.code,
        message: parsed.error,
        stage: "failed",
        details: parsed.details,
      });
      stateStore.updateStage(jobId, "failed", 100);
    });
  });
}

app.post("/api/analyze", upload.single("image"), async (req, res) => {
  try {
    let metadata: ImageMetadata;
    let config: PipelineConfig;

    if (req.file) {
      const fields: Record<string, string> = {};
      for (const key of ["modality", "bodyPart", "clinicalContext"] as const) {
        const value = req.body?.[key];
        if (typeof value === "string") fields[key] = value;
      }
      ({ metadata, config } = runIntakeFromUpload(fields, {
        buffer: req.file.buffer,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname,
      }));
    } else if (req.is("application/json") || req.body?.imageUrl) {
      ({ metadata, config } = await runIntake(req.body));
    } else {
      throw new ValidationError(
        "Provide either a file upload (multipart field 'image') or JSON body with 'imageUrl'",
      );
    }

    const created = stateStore.createJob(metadata);
    startPipelineInBackground(created.jobId, metadata, config);
    res.status(202).json({ jobId: created.jobId, status: "queued" });
  } catch (error) {
    const parsed = toErrorResponse(error);
    res
      .status(parsed.status)
      .json({ error: parsed.error, code: parsed.code, details: parsed.details });
  }
});

app.get("/api/jobs/:id", (req, res) => {
  const state = stateStore.get(req.params.id);
  if (!state) {
    res.status(404).json({ error: "Job not found", code: "NOT_FOUND" });
    return;
  }
  res.json(state.response ?? state);
});

app.get("/api/errors", (_req, res) => {
  const errors = stateStore.getErrorStates();
  res.json({ total: errors.length, errors });
});

app.get("/api/errors/:id", (req, res) => {
  const errorState = stateStore.getErrorState(req.params.id);
  if (!errorState) {
    res.status(404).json({ error: "Error state not found", code: "NOT_FOUND" });
    return;
  }
  res.json(errorState);
});

app.post("/api/jobs/:id/feedback", (req, res) => {
  try {
    const jobId = req.params.id;
    const state = stateStore.get(jobId);
    if (!state) {
      res.status(404).json({ error: "Job not found", code: "NOT_FOUND" });
      return;
    }

    const parsed = feedbackInputSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError(
        "Invalid feedback payload",
        parsed.error.flatten(),
      );
    }

    const input = parsed.data;

    if (input.action === "added" && input.findingIndex !== null) {
      throw new ValidationError(
        "findingIndex must be null when action is 'added' (new finding)",
      );
    }

    if (input.action !== "added" && input.findingIndex === null) {
      throw new ValidationError(
        "findingIndex is required when action is 'corrected', 'confirmed', or 'rejected'",
      );
    }

    let originalFinding = null;
    if (input.findingIndex !== null) {
      const findings = state.response?.findings ?? state.findings;
      if (input.findingIndex >= findings.length) {
        throw new ValidationError(
          `findingIndex ${input.findingIndex} is out of range (job has ${findings.length} findings)`,
        );
      }
      originalFinding = findings[input.findingIndex]!;
    }

    if (input.action === "corrected" && !input.correctedFinding) {
      throw new ValidationError(
        "correctedFinding is required when action is 'corrected'",
      );
    }

    const entry = feedbackStore.submit(jobId, input, originalFinding);
    res.status(201).json(entry);
  } catch (error) {
    const parsed = toErrorResponse(error);
    res
      .status(parsed.status)
      .json({ error: parsed.error, code: parsed.code, details: parsed.details });
  }
});

app.get("/api/jobs/:id/feedback", (req, res) => {
  const jobId = req.params.id;
  const state = stateStore.get(jobId);
  if (!state) {
    res.status(404).json({ error: "Job not found", code: "NOT_FOUND" });
    return;
  }
  const entries = feedbackStore.getForJob(jobId);
  res.json({ jobId, total: entries.length, feedback: entries });
});

app.get("/api/feedback", (_req, res) => {
  const all = feedbackStore.getAll();
  res.json({ total: all.length, feedback: all });
});

app.get("/", (_req, res) => {
  res.json({
    ok: true,
    service: "medical-image-pipeline",
    endpoints: [
      "POST /api/analyze (JSON body with imageUrl OR multipart with 'image' file)",
      "GET /api/jobs/:id",
      "POST /api/jobs/:id/feedback",
      "GET /api/jobs/:id/feedback",
      "GET /api/feedback",
      "GET /api/errors",
      "GET /api/errors/:id",
      "WS /ws (message: { subscribe: jobId } or { subscribeErrors: true })",
    ],
  });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  ws.on("message", (buffer) => {
    try {
      const data = JSON.parse(buffer.toString()) as {
        subscribe?: string;
        subscribeErrors?: boolean;
      };

      if (data.subscribeErrors) {
        errorSubscribers.add(ws);
        ws.send(
          JSON.stringify({
            type: "error-state-snapshot",
            data: stateStore.getErrorStates(),
          }),
        );
        return;
      }

      if (!data.subscribe) return;

      const tracked = socketSubscriptions.get(ws) ?? new Set();
      tracked.add(data.subscribe);
      socketSubscriptions.set(ws, tracked);

      const set = subscribers.get(data.subscribe) ?? new Set();
      set.add(ws);
      subscribers.set(data.subscribe, set);

      const state = stateStore.get(data.subscribe);
      if (state) ws.send(JSON.stringify(state));
    } catch {
      ws.send(
        JSON.stringify({
          error:
            "Invalid websocket message. Expected: { subscribe: jobId } or { subscribeErrors: true }",
        }),
      );
    }
  });

  ws.on("close", () => {
    const jobIds = socketSubscriptions.get(ws);
    if (jobIds) {
      for (const jobId of jobIds) {
        subscribers.get(jobId)?.delete(ws);
      }
      socketSubscriptions.delete(ws);
    }
    errorSubscribers.delete(ws);
  });
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
