import { z } from "zod";
import { getPipelineConfig, normalizeModality } from "../../config/pipeline";
import type { ImageMetadata, ImageSource, PipelineConfig } from "../../types";
import { ValidationError } from "../../utils/errors";

const urlIntakeSchema = z.object({
  imageUrl: z.string().url(),
  modality: z.string().min(1),
  bodyPart: z.string().min(1),
  clinicalContext: z.string().min(1),
});

const fieldsOnlySchema = z.object({
  modality: z.string().min(1),
  bodyPart: z.string().min(1),
  clinicalContext: z.string().min(1),
});

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function validateImageUrl(url: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { method: "HEAD" });
  } catch (error) {
    throw new ValidationError(
      `Image URL is not reachable: ${(error as Error).message}`,
    );
  }

  if (!response.ok) {
    throw new ValidationError(
      `Image URL returned HTTP ${response.status}`,
    );
  }

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim();
  if (contentType && !ALLOWED_MIME_TYPES.has(contentType)) {
    throw new ValidationError(
      `Image URL content-type '${contentType}' is not a supported image format. Allowed: ${[...ALLOWED_MIME_TYPES].join(", ")}`,
    );
  }
}

export function runIntakeFromUpload(
  fields: Record<string, string>,
  file: { buffer: Buffer; mimetype: string; originalname: string },
): { metadata: ImageMetadata; config: PipelineConfig } {
  const parsed = fieldsOnlySchema.safeParse(fields);
  if (!parsed.success) {
    throw new ValidationError("Invalid intake payload", parsed.error.flatten());
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    throw new ValidationError(
      `Unsupported image format: ${file.mimetype}. Allowed: ${[...ALLOWED_MIME_TYPES].join(", ")}`,
    );
  }

  const base64 = file.buffer.toString("base64");
  const dataUri = `data:${file.mimetype};base64,${base64}`;
  const imageSource: ImageSource = { type: "base64", dataUri };

  const metadata: ImageMetadata = {
    imageSource,
    modality: normalizeModality(parsed.data.modality),
    bodyPart: parsed.data.bodyPart.trim(),
    clinicalContext: parsed.data.clinicalContext.trim(),
  };

  return { metadata, config: getPipelineConfig(metadata.modality) };
}

export async function runIntake(input: unknown): Promise<{
  metadata: ImageMetadata;
  config: PipelineConfig;
}> {
  const parsed = urlIntakeSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError("Invalid intake payload", parsed.error.flatten());
  }

  await validateImageUrl(parsed.data.imageUrl);

  const imageSource: ImageSource = { type: "url", url: parsed.data.imageUrl };

  const metadata: ImageMetadata = {
    imageSource,
    modality: normalizeModality(parsed.data.modality),
    bodyPart: parsed.data.bodyPart.trim(),
    clinicalContext: parsed.data.clinicalContext.trim(),
  };

  const config = getPipelineConfig(metadata.modality);

  return { metadata, config };
}
