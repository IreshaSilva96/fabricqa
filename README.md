# FabricQA

AI-assisted fabric inspection for garment-factory quality assurance (SE5070 Enterprise Mobility, SLIIT MSc IT).

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
| `training/` | Kaggle notebook that trains and exports the classifier. |

## Source structure (`mobile/src`)

- `app/` – screens (Expo Router). One folder per role: `inspector/`, `supervisor/`.
- `components/` – custom UI components (RiskCard, DecisionSheet, ScoreCard, TimeRange, Dropdown, SyncBanner, …).
- `lib/` – no UI: `config.ts` (policy thresholds), `scoring.ts` (sampling, 4-point score, round evaluation, risk),
  `outbox.ts` (offline queue), `inspection.ts` / `supervisor.ts` / `data.ts` (Firestore), `cache.ts`, `auth.tsx`.
- `hooks/`, `constants/` – online/sync status hooks and theme.

## Run it

1. `cd mobile`, copy `.env.example` to `.env.local` and fill in the Firebase web config.
2. `npm install`, then `npx expo start -c` and open in Expo Go (iPhone or Android emulator).
3. Publish `firestore/firestore.rules` in the Firebase console.
4. `cd seed`, put a Firebase Admin key in `serviceAccountKey.json`, `npm install`, `node seed.js --reset`.
5. Create users in Firebase Authentication and a `users/{uid}` document with `role` (`inspector` or `supervisor`) and `name`.

## Data and model credits

- Fabric Defect Dataset (Ranathunga, 2020) and Fabric Stain Dataset (Pathirana, 2020), Intelligence Lab, University of Moratuwa (Kaggle).
- MobileNetV2 with ImageNet weights (Sandler et al., 2018), via Keras.
