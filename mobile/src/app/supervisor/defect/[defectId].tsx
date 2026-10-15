// Supervisor's defect screen: read-only.
import { useLocalSearchParams } from 'expo-router';
import DefectDetail from '../../../components/DefectDetail';

export default function SupervisorDefect() {
  const { defectId } = useLocalSearchParams<{ defectId: string }>();
  return <DefectDetail defectId={defectId} allowDelete={false} />;
}
