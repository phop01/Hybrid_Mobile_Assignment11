import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text } from 'react-native';

import { Banner, Button, Card, Screen, SectionTitle, TextField } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { setPostLoginRedirect, useSession } from '@/state/session-context';

// ปลายทางหลัง login ต้องเป็น path ภายในแอปเท่านั้น (กันลิงก์พาออกไปเว็บภายนอก)
function safeNext(next: unknown): string | null {
  const value = Array.isArray(next) ? next[0] : next;
  return typeof value === 'string' && /^\/[\w\-/[\]]*$/.test(value) ? value : null;
}

export default function LoginScreen() {
  const { signIn } = useSession();
  const params = useLocalSearchParams<{ next?: string }>();
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (submitting) return;
    if (!/^\d{10}$/.test(studentId) || password.length === 0) {
      setError('กรอกรหัสนักศึกษา 10 หลักและรหัสผ่าน');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // จำหน้าที่ผู้ใช้ตั้งใจจะไป (เช่น ฟอร์มลงทะเบียน) แล้วพาไปหลัง login สำเร็จ
      // ให้ root layout เป็นคนพาไป เพราะหน้า login จะถูกปิดอัตโนมัติเมื่อ Stack.Protected เปลี่ยน
      setPostLoginRedirect(safeNext(params.next));
      await signIn(studentId, password);
      // ไม่เก็บรหัสผ่านไว้ใน state หลังส่งแล้ว
      setPassword('');
    } catch (e) {
      setPostLoginRedirect(null);
      setError(e instanceof Error ? e.message : 'เข้าสู่ระบบไม่สำเร็จ');
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Card>
          <SectionTitle>เข้าสู่ระบบ CampusPass</SectionTitle>
          <Text style={styles.muted}>ใช้รหัสนักศึกษาเพื่อลงทะเบียน เช็กอิน และนับจำนวนกิจกรรมที่เข้าร่วม</Text>
          <TextField
            label="รหัสนักศึกษา"
            value={studentId}
            onChangeText={(t) => setStudentId(t.replace(/\D/g, '').slice(0, 10))}
            keyboardType="number-pad"
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            placeholder="เช่น 6601234567"
          />
          <TextField
            label="รหัสผ่าน"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          {error ? <Banner tone="danger">{error}</Banner> : null}
          <Button title={submitting ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'} onPress={submit} loading={submitting} />
        </Card>

        <Banner tone="info" icon="key-outline">
          บัญชีทดสอบ: รหัสนักศึกษา 6601234567 รหัสผ่าน campus1234 (ข้อมูลตัวอย่าง ไม่ใช่บัญชีจริง)
        </Banner>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  muted: { fontSize: 14, color: Colors.textMuted, lineHeight: 20, marginBottom: Spacing.xs },
});
