// Calls the FabricQA inference API (FastAPI + TFLite model on Render).
import { DefectLabel } from './defects';

const BASE_URL = process.env.EXPO_PUBLIC_INFERENCE_URL;

export type Prediction = {
  label: DefectLabel;
  confidence: number;          // 0-1, for the top label
  needsManualCheck: boolean;   // true when confidence is below the server's threshold
  threshold: number;
  probabilities: Record<DefectLabel, number>;
  modelVersion: string;
};

// The free server sleeps after 15 minutes idle and can take ~1 minute to wake,
// so classification gets a generous timeout.
export async function classify(photoBase64: string, timeoutMs = 70000): Promise<Prediction> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: photoBase64 }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Server error ${res.status}`);
    return (await res.json()) as Prediction;
  } finally {
    clearTimeout(timer);
  }
}

// Fire-and-forget health check so the server starts waking up before the first photo
export function wakeInference() {
  fetch(`${BASE_URL}/`).catch(() => {});
}
