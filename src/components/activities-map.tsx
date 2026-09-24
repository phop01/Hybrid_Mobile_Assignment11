import { StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { CATEGORIES } from '@/lib/categories';
import { regionFor } from '@/lib/geo';
import type { Activity } from '@/types/models';

export type ActivitiesMapProps = {
  activities: Activity[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
};

/**
 * แผนที่รวมกิจกรรม: หมุดสีตามประเภท แตะหมุดเพื่อเลือก แตะพื้นที่ว่างเพื่อยกเลิก
 * ไม่ขอสิทธิ์ตำแหน่ง เพราะแค่ดูว่างานอยู่ตรงไหน ยังไม่ได้ใช้ตำแหน่งผู้ใช้
 */
export function ActivitiesMap({ activities, selectedId, onSelect }: ActivitiesMapProps) {
  const region = regionFor(activities.map((a) => a.location));
  return (
    <MapView
      style={StyleSheet.absoluteFill}
      initialRegion={region ?? undefined}
      onPress={() => onSelect(null)}
      accessibilityLabel={`แผนที่กิจกรรม ${activities.length} รายการ`}>
      {activities.map((a) => (
        <Marker
          key={a.id}
          coordinate={a.location}
          pinColor={CATEGORIES[a.category].color}
          title={a.title}
          description={a.location.name}
          // หมุดไม่เปลี่ยนหน้าตาหลังวาด ปิดการติดตามเพื่อไม่ให้วาดใหม่ทุกเฟรม (ประสิทธิภาพ)
          tracksViewChanges={false}
          opacity={selectedId && selectedId !== a.id ? 0.6 : 1}
          onPress={(e) => {
            e.stopPropagation();
            onSelect(a.id);
          }}
        />
      ))}
    </MapView>
  );
}
