export type Modality = "XR" | "CT" | "MRI" | "US" | "UNKNOWN";

export type FindingSeverity = "low" | "moderate" | "high" | "critical";

export type UrgencyFlag = "routine" | "urgent" | "stat";

export type ImageSource =
  | { type: "url"; url: string }
  | { type: "base64"; dataUri: string };

export interface ImageMetadata {
  imageSource: ImageSource;
  modality: Modality;
  bodyPart: string;
  clinicalContext: string;
}

export interface Finding {
  location: string;
  description: string;
  severity: FindingSeverity;
  confidenceScore: number;
  requiresRadiologistReview: boolean;
}

export interface ReportSections {
  clinicalIndication: string;
  technique: string;
  comparison: string;
  findings: string;
  impression: string;
  recommendations: string;
  urgencyFlag: UrgencyFlag;
}

export type PipelineStage =
  | "queued"
  | "intake"
  | "analyzing"
  | "validating"
  | "reporting"
  | "quality_check"
  | "completed"
  | "failed";

export type StepStatus = "pending" | "completed" | "failed" | "skipped";

export interface StageStatus {
  stage: PipelineStage | "analysis" | "validation" | "report" | "qualityCheck";
  status: StepStatus;
  message?: string;
}

export interface PipelineError {
  code: string;
  message: string;
  stage: PipelineStage;
  details?: unknown;
}

export interface ConfidenceIndicators {
  overallConfidence: number;
  requiresAdditionalReview: boolean;
  lowConfidenceFindings: string[];
}

export type JobStatus = "queued" | "processing" | "completed" | "partial" | "failed";

export interface ApiResponse {
  jobId: string;
  status: JobStatus;
  metadata: ImageMetadata;
  findings: Finding[];
  report?: ReportSections;
  confidenceIndicators: ConfidenceIndicators;
  stageStatuses: StageStatus[];
  errors: PipelineError[];
}

export interface PipelineState {
  jobId: string;
  stage: PipelineStage;
  progress: number;
  metadata: ImageMetadata;
  findings: Finding[];
  report?: ReportSections;
  rawAnalysisOutput?: string;
  stageStatuses: StageStatus[];
  errors: PipelineError[];
  response?: ApiResponse;
  startedAt: string;
  updatedAt: string;
}

export interface PipelineStepModelConfig {
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface PipelineConfig {
  modality: Modality;
  analysis: PipelineStepModelConfig;
  report: PipelineStepModelConfig;
  analysisSystemPrompt: string;
  reportSystemPrompt: string;
}

export interface ErrorStateEntry {
  jobId: string;
  stage: PipelineStage;
  reason: string;
  metadata: ImageMetadata;
  errors: PipelineError[];
  createdAt: string;
  updatedAt: string;
}

export type FeedbackAction =
  | "corrected"
  | "confirmed"
  | "rejected"
  | "added";

export interface FeedbackEntry {
  feedbackId: string;
  jobId: string;
  findingIndex: number | null;
  action: FeedbackAction;
  originalFinding: Finding | null;
  correctedFinding: Partial<Finding> | null;
  comment: string;
  radiologistId: string;
  createdAt: string;
}
