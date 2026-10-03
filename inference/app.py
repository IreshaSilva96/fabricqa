"""FabricQA inference API.

Loads the fabric defect classifier (TFLite) once at start-up and classifies
fabric images sent by the FabricQA mobile app.
"""
import base64
import io
import json
import threading

import numpy as np
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image
from pydantic import BaseModel
from ai_edge_litert.interpreter import Interpreter

MODEL_PATH = "fabric_defect_classifier.tflite"
LABELS_PATH = "labels.json"
MODEL_VERSION = "1.0"
MAX_IMAGE_BYTES = 2 * 1024 * 1024      # reject anything over 2 MB
DEFECT_FREE_THRESHOLD = 0.85           # stricter: declaring fabric clean must be confident

with open(LABELS_PATH) as f:
    meta = json.load(f)
CLASSES = meta["classes"]
IMG_SIZE = meta.get("img_size", 224)
THRESHOLD = meta.get("confidence_threshold", 0.70)

interpreter = Interpreter(model_path=MODEL_PATH)
interpreter.allocate_tensors()
input_details = interpreter.get_input_details()[0]
output_details = interpreter.get_output_details()[0]
interpreter_lock = threading.Lock()    # the interpreter is not thread-safe

app = FastAPI(title="FabricQA inference API", version=MODEL_VERSION)


class PredictRequest(BaseModel):
    image: str  # base64-encoded JPEG or PNG (a "data:image/...;base64," prefix is allowed)


def classify(raw: bytes) -> dict:
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large (max 2 MB)")
    try:
        img = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read image")

    # Same preprocessing as training: resize to 224x224, raw 0-255 floats.
    # Scaling to [-1, 1] happens inside the model.
    img = img.resize((IMG_SIZE, IMG_SIZE), Image.BILINEAR)
    x = np.asarray(img, dtype=np.float32)[np.newaxis, ...]

    with interpreter_lock:
        interpreter.set_tensor(input_details["index"], x)
        interpreter.invoke()
        probs = interpreter.get_tensor(output_details["index"])[0]

    top = int(np.argmax(probs))
    label = CLASSES[top]
    confidence = float(probs[top])
    required = DEFECT_FREE_THRESHOLD if label == "defect_free" else THRESHOLD

    return {
        "label": label,
        "confidence": round(confidence, 4),
        "needsManualCheck": confidence < required,
        "threshold": required,
        "probabilities": {c: round(float(p), 4) for c, p in zip(CLASSES, probs)},
        "modelVersion": MODEL_VERSION,
    }


@app.get("/")
def health():
    """Health check - also used by the app to wake the Space up."""
    return {"status": "ok", "classes": CLASSES, "modelVersion": MODEL_VERSION}


@app.post("/predict")
def predict(req: PredictRequest):
    """Used by the mobile app: JSON body with a base64 image."""
    data = req.image.split(",", 1)[1] if req.image.startswith("data:") else req.image
    if len(data) > MAX_IMAGE_BYTES * 4 // 3 + 4:
        raise HTTPException(status_code=413, detail="Image too large (max 2 MB)")
    try:
        raw = base64.b64decode(data, validate=True)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 image")
    return classify(raw)


@app.post("/predict-file")
async def predict_file(file: UploadFile = File(...)):
    """For testing in the browser at /docs: upload an image file."""
    return classify(await file.read())
