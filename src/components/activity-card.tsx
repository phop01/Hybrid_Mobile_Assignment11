import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, MinTouch, Radius, Spacing } from '@/constants/theme';
import { CATEGORIES } from '@/lib/categories';
import { isEnded, seatsLeft } from '@/lib/filter-activities';
import { formatDateRange } from '@/lib/format';
import type { Activity } from '@/types/models';

import { StatusBadge, type DisplayStatus } from './status-badge';

type ActivityCardProps = {
  activity: Activity;
  isFavorite: boolean;
  onOpen: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  /** สถานะการลงทะเบียนของผู้ใช้ (ถ้ามี) */
  status?: DisplayStatus;
};

/**
 * การ์ดกิจกรรม ใช้ซ้ำในหน้ากิจกรรม บันทึกไว้ และของฉัน
 * รับข้อมูลผ่าน props อย่างเดียว ไม่ดึงข้อมูลเอง จึงไม่ผูกกับว่าข้อมูลมาจาก API หรือ cache
 */
export function ActivityCard({ activity, isFavorite, onOpen, onToggleFavorite, status }: ActivityCardProps) {
  const category = CATEGORIES[activity.category];
  const ended = isEnded(activity);
  const left = seatsLeft(activity);

  let seatLabel = `เหลือ ${left} ที่`;
  let seatColor: string = Colors.textMuted;
  if (ended) {
    seatLabel = 'จบแล้ว';
  } else if (left === 0) {
    seatLabel = 'เต็มแล้ว';
    seatColor = Colors.danger;
  } else if (left <= activity.capacity * 0.1) {
    seatLabel = `ใกล้เต็ม · เหลือ ${left} ที่`;
    seatColor = Colors.warning;
  }

  return (
    <View style={[styles.card, ended && styles.ended]}>
    <Pressable
      onPress={() => onOpen(activity.id)}
      accessibilityRole="button"
      accessibilityLabel={`${activity.title}, ${category.label}, ${formatDateRange(activity.startsAt, activity.endsAt)}, ${activity.location.name}, ${seatLabel}`}
      accessibilityHint="เปิดรายละเอียดกิจกรรม"
      style={({ pressed }) => [styles.main, pressed && { opacity: 0.85 }]}>
      <View style={[styles.stripe, { backgroundColor: category.color }]} />
      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={[styles.category, { backgroundColor: category.soft }]}>
            <Ionicons name={category.icon} size={14} color={category.color} />
            <Text style={[styles.categoryText, { color: category.color }]}>{category.label}</Text>
          </View>
          {status ? <StatusBadge status={status} /> : null}
        </View>

        <Text style={styles.title}>{activity.title}</Text>

        <View style={styles.meta}>
          <Ionicons name="time-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.metaText}>{formatDateRange(activity.startsAt, activity.endsAt)}</Text>
        </View>
        <View style={styles.meta}>
          <Ionicons name="location-outline" size={16} color={Colors.textMuted} />
          <Text style={styles.metaText}>{activity.location.name}</Text>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.seats, { color: seatColor }]}>{seatLabel}</Text>
          <View style={styles.meta}>
            <Ionicons
              name={activity.checkInMethod === 'paper' ? 'document-text-outline' : 'phone-portrait-outline'}
              size={14}
              color={Colors.textMuted}
            />
            <Text style={styles.method}>{activity.checkInMethod === 'paper' ? 'เซ็นชื่อกระดาษ' : 'เช็กอินในแอป'}</Text>
          </View>
        </View>
      </View>
    </Pressable>
      {/* ปุ่มดาวแยกจากปุ่มการ์ด (ปุ่มซ้อนปุ่มใช้ไม่ได้บนเว็บและ screen reader อ่านสับสน) */}
      <Pressable
        onPress={() => onToggleFavorite(activity.id)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={isFavorite ? `นำ ${activity.title} ออกจากที่บันทึกไว้` : `บันทึก ${activity.title} ไว้ดูทีหลัง`}
        accessibilityState={{ selected: isFavorite }}
        style={styles.star}>
        <Ionicons name={isFavorite ? 'star' : 'star-outline'} size={24} color={isFavorite ? Colors.star : Colors.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  main: { flex: 1, flexDirection: 'row' },
  ended: { opacity: 0.65 },
  stripe: { width: 6 },
  body: { flex: 1, padding: Spacing.lg, gap: Spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap', paddingRight: MinTouch },
  category: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: Radius.pill },
  categoryText: { fontSize: 12, fontWeight: '700' },
  star: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: MinTouch,
    height: MinTouch,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '700', color: Colors.text, lineHeight: 24 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { flex: 1, fontSize: 14, color: Colors.textMuted },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, gap: Spacing.sm, flexWrap: 'wrap' },
  seats: { fontSize: 14, fontWeight: '700' },
  method: { fontSize: 12, color: Colors.textMuted },
});
