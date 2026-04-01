#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
IMAGE_URL="${IMAGE_URL:-https://upload.wikimedia.org/wikipedia/commons/a/a1/Normal_posteroanterior_%28PA%29_chest_radiograph_%28X-ray%29.jpg}"

MODE="${1:-url}"

echo "=== MedSee E2E Test ==="
echo "Mode: ${MODE}"
echo

if [[ "${MODE}" == "upload" ]]; then
  IMAGE_FILE="${2:-}"
  if [[ -z "${IMAGE_FILE}" ]]; then
    echo "Usage: ./scripts/test-e2e.sh upload <path-to-image>"
    exit 1
  fi
  echo "Uploading file: ${IMAGE_FILE}"

  RESPONSE="$(
    curl -sS -X POST "${BASE_URL}/api/analyze" \
      -F "image=@${IMAGE_FILE}" \
      -F "modality=XR" \
      -F "bodyPart=chest" \
      -F "clinicalContext=Persistent cough and mild dyspnea"
  )"
else
  echo "Submitting image URL: ${IMAGE_URL}"

  RESPONSE="$(
    curl -sS -X POST "${BASE_URL}/api/analyze" \
      -H "Content-Type: application/json" \
      -d "{
        \"imageUrl\": \"${IMAGE_URL}\",
        \"modality\": \"XR\",
        \"bodyPart\": \"chest\",
        \"clinicalContext\": \"Persistent cough and mild dyspnea\"
      }"
  )"
fi

echo "Response: ${RESPONSE}"

JOB_ID="$(printf "%s" "${RESPONSE}" | bun -e 'const i=JSON.parse(require("fs").readFileSync(0,"utf8")); console.log(i.jobId || "")')"

if [[ -z "${JOB_ID}" ]]; then
  echo "Could not parse jobId from response."
  exit 1
fi

echo "jobId=${JOB_ID}"
echo
echo "Next steps:"
echo "  1) Stream progress:  bun run scripts/ws-subscribe.ts ${JOB_ID}"
echo "  2) Poll result:      curl -sS ${BASE_URL}/api/jobs/${JOB_ID} | jq ."
