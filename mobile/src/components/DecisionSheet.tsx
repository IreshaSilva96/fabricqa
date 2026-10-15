// Custom component: confirmation sheet for a supervisor decision.
// Props: visible, action, sampleCount, inspectors, defaultAssigneeId, busy.
// Events: onConfirm({ assignee, note }), onCancel.
// Escalation and 100% check pick who inspects next from a dropdown (the previous inspector is pre-selected).
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput,
  TouchableWithoutFeedback, View,
} from 'react-native';
import type { Person } from '../lib/inspection';
import Dropdown from './Dropdown';
import type { Action } from '../lib/supervisor';
import { colors, radius } from '../constants/theme';

type Props = {
  visible: boolean;
  action: Action | null;
  sampleCount: number;          // rolls the next round will contain
  inspectors: Person[];
  defaultAssigneeId: string;
  busy: boolean;
  onConfirm: (choice: { assignee?: Person; note: string }) => void;
  onCancel: () => void;
};

const TEXT: Record<Action, { title: string; confirm: string }> = {
  escalate: { title: 'Approve escalation', confirm: 'Start next round' },
  full: { title: 'Order a 100% check', confirm: 'Start 100% check' },
  accept: { title: 'Accept this item', confirm: 'Accept item' },
  reject: { title: 'Reject this item', confirm: 'Reject item' },
};

export default function DecisionSheet({
  visible, action, sampleCount, inspectors, defaultAssigneeId, busy, onConfirm, onCancel,
}: Props) {
  const [assigneeId, setAssigneeId] = useState(defaultAssigneeId);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) {
      setAssigneeId(defaultAssigneeId);
      setNote('');
    }
  }, [visible, defaultAssigneeId]);

  if (!action) return null;
  const assigning = action === 'escalate' || action === 'full';
  const t = TEXT[action];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.backdrop}>
        <ScrollView
          style={styles.sheet}
          contentContainerStyle={styles.sheetContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          bounces={false}
        >
          <Text style={styles.title}>{t.title}</Text>

          {assigning ? (
            <>
              <Text style={styles.muted}>
                {action === 'full'
                  ? `All ${sampleCount} remaining rolls will be inspected.`
                  : `${sampleCount} more roll${sampleCount === 1 ? '' : 's'} will be picked at random from the rolls not yet inspected.`}
              </Text>
              <Text style={styles.label}>Assign to</Text>
              <Dropdown
                options={inspectors.map((p) => ({
                  value: p.uid,
                  label: p.name,
                  note: p.uid === defaultAssigneeId ? 'Previous' : undefined,
                }))}
                value={assigneeId}
                onChange={setAssigneeId}
                placeholder="Choose an inspector"
              />
            </>
          ) : (
            <>
              <Text style={styles.muted}>This is final. The inspector won't inspect any more rolls of this item.</Text>
              <Text style={styles.label}>Note (optional)</Text>
              <TextInput
                style={styles.input}
                value={note}
                onChangeText={setNote}
                placeholder={action === 'reject' ? 'e.g. holes across several rolls' : 'e.g. minor stains only'}
                placeholderTextColor={colors.textMuted}
                multiline
                returnKeyType="done"
                submitBehavior="blurAndSubmit"
              />
            </>
          )}

          <Pressable
            style={[styles.primary, action === 'reject' && { backgroundColor: colors.major }, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={() => {
              Keyboard.dismiss();
              onConfirm({ assignee: inspectors.find((p) => p.uid === assigneeId), note });
            }}
          >
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{t.confirm}</Text>}
          </Pressable>
          <Pressable style={styles.cancel} onPress={onCancel} disabled={busy}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </ScrollView>
      </View>
      </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { flexGrow: 0, maxHeight: '90%', backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  sheetContent: { padding: 20, paddingBottom: 34, gap: 10 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  muted: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  label: { fontSize: 14, fontWeight: '600', color: colors.text, marginTop: 4 },
  option: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 48, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1, borderColor: colors.inputBorder, marginBottom: 8,
  },
  optionSelected: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primaryTint },
  optionText: { fontSize: 16, color: colors.text, fontWeight: '600' },
  tag: { fontSize: 12, color: colors.primary, fontWeight: '700' },
  input: {
    minHeight: 70, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 10, padding: 12,
    fontSize: 15, color: colors.text, textAlignVertical: 'top',
  },
  primary: { height: 54, borderRadius: radius.button, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  primaryText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  cancel: { height: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
});
