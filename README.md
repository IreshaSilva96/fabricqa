# FabricQA

AI-assisted fabric inspection for garment-factory quality assurance (SE5070 Enterprise Mobility, SLIIT MSc IT).
Iresha Silva – MS26902920.

Inspectors photograph defects on randomly sampled fabric rolls; a MobileNetV2 model suggests the defect type; the
inspector decides; each roll is scored with the 4-point system; and the supervisor receives a risk-ranked list of
items with a recommendation (accept, escalate, reject) and makes the final decision. Inspection works offline.

## Repository layout

| Folder | What it is |
| --- | --- |
| `mobile/` | React Native app (Expo SDK 57, Expo Router, TypeScript). Source in `mobile/src`. |
| `firestore/` | Firestore security rules (roles, ownership, roll locking, defect validation). |
| `seed/` | Node.js script that loads master data (POs, batches, items, rolls), simulating the ERP integration. |
| `inference/` | FastAPI + LiteRT inference API, deployed as a Docker web service on Render. |
| `training/` | Kaggle notebook (`fabricqa-classifier-v3.ipynb`) that trains and exports the classifier. |

## Source structure (`mobile/src`)

- `app/` – screens (Expo Router). One folder per role: `inspector/`, `supervisor/`.
- `components/` – UI components. **`RiskCard.tsx` is the custom component built from scratch**: it shows an
  item's rank, risk score (coloured circle: 70+ major, 40+ minor, otherwise neutral), status and flag on the
  supervisor's risk-ranked list.
- `lib/` – no UI: `config.ts` (policy thresholds), `scoring.ts` (sampling, 4-point score, round evaluation, risk),
  `outbox.ts` (offline queue), `inspection.ts` / `supervisor.ts` / `data.ts` (Firestore), `cache.ts`, `auth.tsx`.
- `hooks/`, `constants/` – online/sync status hooks and theme.

## Key logic

- **Sampling:** `sampleSize = max(1, ceil(total × 10%))`, rolls chosen with a Fisher–Yates shuffle.
- **Scoring:** 4-point system per roll; round evaluation and a risk score per item for the supervisor.
- **Offline:** an outbox queue (store-and-forward, FIFO, idempotent IDs) syncs changes when the connection
  returns; AI classification of photos taken offline is deferred until then. Recently used data is cached.

## AI model (version 1.1)

- MobileNetV2 (ImageNet weights) fine-tuned on 5 classes: `defect_free`, `hole`, `stain`, `horizontal`, `vertical`.
- Trained on the public datasets plus 47 of my own fabric photos (defect_free, hole, stain).
- Public test set: 86.3% accuracy (146 images).
- Live API: `https://fabricqa-inference.onrender.com/` – `GET /` returns status, classes and model version;
  the app sends photos for classification. (Free tier: the first request after idle can take ~1 minute.)
- The suggestion is advisory only; the inspector always confirms the defect type.

## Run it

1. `cd mobile`, copy `.env.example` to `.env.local` and fill in the Firebase web config.
2. `npm install`, then `npx expo start -c` and open in Expo Go (tested on an iPhone and an Android emulator).
3. Publish `firestore/firestore.rules` in the Firebase console.
4. `cd seed`, put a Firebase Admin key in `serviceAccountKey.json`, `npm install`, `node seed.js --reset`.
5. Create users in Firebase Authentication and a `users/{uid}` document with `role` (`inspector` or `supervisor`) and `name`.

The Admin key is git-ignored and must never be committed.

## Data and model credits

- Fabric Defect Dataset (Ranathunga, 2020) and Fabric Stain Dataset (Pathirana, 2020), Intelligence Lab, University of Moratuwa (Kaggle).
- Own fabric photos taken for this project.
- MobileNetV2 with ImageNet weights (Sandler et al., 2018), via Keras.
