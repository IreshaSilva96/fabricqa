# FabricQA inference API

Classifies fabric images into `defect_free`, `hole`, `horizontal`, `stain` and `vertical`
for the FabricQA mobile app (SE5070 Enterprise Mobility). Deployed as a Docker web service on Render.

## Endpoints

- `GET /` – health check (also used by the app to wake the service)
- `POST /predict` – JSON `{"image": "<base64>"}`, used by the app
- `POST /predict-file` – multipart image upload, for testing at `/docs`

## Model

MobileNetV2 transfer learning (ImageNet weights), trained on the Fabric Defect Dataset and the
Fabric Stain Dataset (University of Moratuwa Intelligence Lab, Kaggle). Exported to TFLite and served
with LiteRT (`ai-edge-litert`).

Required files in this folder: `fabric_defect_classifier.tflite`, `labels.json`.

## Run locally

```
docker build -t fabricqa-inference .
docker run -p 7860:7860 fabricqa-inference
```
Then open http://localhost:7860/docs
