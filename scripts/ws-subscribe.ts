const baseUrl = process.env.BASE_URL || "http://localhost:3000";
const jobId = process.argv[2];

if (!jobId) {
  console.error("Usage: bun run scripts/ws-subscribe.ts <jobId>");
  process.exit(1);
}

const wsUrl = baseUrl.replace(/^http/, "ws") + "/ws";
const socket = new WebSocket(wsUrl);

socket.addEventListener("open", () => {
  console.log(`Connected to ${wsUrl}`);
  socket.send(JSON.stringify({ subscribe: jobId }));
  console.log(`Subscribed to job: ${jobId}`);
});

socket.addEventListener("message", (event) => {
  const raw = typeof event.data === "string" ? event.data : String(event.data);
  const ts = new Date().toISOString();
  try {
    const parsed = JSON.parse(raw);
    const stage = parsed.stage ?? "?";
    const progress = parsed.progress ?? "?";
    console.log(`\n--- [${ts}]  stage=${stage}  progress=${progress}% ---`);
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log(`[${ts}] ${raw}`);
  }
});

socket.addEventListener("error", (event) => {
  console.error("WebSocket error:", event);
});

socket.addEventListener("close", () => {
  console.log("WebSocket closed");
});
