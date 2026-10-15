// Custom component: search box with a clear button.
// Props: value, placeholder. Events: onChangeText (every keystroke), onSubmit (keyboard "Search").
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors } from '../constants/theme';

type Props = {
  value: string;
  placeholder: string;
  onChangeText: (text: string) => void;
  onSubmit?: () => void;
};

export default function SearchBar({ value, placeholder, onChangeText, onSubmit }: Props) {
  return (
    <View style={styles.wrap}>
      <TextInput
        style={styles.input}
        value={value}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        autoCapitalize="characters"
        autoCorrect={false}
        clearButtonMode="never"
        accessibilityLabel={placeholder}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChangeText('')} hitSlop={10} accessibilityLabel="Clear search">
          <Text style={styles.clear}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 10, paddingHorizontal: 12, minHeight: 46,
  },
  input: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: 10 },
  clear: { fontSize: 16, color: colors.textMuted, paddingLeft: 8 },
});
