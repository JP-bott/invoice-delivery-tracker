# Image Background Remover: BiRefNet General Lite

The existing `/background-remover` page runs **BiRefNet Lite**, the official
`ZhengPeng7/BiRefNet_lite` checkpoint exported to browser-compatible ONNX at
512×512 by Studio Ludens. The original upload, previews, AI-cutout refinement,
transparent PNG download, export popup and new-image workflow remain unchanged.

## Model provenance and licenses

- Original model and training project: https://github.com/ZhengPeng7/BiRefNet
- Official checkpoint: https://huggingface.co/ZhengPeng7/BiRefNet_lite
- Browser-compatible 512px ONNX model: https://huggingface.co/studioludens/birefnet-lite-512
- Pinned checkpoint revision: `4a3c40c36c94093cc1e724d9ea428b8fa4b57dc7`
- BiRefNet Lite weights: MIT (commercial use permitted subject to license text)
- Browser-ready converted model: MIT (commercial use permitted subject to license text)
- Transformers.js runtime: Apache-2.0 (commercial use permitted subject to license text)

Attribution and original license notices must be retained when redistributing
the model and runtime. The exported ONNX graph was built by a third party using
the official Lite model's trained weights, not published by the original author.
Use the full pretrained Lite model on a Python server if exact original 1024px
inference is required; that is intentionally excluded from this free browser path.

## Browser runtime

`client/src/utils/birefnetLite.js` dynamically imports
`@huggingface/transformers@4.3.0` only when processing an image. It downloads
the 512px model with `dtype:'fp32'` (`onnx/model.onnx`, approximately
192 MB) and uses ONNX WebAssembly (`device:'wasm'`). WebGPU is intentionally
disabled because this app previously encountered invalid WGSL shader compilation.

Transformers.js uses browser cache storage where available. A single
module-scope model-loading promise is reused, and subsequent images reuse
the loaded model. The processor reads `preprocessor_config.json` for 512×512
resize and ImageNet RGB mean/std normalization. ONNX output logits are passed
through sigmoid to compute alpha and resized to the original source dimensions;
the original RGB pixels are retained. PNG output has a real alpha channel.

The conversion runs locally. Browser model files download from Hugging Face
(model host) on the first use or after cache eviction; no input images are
uploaded, and no inference API, server GPU, database, per-image fee or
subscription is required. Hosting the SPA still consumes normal Vercel
deployment bandwidth; Hugging Face model access and user bandwidth depend
on their respective acceptable-use policies and connectivity. Very large
images and low-memory devices can fail, and CPU inference may be slow.

## Build and deploy

1. `npm install` with Node.js 20+ (this regenerates the existing stale lockfile).
2. Commit the updated `package-lock.json`.
3. `npm test`
4. `npm run build`
5. `npm run dev` to test locally (or `npm run preview` to inspect a production build).
6. Open `/background-remover`; upload JPG/PNG/WebP; click **Remove background**.
7. Confirm real transparency and dimensions in the downloaded PNG; test repeat
   inference and an image with hair/fine edges.
8. Merge after checks succeed, then redeploy the newest `main` in Vercel.
   A cold browser will download the model on first processing.

## Limitations

The 512px model trades speed/memory for segmentation detail; it may miss fine
hair, glass, or transparent objects. The existing erase/restore and edge
controls remain available. Browsers need sufficient RAM to load ~192 MB
weights, runtime buffers, and image canvases. Offline first use is unsupported.
Do not advertise a particular inference time or pixel-perfect matte quality.
Browser download progress is shown only if provided by the runtime.
