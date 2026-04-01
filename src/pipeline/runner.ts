import { runAnalyzeStep } from "./steps/analyze";
import { runQualityCheck } from "./steps/quality-check";
import { runReportStep } from "./steps/report";
import type { ApiResponse, ImageMetadata, PipelineConfig } from "../types";
import { toErrorResponse } from "../utils/errors";
import {
  parseFindingsFromLLM,
  parseReportFromLLM,
} from "../validation/findings";
import type { PipelineStateStore } from "./state";

export async function runPipelineForJob(
  jobId: string,
  metadata: ImageMetadata,
  config: PipelineConfig,
  stateStore: PipelineStateStore,
): Promise<void> {
  try {
    stateStore.updateStage(jobId, "intake", 10);
    stateStore.setStageStatus(jobId, { stage: "intake", status: "completed" });

    stateStore.updateStage(jobId, "analyzing", 30);
    stateStore.setStageStatus(jobId, { stage: "analysis", status: "pending" });
    const rawFindings = await runAnalyzeStep(metadata, config);
    stateStore.setRawAnalysisOutput(jobId, rawFindings);
    stateStore.setStageStatus(jobId, {
      stage: "analysis",
      status: "completed",
    });

    stateStore.updateStage(jobId, "validating", 45);
    stateStore.setStageStatus(jobId, {
      stage: "validation",
      status: "pending",
    });
    const parsedFindings = parseFindingsFromLLM(rawFindings);
    if (!parsedFindings.success || !parsedFindings.data) {
      stateStore.setStageStatus(jobId, {
        stage: "validation",
        status: "failed",
        message: parsedFindings.errors?.join("; "),
      });
      stateStore.addError(jobId, {
        code: "MALFORMED_FINDINGS",
        message: "Could not parse findings from analysis step",
        stage: "validating",
        details: parsedFindings.errors,
      });

      const state = stateStore.get(jobId)!;
      const partialResponse: ApiResponse = {
        jobId,
        status: "partial",
        metadata: state.metadata,
        findings: [],
        confidenceIndicators: {
          overallConfidence: 0,
          requiresAdditionalReview: true,
          lowConfidenceFindings: [],
        },
        stageStatuses: state.stageStatuses,
        errors: state.errors,
      };
      stateStore.setResponse(jobId, partialResponse);
      stateStore.updateStage(jobId, "failed", 100);
      return;
    }
    stateStore.setFindings(jobId, parsedFindings.data);
    stateStore.setStageStatus(jobId, {
      stage: "validation",
      status: "completed",
    });

    stateStore.updateStage(jobId, "reporting", 65);
    stateStore.setStageStatus(jobId, { stage: "report", status: "pending" });
    const reportRaw = await runReportStep(
      JSON.stringify({ findings: parsedFindings.data }),
      metadata,
      config,
    );
    const parsedReport = parseReportFromLLM(reportRaw);
    if (!parsedReport.success || !parsedReport.data) {
      stateStore.setStageStatus(jobId, {
        stage: "report",
        status: "failed",
        message: parsedReport.errors?.join("; "),
      });
      stateStore.addError(jobId, {
        code: "MALFORMED_REPORT",
        message: "Could not parse report from report-generation step",
        stage: "reporting",
        details: parsedReport.errors,
      });
    } else {
      stateStore.setReport(jobId, parsedReport.data);
      stateStore.setStageStatus(jobId, {
        stage: "report",
        status: "completed",
      });
    }

    stateStore.updateStage(jobId, "quality_check", 85);
    stateStore.setStageStatus(jobId, {
      stage: "qualityCheck",
      status: "pending",
    });
    const stateBeforeQuality = stateStore.get(jobId)!;
    const quality = runQualityCheck(stateBeforeQuality.findings);
    stateStore.setFindings(jobId, quality.findings);
    stateStore.setStageStatus(jobId, {
      stage: "qualityCheck",
      status: "completed",
    });

    const finalState = stateStore.get(jobId)!;
    const response: ApiResponse = {
      jobId,
      status: finalState.errors.length > 0 ? "partial" : "completed",
      metadata: finalState.metadata,
      findings: quality.findings,
      report: finalState.report,
      confidenceIndicators: quality.confidenceIndicators,
      stageStatuses: finalState.stageStatuses,
      errors: finalState.errors,
    };
    stateStore.setResponse(jobId, response);
    stateStore.updateStage(jobId, "completed", 100);
  } catch (error) {
    const formatted = toErrorResponse(error);
    stateStore.addError(jobId, {
      code: formatted.code,
      message: formatted.error,
      stage: "failed",
      details: formatted.details,
    });
    const state = stateStore.get(jobId);
    if (state) {
      const fallback: ApiResponse = {
        jobId,
        status: "failed",
        metadata: state.metadata,
        findings: state.findings,
        report: state.report,
        confidenceIndicators: {
          overallConfidence: 0,
          requiresAdditionalReview: true,
          lowConfidenceFindings: [],
        },
        stageStatuses: state.stageStatuses,
        errors: state.errors,
      };
      stateStore.setResponse(jobId, fallback);
    }
    stateStore.updateStage(jobId, "failed", 100);
  }
}
