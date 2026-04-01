import { randomUUID } from "node:crypto";
import type { FeedbackAction, FeedbackEntry, Finding } from "../types";

export interface FeedbackInput {
  findingIndex: number | null;
  action: FeedbackAction;
  correctedFinding?: Partial<Finding>;
  comment: string;
  radiologistId?: string;
}

export class FeedbackStore {
  private readonly entries = new Map<string, FeedbackEntry[]>();

  submit(
    jobId: string,
    input: FeedbackInput,
    originalFinding: Finding | null,
  ): FeedbackEntry {
    const entry: FeedbackEntry = {
      feedbackId: randomUUID(),
      jobId,
      findingIndex: input.findingIndex,
      action: input.action,
      originalFinding,
      correctedFinding: input.correctedFinding ?? null,
      comment: input.comment,
      radiologistId: input.radiologistId ?? "anonymous",
      createdAt: new Date().toISOString(),
    };

    const list = this.entries.get(jobId) ?? [];
    list.push(entry);
    this.entries.set(jobId, list);

    return entry;
  }

  getForJob(jobId: string): FeedbackEntry[] {
    return this.entries.get(jobId) ?? [];
  }

  getAll(): FeedbackEntry[] {
    const all: FeedbackEntry[] = [];
    for (const entries of this.entries.values()) {
      all.push(...entries);
    }
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  countByJob(jobId: string): number {
    return this.entries.get(jobId)?.length ?? 0;
  }
}
