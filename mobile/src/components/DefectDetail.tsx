// Custom component: defect detail, shared by inspectors and supervisors.
// Props: defectId, allowDelete (inspectors only). Shows the photo (loaded on demand),
// the AI suggestion vs the final decision, position and points.
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../lib/auth';
import { Defect, deleteDefect, fetchDefect, fetchDefectPhoto, fetchRollInspection, RollInspection } from '../lib/inspection';
import { DISPLAY_NAME } from '../lib/defects';
import { dateTimeOf } from '../lib/status';
import FactGrid from './FactGrid';
import SeverityBadge from './SeverityBadge';
import { colors, radius } from '../constants/theme';

export default function DefectDetail({ defectId, allowDelete }: { defectId: string; allowDelete: boolean }) {
  const { user } = useAuth();
  const [defect, setDefect] = useState<Defect | null>(null);
  const [ri, setRi] = useState<RollInspection | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const d = (await fetchDefect(defectId)).data;
          setDefect(d);
          if (d) {
            setRi((await fetchRollInspection(d.rollInspectionId)).data);
            setPhoto(await fetchDefectPhoto(defectId).catch(() => null));
          }
        } finally {
          setLoading(false);
        }
      })();
    }, [defectId])
  );

  if (loading) return <View style={[styles.screen, styles.center]}><ActivityIndicator /></View>;
  if (!defect) return <View style={[styles.screen, styles.center]}><Text style={styles.muted}>Defect not found.</Text></View>;

  const canDelete = allowDelete && defect.inspectorId === user?.uid && ri?.status === 'in_progress';

  const remove = () =>
    Alert.alert('Delete this defect?', 'Use this only for a defect captured by mistake.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await deleteDefect(defect);
            router.back();
          } catch (e: any) {
            Alert.alert('Could not delete', e?.message ?? 'Please try again.');
            setBusy(false);
          }
        },
      },
    ]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {photo ? (
        <Image source={{ uri: `data:image/jpeg;base64,${photo}` }} style={styles.photo} />
      ) : (
        <View style={[styles.photo, styles.center]}><Text style={styles.muted}>Photo not available offline</Text></View>
      )}

      <View style={styles.inline}>
        <Text style={styles.title}>{DISPLAY_NAME[defect.finalLabel]}</Text>
        <SeverityBadge severity={defect.severity} />
      </View>
      <Text style={styles.muted}>
        Roll {defect.rollNumber} · captured {dateTimeOf(defect.capturedAt)}
        {ri ? ` · by ${ri.inspectorName}` : ''}
      </Text>

      <FactGrid
        columns={2}
        facts={[
          { label: 'Position', value: defect.positionMeters !== null ? `${defect.positionMeters} m from start` : '—' },
          { label: 'Points', value: String(defect.points) },
          { label: 'AI suggestion', value: defect.aiPending ? 'Checked when online' : defect.aiLabel ? DISPLAY_NAME[defect.aiLabel] : 'Not used' },
          { label: 'AI confidence', value: defect.aiConfidence !== null ? `${Math.round(defect.aiConfidence * 100)}%` : '—' },
          { label: 'Inspector decision', value: DISPLAY_NAME[defect.finalLabel] },
          { label: 'Changed AI result', value: defect.overridden ? 'Yes' : 'No' },
        ]}
      />

      {canDelete && (
        <Pressable style={[styles.delete, busy && { opacity: 0.5 }]} onPress={remove} disabled={busy}>
          <Text style={styles.deleteText}>Delete defect</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12 },
  photo: { width: '100%', aspectRatio: 1, borderRadius: radius.card, backgroundColor: colors.border },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  delete: {
    height: 50, borderRadius: radius.button, borderWidth: 1, borderColor: colors.error, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteText: { color: colors.error, fontSize: 16, fontWeight: '600' },
});
