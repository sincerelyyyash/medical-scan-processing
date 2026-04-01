import { analyzeImage } from "../../client/openrouter";
import type { ImageMetadata, PipelineConfig } from "../../types";

export async function runAnalyzeStep(
  metadata: ImageMetadata,
  config: PipelineConfig,
): Promise<string> {
  return await analyzeImage(metadata, config);
}
