// react-native-maps ใช้บนเว็บไม่ได้ จึงแสดงแผนที่ OpenStreetMap ผ่าน Leaflet ใน iframe
// เหตุผลที่เลือก OpenStreetMap: ไม่ต้องมี API key อาจารย์ clone แล้วเปิดดูได้ทันที

import { StyleSheet, View } from 'react-native';

import { Colors, Radius } from '@/constants/theme';

import type { ActivityMapProps } from './activity-map';

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

function buildHtml({ venue, title, user }: ActivityMapProps) {
  const userJs = user
    ? `L.circleMarker([${user.latitude}, ${user.longitude}], { radius: 8, color: '#157F3D', fillOpacity: 0.9 })
         .addTo(map).bindTooltip('ตำแหน่งของคุณ');
       map.fitBounds(L.latLngBounds([[${venue.latitude}, ${venue.longitude}], [${user.latitude}, ${user.longitude}]]).pad(0.3));`
    : '';
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;margin:0}</style></head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map = L.map('map').setView([${venue.latitude}, ${venue.longitude}], 16);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  L.circle([${venue.latitude}, ${venue.longitude}], { radius: ${venue.radiusM}, color: '#3F3CBB', fillOpacity: 0.15 }).addTo(map);
  L.marker([${venue.latitude}, ${venue.longitude}]).addTo(map).bindPopup('${escapeHtml(title)}<br>${escapeHtml(venue.name)}');
  ${userJs}
</script></body></html>`;
}

export function ActivityMap(props: ActivityMapProps) {
  const { venue, height = 220 } = props;
  return (
    <View style={[styles.wrap, { height }]} accessibilityLabel={`แผนที่ ${venue.name} รัศมีเช็กอิน ${venue.radiusM} เมตร`}>
      <iframe
        title={`แผนที่ ${venue.name}`}
        srcDoc={buildHtml(props)}
        style={{ border: 0, width: '100%', height: '100%' }}
        sandbox="allow-scripts"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: Radius.lg, overflow: 'hidden', backgroundColor: Colors.border },
});
