import { pipeline } from "@xenova/transformers";

const classifier = await pipeline("sentiment-analysis");
const out = await classifier("Running Transformers.js with Bun on Windows.");
console.log(out);
