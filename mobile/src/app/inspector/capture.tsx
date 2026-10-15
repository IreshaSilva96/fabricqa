// Camera screen (native hardware). The preview is square and the saved photo is the
// same centre square, so what the inspector sees is exactly what the model sees.
import { useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { setPendingCapture } from '../../lib/pendingCapture';
import { colors } from '../../constants/theme';

const MODEL_SIZE = 224; // the model's input size - photos are shrunk to this before upload

export default function Capture() {
  const params = useLocalSearchParams<{
    rollInspectionId: string; rollNumber: string; fabric: string; lengthMeters: string;
  }>();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const { width } = useWindowDimensions();

  if (!permission) return <View style={styles.screen} />;

  if (!permission.granted) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.muted}>FabricQA uses the camera to photograph fabric defects.</Text>
        <Pressable
          style={styles.primary}
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
        >
          <Text style={styles.primaryText}>{permission.canAskAgain ? 'Allow camera' : 'Open Settings'}</Text>
        </Pressable>
      </View>
    );
  }

  const takePhoto = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const capturedAt = Date.now();
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (!photo) throw new Error('No photo returned');

      // Crop the centre square (matches the square preview), then shrink to 224x224.
      // Constraint design: ~20 KB uploaded instead of a multi-MB photo.
      const side = Math.min(photo.width, photo.height);
      const context = ImageManipulator.manipulate(photo.uri);
      context
        .crop({ originX: (photo.width - side) / 2, originY: (photo.height - side) / 2, width: side, height: side })
        .resize({ width: MODEL_SIZE, height: MODEL_SIZE });
      const image = await context.renderAsync();
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });

      setPendingCapture({
        photoUri: saved.uri,
        photoBase64: saved.base64 ?? '',
        rollInspectionId: params.rollInspectionId,
        rollNumber: params.rollNumber,
        fabric: params.fabric,
        rollLengthMeters: Number(params.lengthMeters) || 0,
        capturedAt,
      });
      router.replace('/inspector/result');
    } catch (e: any) {
      Alert.alert('Could not capture the photo', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.info}>
        <Text style={styles.title}>Roll {params.rollNumber}</Text>
        <Text style={styles.muted}>{params.fabric} · {params.lengthMeters} m roll</Text>
      </View>

      <View style={{ width, height: width }}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        <View pointerEvents="none" style={styles.frame} />
      </View>

      <View style={styles.bottom}>
        <Text style={styles.hint}>Fill the square with the defect area. Hold the phone steady.</Text>
        <Pressable
          style={[styles.shutter, busy && { opacity: 0.6 }]}
          onPress={takePhoto}
          disabled={busy}
          accessibilityLabel="Capture photo"
        >
          {busy ? <ActivityIndicator color={colors.primary} /> : <View style={styles.shutterInner} />}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.background },
  info: { padding: 16, backgroundColor: colors.surface },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  frame: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)', margin: 12, borderRadius: 8 },
  bottom: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20, padding: 16 },
  hint: { color: '#FFFFFF', fontSize: 15, textAlign: 'center' },
  shutter: {
    width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#FFFFFF' },
  primary: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 24 },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
