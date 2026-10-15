// Result screen. The model suggests, the inspector decides: nothing is saved until
// the inspector confirms the AI's label or chooses a different one.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { router } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { useAuth } from '../../lib/auth';
import { classify, Prediction } from '../../lib/inference';
import { clearPendingCapture, getPendingCapture } from '../../lib/pendingCapture';
import { fetchRollInspection, saveDefect } from '../../lib/inspection';
import { DefectLabel, DISPLAY_NAME, severityFor } from '../../lib/defects';
import SeverityBadge from '../../components/SeverityBadge';
import ConfidenceBar from '../../components/ConfidenceBar';
import DefectPicker from '../../components/DefectPicker';
import { colors, radius } from '../../constants/theme';

type Phase = 'checking' | 'ready' | 'failed';

export default function Result() {
  const pending = getPendingCapture();
  const { user } = useAuth();
  const [phase, setPhase] = useState<Phase>('checking');
  const [slow, setSlow] = useState(false);
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [picking, setPicking] = useState(false);          // showing the defect picker
  const [picked, setPicked] = useState<DefectLabel | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const positionRef = useRef<TextInput>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [positionText, setPositionText] = useState('');
  const [noAi, setNoAi] = useState<'offline' | 'unreachable' | null>(null); // why there is no AI suggestion

  const runCheck = useCallback(async () => {
    if (!pending) return;
    setPhase('checking');
    setSlow(false);
    const net = await NetInfo.fetch();
    if (!net.isConnected || net.isInternetReachable === false) {
      // Offline: the inspector decides now; the AI checks the photo when it uploads
      setNoAi('offline');
      setPrediction(null);
      setPicking(true);
      setPhase('ready');
      return;
    }
    setNoAi(null);
    const slowTimer = setTimeout(() => setSlow(true), 8000);
    try {
      const p = await classify(pending.photoBase64);
      setPrediction(p);
      setPicking(p.needsManualCheck); // unsure -> the inspector must choose
      setPicked(null);
      setPhase('ready');
    } catch {
      setPhase('failed');
    } finally {
      clearTimeout(slowTimer);
    }
  }, [pending]);

  useEffect(() => {
    runCheck();
  }, [runCheck]);

  if (!pending) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.muted}>No photo to show.</Text>
        <Pressable style={styles.secondary} onPress={() => router.back()}>
          <Text style={styles.secondaryText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const finalLabel: DefectLabel | null = picking ? picked : prediction?.label ?? null;

  // Where the defect is along the roll, in metres from the roll start (required for real defects)
  const needsPosition = !!finalLabel && finalLabel !== 'defect_free';
  const rollLength = pending.rollLengthMeters;
  const position = Number(positionText.replace(',', '.'));
  const positionValid =
    !needsPosition ||
    (positionText.trim() !== '' && Number.isFinite(position) && position >= 0 && (!rollLength || position <= rollLength));
  const canSave = !!finalLabel && positionValid && !saving;
  // Tells the inspector what is still missing, instead of a silently disabled button
  const missing = !finalLabel ? 'Choose the defect type' : !positionValid ? 'Enter where the defect is (metres from the roll start)' : null;

  // After choosing a real defect, bring the position field into view and open the keyboard
  const pick = (label: DefectLabel) => {
    setPicked(label);
    if (label !== 'defect_free') {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
        positionRef.current?.focus();
      }, 150);
    }
  };

  const onPrimary = () => {
    if (canSave) return save();
    if (finalLabel && !positionValid) {
      scrollRef.current?.scrollToEnd({ animated: true });
      positionRef.current?.focus();
    } else {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const save = async () => {
    if (!finalLabel || !user || !positionValid) return;
    setSaving(true);
    setSaveError(null);
    try {
      const rollInspection = (await fetchRollInspection(pending.rollInspectionId)).data;
      if (!rollInspection || rollInspection.status !== 'in_progress') {
        throw new Error('This roll inspection has already ended.');
      }
      await saveDefect({
        rollInspection,
        inspectorId: user.uid,
        capturedAt: pending.capturedAt,
        photoBase64: pending.photoBase64,
        prediction,
        finalLabel,
        positionMeters: needsPosition ? position : null,
      });
      clearPendingCapture();
      router.back(); // back to the roll screen, which now lists this defect and its points
    } catch (e: any) {
      setSaveError(e?.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View>
          <Text style={styles.roll}>Roll {pending.rollNumber}</Text>
          <Text style={styles.muted}>{pending.fabric}</Text>
        </View>

        <Image source={{ uri: pending.photoUri }} style={styles.photo} />

        {phase === 'checking' && (
          <View style={styles.card}>
            <ActivityIndicator />
            <Text style={styles.cardText}>Checking the photo…</Text>
            {slow && (
              <Text style={styles.muted}>
                The checking server is waking up after a quiet period. This can take up to a minute.
              </Text>
            )}
          </View>
        )}

        {phase === 'failed' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Couldn't check the photo</Text>
            <Text style={styles.muted}>The checking server didn't respond. Try again, or choose the defect yourself.</Text>
            <Pressable style={styles.secondary} onPress={runCheck}>
              <Text style={styles.secondaryText}>Try again</Text>
            </Pressable>
            <Pressable style={styles.link} onPress={() => { setNoAi('unreachable'); setPicking(true); setPhase('ready'); }}>
              <Text style={styles.linkText}>Choose the defect myself</Text>
            </Pressable>
          </View>
        )}

        {phase === 'ready' && !picking && prediction && (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>{DISPLAY_NAME[prediction.label]}</Text>
              <SeverityBadge severity={severityFor(prediction.label)} />
            </View>
            <ConfidenceBar value={prediction.confidence} threshold={prediction.threshold} />
            <Text style={styles.muted}>Nothing is saved until you confirm. If it's wrong, change it.</Text>
          </View>
        )}

        {phase === 'ready' && picking && (
          <View style={[styles.card, prediction?.needsManualCheck && styles.cardWarning]}>
            {prediction?.needsManualCheck ? (
              <>
                <Text style={styles.cardTitle}>Needs your check</Text>
                <Text style={styles.muted}>
                  The model is unsure ({Math.round(prediction.confidence * 100)}%). Best guess:{' '}
                  {DISPLAY_NAME[prediction.label]}. Pick what you see:
                </Text>
              </>
            ) : prediction ? (
              <>
                <Text style={styles.cardTitle}>Change the result</Text>
                <Text style={styles.muted}>
                  AI suggested {DISPLAY_NAME[prediction.label]} ({Math.round(prediction.confidence * 100)}%). Pick what you see:
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.cardTitle}>Choose the defect</Text>
                <Text style={styles.muted}>
                  {noAi === 'offline' ? "You're offline. " : ''}Pick what you see. The AI will check this photo when it
                  uploads, so its accuracy is still measured.
                </Text>
              </>
            )}
            <DefectPicker selected={picked} suggested={prediction?.label} onSelect={pick} />
            {prediction && !prediction.needsManualCheck && (
              <Pressable style={styles.link} onPress={() => { setPicking(false); setPicked(null); }}>
                <Text style={styles.linkText}>Keep the AI result</Text>
              </Pressable>
            )}
          </View>
        )}

        {phase === 'ready' && needsPosition && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Where is the defect?</Text>
            <Text style={styles.muted}>
              Distance from the start of the roll{rollLength ? ` (0–${rollLength} m)` : ''}.
            </Text>
            <View style={styles.positionRow}>
              <TextInput
                ref={positionRef}
                style={[styles.positionInput, positionText !== '' && !positionValid && styles.inputError]}
                value={positionText}
                onChangeText={setPositionText}
                placeholder="e.g. 12.5"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                returnKeyType="done"
                accessibilityLabel="Defect position in metres from the roll start"
              />
              <Text style={styles.unit}>m</Text>
            </View>
            {positionText !== '' && !positionValid && (
              <Text style={styles.error}>Enter a number between 0 and {rollLength} m.</Text>
            )}
          </View>
        )}

        {saveError && <Text style={styles.error}>{saveError}</Text>}
      </ScrollView>

      {phase === 'ready' && (
        <View style={styles.footer}>
          {missing && !saving && <Text style={styles.hint}>{missing}</Text>}
          <Pressable style={[styles.primary, !canSave && { opacity: 0.5 }]} onPress={onPrimary} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryText}>{picking ? 'Save my verdict' : 'Confirm & save defect'}</Text>
            )}
          </Pressable>
          {!picking && (
            <Pressable style={styles.secondary} onPress={() => { setPicking(true); setPicked(null); }}>
              <Text style={styles.secondaryText}>Wrong? Change it</Text>
            </Pressable>
          )}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  content: { padding: 16, gap: 14 },
  roll: { fontSize: 18, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  photo: { width: '100%', aspectRatio: 1, borderRadius: radius.card, backgroundColor: colors.border },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.card, padding: 16, gap: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  cardWarning: { borderWidth: 2, borderColor: '#E07B26' },
  cardTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  cardText: { fontSize: 15, color: colors.text, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 28, fontWeight: '700', color: colors.text },
  error: { color: colors.error },
  positionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  positionInput: {
    flex: 1, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 18, color: colors.text, backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.error },
  unit: { fontSize: 18, fontWeight: '600', color: colors.textMuted },
  footer: { padding: 16, paddingBottom: 28, gap: 10, backgroundColor: colors.background },
  hint: { fontSize: 14, color: colors.warningText, textAlign: 'center', fontWeight: '600' },
  primary: {
    height: 54, borderRadius: radius.button, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  secondary: {
    height: 48, borderRadius: radius.button, borderWidth: 1, borderColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, paddingHorizontal: 20,
  },
  secondaryText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  link: { alignItems: 'center', paddingVertical: 6 },
  linkText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
});
