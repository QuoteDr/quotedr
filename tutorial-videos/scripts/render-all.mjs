import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const tutorialIds = [
  "quote-builder-overview",
  "line-items-pricing",
  "ai-voice-quote",
  "satellite-measure",
  "ikea-quick-quote",
  "send-client-quote",
  "invoice-payments",
  "floor-plan-scanner",
  "material-calculators",
  "quickbooks-settings",
  "customize-brand",
  "landing-overview",
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const appRoot = resolve(projectRoot, "..");
const outputDir = resolve(appRoot, "videos", "tutorials");

mkdirSync(outputDir, { recursive: true });

for (const tutorialId of tutorialIds) {
  const output = `../videos/tutorials/${tutorialId}.mp4`;
  console.log(`Rendering ${tutorialId} -> ${output}`);
  const result = spawnSync(
    "npx",
    [
      "remotion",
      "render",
      tutorialId,
      output,
      "--codec=h264",
      "--overwrite",
      "--crf=24",
      "--pixel-format=yuv420p",
    ],
    {
      cwd: projectRoot,
      stdio: "inherit",
      shell: true,
    },
  );

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
