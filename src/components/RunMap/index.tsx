// src/components/RunMap/index.tsx
import React, { useEffect, useRef, useState, useMemo } from 'react';
import type { FeatureCollection } from 'geojson';
import { RPGeometry } from '@/static/run_countries';
import * as polyline from '@mapbox/polyline';
import { wgs84ToGcj02 } from '@/utils/coord';

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
  const heatmapRef = useRef<any>(null);
  const [lightsOn, setLightsOn] = useState(false);
  const [amapReady, setAmapReady] = useState(false);

  const AMAP_KEY = 'aafd2d080cfdafafc41ec39d3ba4a458';

  // 🔑 只加载一次高德 API
  useEffect(() => {
    if ((window as any).AMap) {
      setAmapReady(true);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}`;
    script.onload = () => setAmapReady(true);
    document.head.appendChild(script);

    return () => {
      // 清理脚本（避免重复加载）
      const existing = document.querySelector(`script[src*="webapi.amap.com"]`);
      if (existing) existing.remove();
    };
  }, []);

  // 🗺️ 初始化地图（确保 API + DOM 都 ready）
  const map = useMemo(() => {
    if (!amapReady || !mapRef.current) return null;
    return new (window as any).AMap.Map(mapRef.current, {
      zoom: 10,
      center: [116.4, 39.9],
      viewMode: '2D',
      mapStyle: lightsOn ? 'amap://styles/normal' : 'amap://styles/dark',
    });
  }, [amapReady, mapRef.current, lightsOn]);

  // 🌙 更新地图样式（当日夜切换）
  useEffect(() => {
    if (map) {
      map.setMapStyle(
        lightsOn ? 'amap://styles/normal' : 'amap://styles/dark'
      );
    }
  }, [map, lightsOn]);

  // 🧭 转换轨迹坐标（WGS84 → GCJ02）
  const convertPath = (path: [number, number][]) => {
    return path.map(([lng, lat]) => {
      const [gLat, gLng] = wgs84ToGcj02(lat, lng);
      return [gLng, gLat];
    });
  };

  // 🛤️ 提取并转换轨迹
  const extractAndConvert = () => {
    const tracks: [number, number][][] = [];
    geoData.features.forEach(feature => {
      if (feature.geometry.type === 'LineString') {
        tracks.push(feature.geometry.coordinates as [number, number][]);
      }
    });
    return tracks.map(track => convertPath(track));
  };

  // 🔥 生成热力点数据
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
        } catch (e) {
          console.warn('Polyline decode failed');
        }
      }
      if (lat && lng) {
        const [gLat, gLng] = wgs84ToGcj02(lat, lng);
        points.push({
          lng: gLng,
          lat: gLat,
          count: Math.min(act.distance / 1000, 20),
        });
      }
    });
    return points;
  };

  // 🛤️ 更新轨迹线
  useEffect(() => {
    if (!map) return;

    // 清除旧轨迹
    polylineRefs.current.forEach(p => p.setMap(null));
    polylineRefs.current = [];

    const paths = extractAndConvert();
    paths.forEach(path => {
      const poly = new (window as any).AMap.Polyline({
        path,
        strokeColor: lightsOn ? '#3b82f6' : '#555',
        strokeOpacity: 0.6,
        strokeWeight: 4,
        zIndex: 10,
      });
      map.add(poly);
      polylineRefs.current.push(poly);
    });
  }, [map, geoData, lightsOn]);

  // 🔥 更新热力图（兼容 V2.0）
  useEffect(() => {
    if (!map) return;

    const heatmapPoints = generateHeatmapData();
    if (heatmapPoints.length === 0) return;

    // 清除旧热力图
    if (heatmapRef.current) {
      heatmapRef.current.setMap(null);
      heatmapRef.current = null;
    }

    // 动态加载 Heatmap 插件
    (window as any).AMap.plugin(['AMap.Heatmap'], () => {
      heatmapRef.current = new (window as any).AMap.Heatmap({
        map: map,
        radius: 25,
        opacity: [0, 0.8],
        gradient: {
          0.4: 'blue',
          0.6: 'cyan',
          0.7: 'lime',
          0.8: 'yellow',
          1.0: 'red',
        },
         heatmapPoints,
        max: 20,
      });
    });
  }, [map, activities, thisYear]);

  // 💡 切换日夜模式
  const toggleLights = () => setLightsOn(!lightsOn);

  // 📅 切换年份（示例逻辑）
  const handleYearClick = () => {
    if (changeYear) {
      const nextYear = thisYear === '2026' ? '2025' : '2026';
      changeYear(nextYear);
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '600px' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* 年份标签 */}
      <div
        onClick={changeYear ? handleYearClick : undefined}
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'rgba(255,255,255,0.8)',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '14px',
          fontWeight: 'bold',
          zIndex: 10,
          cursor: changeYear ? 'pointer' : 'default',
        }}
      >
        {thisYear}
      </div>

      {/* 日夜切换按钮 */}
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
          zIndex: 10,
          fontSize: '12px',
          fontWeight: 'bold',
        }}
      >
        {lightsOn ? '💡 Turn off light' : '🌙 Turn on light'}
      </button>
    </div>
  );
};

export default RunMap;