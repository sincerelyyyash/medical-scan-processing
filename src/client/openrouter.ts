import { OpenRouter } from "@openrouter/sdk";
import type { ImageMetadata, PipelineConfig } from "../types";
import { LLMError } from "../utils/errors";

const apiKey = process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  throw new Error("Missing OPENROUTER_API_KEY environment variable.");
}

const client = new OpenRouter({ apiKey });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new LLMError("OpenRouter call timed out")),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function sendWithRetry<T>(
  fn: () => Promise<T>,
  retries = 1,
  timeoutMs = 30_000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await sleep(400 * (attempt + 1));
      }
    }
  }
  throw new LLMError("OpenRouter request failed after retries", lastError);
}

function extractContent(response: unknown): string {
  const content = (response as any)?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textPart = content.find((part) => part?.type === "text");
    if (textPart?.text) return textPart.text;
  }
  throw new LLMError("OpenRouter response missing text content", response);
}

function resolveImageUrl(metadata: ImageMetadata): string {
  if (metadata.imageSource.type === "url") return metadata.imageSource.url;
  return metadata.imageSource.dataUri;
}

export async function analyzeImage(
  metadata: ImageMetadata,
  config: PipelineConfig,
): Promise<string> {
  const imageUrl = resolveImageUrl(metadata);

  const response = await sendWithRetry(
    () =>
      client.chat.send({
        chatGenerationParams: {
          model: config.analysis.model,
          temperature: config.analysis.temperature,
          maxTokens: config.analysis.maxTokens,
          messages: [
            {
              role: "system",
              content: config.analysisSystemPrompt,
            },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Analyze this ${metadata.modality} image for ${metadata.bodyPart}. Clinical context: ${metadata.clinicalContext}`,
                },
                {
                  type: "image_url",
                  imageUrl: { url: imageUrl },
                },
              ],
            },
          ],
        },
      }),
    1,
    45_000,
  );

  return extractContent(response);
}

export async function generateReport(
  findingsJson: string,
  metadata: ImageMetadata,
  config: PipelineConfig,
): Promise<string> {
  const response = await sendWithRetry(
    () =>
      client.chat.send({
        chatGenerationParams: {
          model: config.report.model,
          temperature: config.report.temperature,
          maxTokens: config.report.maxTokens,
          messages: [
            {
              role: "system",
              content: config.reportSystemPrompt,
            },
            {
              role: "user",
              content: [
                `Study metadata:`,
                `- Modality: ${metadata.modality}`,
                `- Body part: ${metadata.bodyPart}`,
                `- Clinical context: ${metadata.clinicalContext}`,
                ``,
                `Structured findings from image analysis:`,
                findingsJson,
              ].join("\n"),
            },
          ],
        },
      }),
    1,
    60_000,
  );

  return extractContent(response);
}
