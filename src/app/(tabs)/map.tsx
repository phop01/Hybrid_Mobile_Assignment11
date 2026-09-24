import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ActivitiesMap } from '@/components/activities-map';
import { ActivityCard } from '@/components/activity-card';
import { Banner, Chip, StateView } from '@/components/ui';
import { Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useDisplayStatus } from '@/hooks/use-display-status';
import { CATEGORIES, CATEGORY_ORDER } from '@/lib/categories';
import { filterActivities, isEnded, type CategoryFilter } from '@/lib/filter-activities';
import { formatUpdatedAt } from '@/lib/format';
import { useActivities } from '@/state/activities-context';
import { useFavorites } from '@/state/favorites-context';

const openActivity = (id: string) => router.push({ pathname: '/activities/[id]', params: { id } });

/**
 * แผนที่รวมกิจกรรม: เห็นว่างานไหนอยู่ใกล้กัน วางแผนไปหลายงานต่อกันได้
 * แสดงเฉพาะงานที่ยังไม่จบ (งานที่จบแล้วไม่มีเหตุผลต้องเดินทางไป)
 * แตะหมุด → การ์ดกิจกรรมด้านล่าง → แตะการ์ดเพื่อดูรายละเอียด
 */
export default function MapScreen() {
  const { activities, status, error, offlineSince, refresh } = useActivities();
  const { isFavorite, toggleFavorite } = useFavorites();
  const statusOf = useDisplayStatus();
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // useMemo จำเป็นที่นี่: แผนที่บนเว็บสร้างใหม่ทั้งแผ่นเมื่อรายการเปลี่ยน ต้องไม่เปลี่ยนทุก render
  const visible = useMemo(
    () => filterActivities(activities.filter((a) => !isEnded(a)), '', category),
    [activities, category],
  );
  const selected = visible.find((a) => a.id === selectedId) ?? null;
  const onSelect = useCallback((id: string | null) => setSelectedId(id), []);

  if (status === 'loading') return <StateView kind="loading" message="กำลังโหลดแผนที่กิจกรรม…" />;
  if (status === 'error') {
    return <StateView kind="error" title="โหลดกิจกรรมไม่สำเร็จ" message={error ?? undefined} actionLabel="ลองใหม่" onAction={refresh} />;
  }

  return (
    <View style={styles.screen}>
      <View style={styles.top}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="ทั้งหมด" selected={category === 'all'} onPress={() => setCategory('all')} />
          {CATEGORY_ORDER.map((c) => (
            <Chip
              key={c}
              label={CATEGORIES[c].label}
              color={CATEGORIES[c].color}
              selected={category === c}
              onPress={() => setCategory(c)}
            />
          ))}
        </ScrollView>
        {offlineSince ? <Banner tone="warning">ออฟไลน์ · ข้อมูลเมื่อ {formatUpdatedAt(offlineSince)}</Banner> : null}
      </View>

      <View style={styles.map}>
        {visible.length > 0 ? (
          <ActivitiesMap activities={visible} selectedId={selected?.id ?? null} onSelect={onSelect} />
        ) : (
          <StateView kind="empty" icon="map-outline" title="ไม่มีกิจกรรมที่กำลังจะมาถึงในประเภทนี้" />
        )}
      </View>

      <View style={styles.bottom}>
        {selected ? (
          <ActivityCard
            activity={selected}
            isFavorite={isFavorite(selected.id)}
            status={statusOf(selected.id)}
            onOpen={openActivity}
            onToggleFavorite={toggleFavorite}
          />
        ) : (
          // แผนที่ใช้กับ screen reader ได้ยาก จึงบอกทางเลือกที่เป็นรายการไว้ด้วย
          <Text style={styles.hint}>
            แตะหมุดเพื่อดูกิจกรรม · {visible.length} กิจกรรมที่กำลังจะมาถึง · ดูแบบรายการได้ที่แท็บกิจกรรม
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  top: { padding: Spacing.md, gap: Spacing.sm, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  chips: { gap: Spacing.sm, paddingVertical: 2 },
  map: { flex: 1, overflow: 'hidden', borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border },
  bottom: { padding: Spacing.md, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  hint: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
