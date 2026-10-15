// Inspector's defect screen: can delete a defect captured by mistake while the roll is in progress.
import { useLocalSearchParams } from 'expo-router';
import DefectDetail from '../../../components/DefectDetail';

export default function InspectorDefect() {
  const { defectId } = useLocalSearchParams<{ defectId: string }>();
  return <DefectDetail defectId={defectId} allowDelete />;
}
