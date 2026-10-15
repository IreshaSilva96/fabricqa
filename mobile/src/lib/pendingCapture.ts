// Hands the captured photo from the camera screen to the result screen.
// Kept in memory rather than in navigation params, which aren't meant for large data.
export type PendingCapture = {
  photoUri: string;          // local file, for showing the photo
  photoBase64: string;       // 224x224 JPEG, sent to the model and stored
  rollInspectionId: string;  // the roll inspection this defect belongs to
  rollNumber: string;
  fabric: string;
  rollLengthMeters: number;  // used to check the defect position is on the roll
  capturedAt: number;        // ms - when the photo was taken
};

let pending: PendingCapture | null = null;

export const setPendingCapture = (capture: PendingCapture) => { pending = capture; };
export const getPendingCapture = () => pending;
export const clearPendingCapture = () => { pending = null; };
