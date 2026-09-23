import { Redirect } from 'expo-router';

// หน้าแรกของแอปคือรายการกิจกรรม
export default function Index() {
  return <Redirect href="/activities" />;
}
