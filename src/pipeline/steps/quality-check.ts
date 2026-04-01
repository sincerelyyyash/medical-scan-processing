import type { ConfidenceIndicators, Finding } from "../../types";

export function runQualityCheck(findings: Finding[]): {
  findings: Finding[];
  confidenceIndicators: ConfidenceIndicators;
} {
  const flaggedFindings: string[] = [];

  const updatedFindings = findings.map((finding) => {
    const lowConfidence = finding.confidenceScore < 0.7;
    const criticalButUncertain =
      finding.severity === "critical" && finding.confidenceScore < 0.85;
    const requiresRadiologistReview = lowConfidence || criticalButUncertain;

    if (requiresRadiologistReview) {
      flaggedFindings.push(
        `${finding.location}: ${finding.description.slice(0, 80)}`,
      );
    }

    return { ...finding, requiresRadiologistReview };
  });

  const overallConfidence =
    updatedFindings.length === 0
      ? 1
      : Number(
          (
            updatedFindings.reduce(
              (sum, finding) => sum + finding.confidenceScore,
              0,
            ) / updatedFindings.length
          ).toFixed(3),
        );

  return {
    findings: updatedFindings,
    confidenceIndicators: {
      overallConfidence,
      requiresAdditionalReview: flaggedFindings.length > 0,
      lowConfidenceFindings: flaggedFindings,
    },
  };
}
