import { z } from "zod";
import type { Finding, ReportSections } from "../types";

const findingSchema = z.object({
  location: z.string().min(1),
  description: z.string().min(1),
  severity: z.enum(["low", "moderate", "high", "critical"]),
  confidenceScore: z.number().min(0).max(1),
});

const findingsEnvelopeSchema = z.object({
  findings: z.array(findingSchema),
});

const reportSchema = z.object({
  clinicalIndication: z.string().min(1),
  technique: z.string().min(1),
  comparison: z.string().min(1),
  findings: z.string().min(1),
  impression: z.string().min(1),
  recommendations: z.string().min(1),
  urgencyFlag: z.enum(["routine", "urgent", "stat"]),
});

export function sanitizeJsonText(raw: string): string {
  const stripped = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/gi, "")
    .trim();

  const start = stripped.indexOf("{");
  if (start < 0) return stripped;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i]!;

    if (escape) {
      escape = false;
      continue;
    }

    if (ch === "\\") {
      escape = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return stripped.slice(start, i + 1);
      }
    }
  }

  return stripped.slice(start);
}

export function parseFindingsFromLLM(raw: string): {
  success: boolean;
  data?: Finding[];
  errors?: string[];
} {
  const errors: string[] = [];
  const cleaned = sanitizeJsonText(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    errors.push(`JSON parse error: ${(error as Error).message}`);
    return { success: false, errors };
  }

  const validated = findingsEnvelopeSchema.safeParse(parsed);
  if (!validated.success) {
    errors.push(`Schema validation error: ${validated.error.message}`);
    return { success: false, errors };
  }

  const data: Finding[] = validated.data.findings.map((finding) => ({
    ...finding,
    requiresRadiologistReview: false,
  }));

  return { success: true, data };
}

export function parseReportFromLLM(raw: string): {
  success: boolean;
  data?: ReportSections;
  errors?: string[];
} {
  const errors: string[] = [];
  const cleaned = sanitizeJsonText(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    errors.push(`JSON parse error: ${(error as Error).message}`);
    return { success: false, errors };
  }

  const validated = reportSchema.safeParse(parsed);
  if (!validated.success) {
    errors.push(`Schema validation error: ${validated.error.message}`);
    return { success: false, errors };
  }

  return { success: true, data: validated.data };
}
