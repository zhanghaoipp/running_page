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
  availableYears: string[];
  changeYear?: (year: string) => void;
  animationTrigger?: number;
}

const RunMap = ({
  title,
  geoData,
  thisYear,
  activities,
  availableYears,
  changeYear,
  animationTrigger,
}: IRunMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [lightsOn, setLightsOn] = useState(false);
  const [amapReady, setAmapReady] = useState(false);

  const AMAP_KEY = 'aafd2d080cfdafafc41ec39d3ba4a458';

  // 🔑 加载高德 API
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
      const existing = document.querySelector(`script[src*="webapi.amap.com"]`);
      if (existing) existing.remove();
    };
  }, []);

  const map = useMemo(() => {
    if (!amapReady || !mapRef.current) return null;
    return new (window as any).AMap.Map(mapRef.current, {
      zoom: 10,
      center: [116.4, 39.9],
      viewMode: '2D',
      mapStyle: 'amap://styles/dark',
    });
  }, [amapReady, mapRef.current]);

  useEffect(() => {
    if (map) {
      map.setMapStyle(lightsOn ? 'amap://styles/normal' : 'amap://styles/dark');
    }
  }, [map, lightsOn]);

  const convertPath = (path: [number, number][]) => {
    return path.map(([lng, lat]) => {
      const [gLat, gLng] = wgs84ToGcj02(lat, lng);
      return [gLng, gLat];
    });
  };

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
        points.push({ lng: gLng, lat: gLat, count: Math.min(act.distance / 1000, 20) });
      }
    });
    return points;
  };

  // 🗺️ 核心：更新地图 + 自动聚焦（使用转换后坐标）
  useEffect(() => {
    if (!map || !geoData) return;

    map.clearMap();

    const tracks: [number, number][][] = [];
    (geoData.features ?? []).forEach(feature => {
      if (feature?.geometry?.type === 'LineString') {
        tracks.push(feature.geometry.coordinates as [number, number][]);
      }
    });

    // ✅ 先转换坐标，再用于绘制和计算边界
    const paths = tracks.map(track => convertPath(track));
    paths.forEach(path => {
      const poly = new (window as any).AMap.Polyline({
        path,
        strokeColor: lightsOn ? '#3b82f6' : '#FFD700', // 白天蓝，夜晚黄
        strokeOpacity: lightsOn ? 0.5 : 0.55,          // 半透明
        strokeWeight: 4,
        zIndex: 10,
      });
      map.add(poly);
    });

    // 🔥 热力图
    const heatmapPoints = generateHeatmapData();
    if (heatmapPoints.length > 0) {
      (window as any).AMap.plugin(['AMap.Heatmap'], () => {
        new (window as any).AMap.Heatmap({
          map: map,
           heatmapPoints,
          max: 20,
          radius: 25,
          opacity: [0, 0.8],
          gradient: {
            0.4: 'blue',
            0.6: 'cyan',
            0.7: 'lime',
            0.8: 'yellow',
            1.0: 'red',
          },
        });
      });
    }

    // 👇 自动聚焦：使用转换后的坐标（GCJ-02）
    if (paths.length > 0) {
      let allLngs: number[] = [];
      let allLats: number[] = [];

      paths.forEach(path => {
        path.forEach(([lng, lat]) => {
          // 过滤明显无效坐标（可选）
          if (lng > 70 && lng < 140 && lat > 10 && lat < 55) {
            allLngs.push(lng);
            allLats.push(lat);
          }
        });
      });

      if (allLngs.length > 0) {
        const minLng = Math.min(...allLngs);
        const maxLng = Math.max(...allLngs);
        const minLat = Math.min(...allLats);
        const maxLat = Math.max(...allLats);

        // 处理单点轨迹
        const delta = (maxLng - minLng < 1e-6 || maxLat - minLat < 1e-6) 
          ? 0.001 
          : 0;

        const bounds = new (window as any).AMap.Bounds(
          [minLng - delta, minLat - delta],
          [maxLng + delta, maxLat + delta]
        );

        map.setBounds(bounds, {
          padding: [60, 60, 60, 60],
          maxZoom: 16,
          animate: true,
        });
      }
    }
  }, [map, geoData, lightsOn, activities, thisYear, animationTrigger]);

  const toggleLights = () => setLightsOn(!lightsOn);

  return (
    <div style={{ position: 'relative', width: '100%', height: '600px' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {/* 年份按钮 */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          display: 'flex',
          gap: '8px',
          zIndex: 10,
        }}
      >
        {availableYears.map(year => (
          <button
            key={year}
            onClick={() => changeYear && changeYear(year)}
            style={{
              background: thisYear === year ? '#3b82f6' : 'rgba(255,255,255,0.8)',
              color: thisYear === year ? 'white' : 'black',
              border: 'none',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
            }}
          >
            {year}
          </button>
        ))}
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