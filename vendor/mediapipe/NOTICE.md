# MediaPipe local runtime

- Package: @mediapipe/tasks-vision 0.10.32, Google MediaPipe, Apache-2.0.
- `vision_bundle.js` is the unmodified `vision_bundle.cjs` distribution, renamed for conventional JavaScript MIME delivery. The classic worker supplies its `exports` object before importScripts.
- `wasm/vision_wasm_internal.*` and `wasm/vision_wasm_nosimd_internal.*` are the matching SIMD and non-SIMD distribution files.
- Model: hand_landmarker, float16, version 1.
- Package source: https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/
- Model source: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
- Upstream license: https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE

These files are served from the project. Camera video is processed locally and is not uploaded or recorded by this application.
