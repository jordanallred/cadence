// Copy the MediaPipe browser runtime (Apache-2.0) into public/wasm.
// Release builds use this alone; the pose model is fetched at run time.
import { cp } from "node:fs/promises";
await cp("node_modules/@mediapipe/tasks-vision/wasm", "public/wasm", {
  recursive: true,
});
console.log("MediaPipe runtime copied to public/wasm");
