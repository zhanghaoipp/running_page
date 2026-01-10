// src/components/RunMap/index.tsx
import React, { useEffect, useRef, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { RPGeometry } from '@/static/run_countries';
import * as polyline from '@mapbox/polyline';

// ✅ 正确导入 hooks
import { useAmap } from '@/hooks/useAmap';
import { useHeatmap } from '@/hooks/useHeatmap';
import { useGCJ02 } from '@/hooks/useGCJ02';
import { wgs84ToGcj02 } from '@/utils/coord'; // ✅ 导入坐标转换

interface IRunMapProps {
  title: string;
  geoData: FeatureCollection<RPGeometry>;
  thisYear: string;
  activities: Array<{
    start_latlng?: [number, number];
    distance: number;
    start_date: string;
    summary_polyline?: string;
  }>;
  changeYear?: (year: string) => void;
}

const RunMap = ({
  title,
  geoData,
  thisYear,
  activities,
  changeYear,
}: IRunMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const polylineRefs = useRef<any[]>([]);
  const [lightsOn, setLightsOn] = useState(false);

  const AMAP_KEY = 'aafd2d080cfdafafc41ec39d3ba4a458';

  // ✅ 加载高德 API（无空格！）
  useEffect(() => {
    if ((window as any).AMap) return;

    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}`; // ✅ 修复空格
    document.head.appendChild(script);

    return () => {
      // 清理脚本（可选）
      const existing = document.getElementById('amap-script');
      if (existing) existing.remove();
    };
  }, []);

  // ✅ 初始化地图（只两个参数）
  const map = useAmap(mapRef.current, {
    zoom: 10,
    center: [116.4, 39.9],
    mapStyle: lightsOn ? 'amap://styles/normal' : 'amap://styles/dark',
    viewMode: '2D',
  });

  // 更新地图样式（当日夜模式切换时）
  useEffect(() => {
    if (map) {
      map.setMapStyle(
        lightsOn ? 'amap://styles/normal' : 'amap://styles/dark'
      );
    }
  }, [map, lightsOn]);

  const { convertPath } = useGCJ02();
  const { updateHeatmap } = useHeatmap(map);

  // 提取并转换轨迹
  const extractAndConvert = () => {
    const tracks: [number, number][][] = [];
    geoData.features.forEach(feature => {
      if (feature.geometry.type === 'LineString') {
        tracks.push(feature.geometry.coordinates as [number, number][]);
      }
    });
    return tracks.map(track => convertPath(track));
  };

  // 生成热力点
  const generateHeatmapData = () => {
    const points: { lng: number; lat: number; count: number }[] = [];
    const yearNum = Number(thisYear);
    activities.forEach(act => {
      if (!act.start_date || act.distance <= 0) return;
      const actYear = new Date(act.start_date).getFullYear();
      if (actYear !== yearNum) return;

      let lat, lng;
      if (act.start_latlng) {
        [lat, lng] = act.start_latlng;
      } else if (act.summary_polyline) {
        try {
          const decoded = polyline.decode(act.summary_polyline);
          if (decoded.length > 0) {
            [lat, lng] = decoded[0];
          }
        } catch (e) {}
      }
      if (lat && lng) {
        const [gLat, gLng] = wgs84ToGcj02(lat, lng);
        points.push({ lng: gLng, lat: gLat, count: Math.min(act.distance / 1000, 20) });
      }
    });
    return points;
  };

  // 更新轨迹
  useEffect(() => {
    if (!map) return;

    polylineRefs.current.forEach(p => p.setMap(null));
    polylineRefs.current = [];

    const paths = extractAndConvert();
    paths.forEach(path => {
      const poly = new (window as any).AMap.Polyline({
        path,
        strokeColor: lightsOn ? '#3b82f6' : '#555',
        strokeOpacity: 0.6,
        strokeWeight: 4,
      });
      map.add(poly);
      polylineRefs.current.push(poly);
    });
  }, [map, geoData, lightsOn]);

  // 更新热力图
  useEffect(() => {
    if (map) {
      updateHeatmap(generateHeatmapData());
    }
  }, [map, activities, thisYear]);

  const toggleLights = () => setLightsOn(!lightsOn);

  return (
    <div style={{ position: 'relative', width: '100%', height: '600px' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      
      <div
        onClick={() => changeYear && changeYear(thisYear === '2026' ? '2025' : '2026')}
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'rgba(255,255,255,0.8)',
          padding: '4px 8px',
          borderRadius: '4px',
          fontWeight: 'bold',
          cursor: 'pointer',
        }}
      >
        {thisYear}
      </div>

      <button
        onClick={toggleLights}
        style={{
          position: 'absolute',
          bottom: '10px',
          right: '10px',
          background: lightsOn ? '#fbbf24' : '#374151',
          color: 'white',
          border: 'none',
          padding: '6px 12px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 'bold',
        }}
      >
        {lightsOn ? '💡 Turn off light' : '🌙 Turn on light'}
      </button>
    </div>
  );
};

export default RunMap;