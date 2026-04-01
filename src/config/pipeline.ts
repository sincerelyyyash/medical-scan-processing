import type { Modality, PipelineConfig } from "../types";
import { buildAnalysisSystemPrompt } from "../prompts/analysis";
import { buildReportSystemPrompt } from "../prompts/report";

const analysisModel = "openai/gpt-4.1";
const reportModel = "openai/gpt-4.1";

export const modalityConfigs: Record<Modality, PipelineConfig> = {
  XR: {
    modality: "XR",
    analysis: { model: analysisModel, temperature: 0.1, maxTokens: 1400 },
    report: { model: reportModel, temperature: 0.2, maxTokens: 2400 },
    analysisSystemPrompt: buildAnalysisSystemPrompt("XR"),
    reportSystemPrompt: buildReportSystemPrompt(),
  },
  CT: {
    modality: "CT",
    analysis: { model: analysisModel, temperature: 0.1, maxTokens: 1600 },
    report: { model: reportModel, temperature: 0.2, maxTokens: 2800 },
    analysisSystemPrompt: buildAnalysisSystemPrompt("CT"),
    reportSystemPrompt: buildReportSystemPrompt(),
  },
  MRI: {
    modality: "MRI",
    analysis: { model: analysisModel, temperature: 0.1, maxTokens: 1800 },
    report: { model: reportModel, temperature: 0.2, maxTokens: 2800 },
    analysisSystemPrompt: buildAnalysisSystemPrompt("MRI"),
    reportSystemPrompt: buildReportSystemPrompt(),
  },
  US: {
    modality: "US",
    analysis: { model: analysisModel, temperature: 0.1, maxTokens: 1400 },
    report: { model: reportModel, temperature: 0.2, maxTokens: 2400 },
    analysisSystemPrompt: buildAnalysisSystemPrompt("US"),
    reportSystemPrompt: buildReportSystemPrompt(),
  },
  UNKNOWN: {
    modality: "UNKNOWN",
    analysis: { model: analysisModel, temperature: 0.1, maxTokens: 1200 },
    report: { model: reportModel, temperature: 0.2, maxTokens: 2000 },
    analysisSystemPrompt: buildAnalysisSystemPrompt("UNKNOWN"),
    reportSystemPrompt: buildReportSystemPrompt(),
  },
};

export function normalizeModality(input: string): Modality {
  const value = input.trim().toUpperCase();
  if (value === "XR" || value === "X-RAY" || value === "XRAY") return "XR";
  if (value === "CT") return "CT";
  if (value === "MRI") return "MRI";
  if (value === "US" || value === "ULTRASOUND") return "US";
  return "UNKNOWN";
}

export function getPipelineConfig(modality: string): PipelineConfig {
  return modalityConfigs[normalizeModality(modality)];
}
