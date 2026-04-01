import { randomUUID } from "node:crypto";
import type {
  ApiResponse,
  ErrorStateEntry,
  ImageMetadata,
  PipelineError,
  PipelineStage,
  PipelineState,
  StageStatus,
} from "../types";

type BroadcastFn = (state: PipelineState) => void;

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const EVICTION_INTERVAL_MS = 5 * 60 * 1000;

export class PipelineStateStore {
  private readonly jobs = new Map<string, PipelineState>();
  private readonly errorStates = new Map<string, ErrorStateEntry>();
  private readonly ttlMs: number;

  constructor(
    private readonly broadcast?: BroadcastFn,
    ttlMs: number = DEFAULT_TTL_MS,
  ) {
    this.ttlMs = ttlMs;
    setInterval(() => this.evictExpired(), EVICTION_INTERVAL_MS).unref();
  }

  private evictExpired(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [jobId, state] of this.jobs) {
      const isTerminal = state.stage === "completed" || state.stage === "failed";
      if (isTerminal && new Date(state.updatedAt).getTime() < cutoff) {
        this.jobs.delete(jobId);
        this.errorStates.delete(jobId);
      }
    }
  }

  createJob(metadata: ImageMetadata): PipelineState {
    const now = new Date().toISOString();
    const jobId = randomUUID();
    const state: PipelineState = {
      jobId,
      stage: "queued",
      progress: 0,
      metadata,
      findings: [],
      errors: [],
      stageStatuses: [],
      startedAt: now,
      updatedAt: now,
    };
    this.jobs.set(jobId, state);
    this.emit(state);
    return state;
  }

  get(jobId: string): PipelineState | undefined {
    return this.jobs.get(jobId);
  }

  getErrorState(jobId: string): ErrorStateEntry | undefined {
    return this.errorStates.get(jobId);
  }

  getErrorStates(): ErrorStateEntry[] {
    return [...this.errorStates.values()].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  }

  updateStage(jobId: string, stage: PipelineStage, progress: number): void {
    this.patch(jobId, { stage, progress });
  }

  setStageStatus(jobId: string, stageStatus: StageStatus): void {
    const state = this.require(jobId);
    const nextStatuses = state.stageStatuses.filter(
      (item) => item.stage !== stageStatus.stage,
    );
    nextStatuses.push(stageStatus);
    this.patch(jobId, { stageStatuses: nextStatuses });
  }

  setRawAnalysisOutput(jobId: string, rawAnalysisOutput: string): void {
    this.patch(jobId, { rawAnalysisOutput });
  }

  setFindings(jobId: string, findings: PipelineState["findings"]): void {
    this.patch(jobId, { findings });
  }

  setReport(jobId: string, report: NonNullable<PipelineState["report"]>): void {
    this.patch(jobId, { report });
  }

  setResponse(jobId: string, response: ApiResponse): void {
    this.patch(jobId, { response });
  }

  addError(jobId: string, error: PipelineError): void {
    const state = this.require(jobId);
    const nextErrors = [...state.errors, error];
    this.patch(jobId, { errors: nextErrors });
    const latestState = this.require(jobId);
    this.upsertErrorState(latestState, error.message);
  }

  private patch(jobId: string, partial: Partial<PipelineState>): void {
    const state = this.require(jobId);
    const updated: PipelineState = {
      ...state,
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, updated);
    if (updated.stage === "failed") {
      const reason =
        updated.errors.at(-1)?.message || "Image processing did not complete";
      this.upsertErrorState(updated, reason);
    }
    this.emit(updated);
  }

  private upsertErrorState(state: PipelineState, reason: string): void {
    const existing = this.errorStates.get(state.jobId);
    const now = new Date().toISOString();
    const next: ErrorStateEntry = {
      jobId: state.jobId,
      stage: state.stage,
      reason,
      metadata: state.metadata,
      errors: state.errors,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.errorStates.set(state.jobId, next);
  }

  private require(jobId: string): PipelineState {
    const state = this.jobs.get(jobId);
    if (!state) {
      throw new Error(`Unknown job id: ${jobId}`);
    }
    return state;
  }

  private emit(state: PipelineState): void {
    this.broadcast?.(state);
  }
}
