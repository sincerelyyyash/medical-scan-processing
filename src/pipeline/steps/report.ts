import { generateReport } from "../../client/openrouter";
import type { ImageMetadata, PipelineConfig } from "../../types";

export async function runReportStep(
  findingsJson: string,
  metadata: ImageMetadata,
  config: PipelineConfig,
): Promise<string> {
  return await generateReport(findingsJson, metadata, config);
}
