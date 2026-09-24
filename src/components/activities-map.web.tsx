// บนเว็บใช้ Leaflet + OpenStreetMap ใน iframe เหมือน activity-map.web.tsx
// iframe ถูก sandbox จึงส่งผลการแตะหมุดกลับมาด้วย postMessage แล้วตรวจว่ามาจาก iframe ของเราจริง

import { useEffect, useMemo, useRef } from 'react';

import { CATEGORIES } from '@/lib/categories';
import type { Activity } from '@/types/models';

import type { ActivitiesMapProps } from './activities-map';

const MESSAGE_TYPE = 'activities-map:select';

function buildHtml(activities: Activity[]) {
  // JSON.stringify + แทน "<" กันข้อความในชื่อกิจกรรมปิดแท็ก <script> ก่อนเวลา
  const points = JSON.stringify(
    activities.map((a) => ({
      id: a.id,
      lat: a.location.latitude,
      lng: a.location.longitude,
      color: CATEGORIES[a.category].color,
      title: a.title,
      place: a.location.name,
    })),
  ).replace(/</g, '\\u003c');

  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>html,body,#map{height:100%;margin:0}</style></head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var points = ${points};
  var map = L.map('map');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  var send = function (id) { parent.postMessage({ type: '${MESSAGE_TYPE}', id: id }, '*'); };
  var bounds = [];
  points.forEach(function (p) {
    var label = document.createElement('span');
    label.textContent = p.title; // textContent ไม่ตีความเป็น HTML
    L.circleMarker([p.lat, p.lng], { radius: 11, color: '#fff', weight: 2, fillColor: p.color, fillOpacity: 1 })
      .addTo(map)
      .bindTooltip(label)
      .on('click', function (e) { L.DomEvent.stopPropagation(e); send(p.id); });
    bounds.push([p.lat, p.lng]);
  });
  map.on('click', function () { send(null); });
  var fit = function () {
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    else map.setView([17.8066, 102.7463], 15);
  };
  fit();
  // ขนาดหน้าต่างเปลี่ยน (หมุนจอ/ย่อหน้าต่าง) → จัดมุมมองใหม่ให้เห็นทุกหมุด
  window.addEventListener('resize', function () { map.invalidateSize(); fit(); });
</script></body></html>`;
}

export function ActivitiesMap({ activities, onSelect }: ActivitiesMapProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  // สร้าง HTML ใหม่เฉพาะตอนรายการเปลี่ยน ไม่งั้นแผนที่โหลดใหม่ทุกครั้งที่เลือกหมุด
  const html = useMemo(() => buildHtml(activities), [activities]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // รับเฉพาะข้อความจาก iframe แผนที่ของเรา และรูปแบบตรงตามที่คาด
      if (event.source !== frameRef.current?.contentWindow) return;
      const data = event.data as { type?: unknown; id?: unknown };
      if (data?.type !== MESSAGE_TYPE) return;
      if (data.id === null) onSelect(null);
      else if (typeof data.id === 'string' && activities.some((a) => a.id === data.id)) onSelect(data.id);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [activities, onSelect]);

  return (
    <iframe
      ref={frameRef}
      title={`แผนที่กิจกรรม ${activities.length} รายการ`}
      srcDoc={html}
      style={{ border: 0, width: '100%', height: '100%', position: 'absolute', inset: 0 }}
      sandbox="allow-scripts"
    />
  );
}
