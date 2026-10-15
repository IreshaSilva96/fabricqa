// Defect types the model can return, how to show them, and the severity rule.
// Severity is a business rule (not predicted by the AI) - change it here only.
export type DefectLabel = 'defect_free' | 'hole' | 'horizontal' | 'stain' | 'vertical';
export type Severity = 'none' | 'minor' | 'major';

export const DEFECT_LABELS: DefectLabel[] = ['hole', 'stain', 'horizontal', 'vertical', 'defect_free'];

export const DISPLAY_NAME: Record<DefectLabel, string> = {
  hole: 'Hole',
  stain: 'Stain',
  horizontal: 'Horizontal line',
  vertical: 'Vertical line',
  defect_free: 'No defect',
};

const SEVERITY_RULE: Record<DefectLabel, Severity> = {
  hole: 'major',
  stain: 'minor',
  horizontal: 'minor',
  vertical: 'minor',
  defect_free: 'none',
};

export const severityFor = (label: DefectLabel): Severity => SEVERITY_RULE[label];
