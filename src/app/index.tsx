import { Redirect } from 'expo-router';
import { useAppReady } from '@/contexts/AppReadyContext';

export default function Index() {
  const isReady = useAppReady();
  return <Redirect href={isReady ? '/journal' : '/model-hub'} />;
}
