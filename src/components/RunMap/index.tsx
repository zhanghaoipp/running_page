// src/components/RunMap/index.tsx
import React, { useEffect, useRef, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { RPGeometry } from '@/static/run_countries';
import * as polyline from '@mapbox/polyline';

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
  const mapInstanceRef = useRef<any>(null);
  const polylineRefs = useRef<any[]>([]);
  const heatmapRef = useRef<any>(null);
  const [lightsOn, setLightsOn] = useState(false);

  const AMAP_KEY = 'aafd2d080cfdafafc41ec39d3ba4a458'; // ✅ 确保无多余空格

  const extractCoordinates = (geoData: FeatureCollection<RPGeometry>) => {
    const coords: [number, number][][] = [];
    geoData.features.forEach((feature) => {
      if (feature.geometry.type === 'LineString') {
        coords.push(feature.geometry.coordinates as [number, number][]);
      }
    });
    return coords;
  };

  const getStartPoint = (act: any): [number, number] | null => {
    if (act.start_latlng) {
      return act.start_latlng;
    }
    if (act.summary_polyline) {
      try {
        const decoded = polyline.decode(act.summary_polyline);
        if (decoded.length > 0) {
          return [decoded[0][0], decoded[0][1]];
        }
      } catch (e) {
        console.warn('Polyline decode failed:', act.summary_polyline);
      }
    }
    return null;
  };

  const generateHeatmapData = () => {
    const points: { lng: number; lat: number; count: number }[] = [];
    const currentYearNum = Number(thisYear);

    activities.forEach((act) => {
      if (!act.start_date || act.distance <= 0) return;
      const actYear = new Date(act.start_date).getFullYear();
      if (actYear !== currentYearNum) return;

      const startPoint = getStartPoint(act);
      if (startPoint) {
        const [lat, lng] = startPoint;
        points.push({
          lng,
          lat,
          count: Math.min(act.distance / 1000, 20),
        });
      }
    });
    return points;
  };

  const initMap = () => {
    if (mapInstanceRef.current) return;

    const tracks = extractCoordinates(geoData);
    let allPoints: [number, number][] = tracks.flat();

    let center: [number, number] = [116.4, 39.9];
    let zoom = 10;
    if (allPoints.length > 0) {
      const lngs = allPoints.map(p => p[0]);
      const lats = allPoints.map(p => p[1]);
      center = [
        (Math.min(...lngs) + Math.max(...lngs)) / 2,
        (Math.min(...lats) + Math.max(...lats)) / 2
      ];
      const maxDiff = Math.max(Math.max(...lngs) - Math.min(...lngs), Math.max(...lats) - Math.min(...lats));
      zoom = maxDiff < 0.01 ? 16 : maxDiff < 0.1 ? 13 : maxDiff < 1 ? 10 : 7;
    }

    const map = new (window as any).AMap.Map(mapRef.current, {
      zoom,
      center,
      viewMode: '2D',
      mapStyle: lightsOn ? 'amap://styles/normal' : 'amap://styles/dark',
    });
    mapInstanceRef.current = map;

    polylineRefs.current.forEach(poly => poly.setMap(null));
    polylineRefs.current = [];

    tracks.forEach(points => {
      const polyline = new (window as any).AMap.Polyline({
        path: points,
        strokeColor: lightsOn ? '#3b82f6' : '#555',
        strokeOpacity: 0.6,
        strokeWeight: 4,
        zIndex: 10,
      });
      map.add(polyline);
      polylineRefs.current.push(polyline);
    });

    // ✅ 关键修复：使用 AMap.plugin 动态加载 Heatmap
    (window as any).AMap.plugin(['AMap.Heatmap'], () => {
      const heatmapPoints = generateHeatmapData();
      if (heatmapPoints.length > 0) {
        if (heatmapRef.current) {
          heatmapRef.current.setMap(null);
        }
        const heatmap = new (window as any).AMap.Heatmap(map, {
          radius: 25,
          opacity: [0, 0.8],
          gradient: {
            0.4: 'blue',
            0.6: 'cyan',
            0.7: 'lime',
            0.8: 'yellow',
            1.0: 'red'
          }
        });
        heatmap.setDataSet({
           heatmapPoints,
          max: 20
        });
        heatmapRef.current = heatmap;
      }
    });
  };

  useEffect(() => {
    if (!mapRef.current || !AMAP_KEY) return;

    const scriptId = 'amap-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      // 🔥 修复 1：移除 &plugin=AMap.Heatmap（无效）
      // 🔥 修复 2：确保 Key 无空格
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}`;
      script.onload = initMap;
      document.head.appendChild(script);
    } else {
      initMap();
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, [geoData, activities, thisYear, lightsOn, AMAP_KEY]);

  const toggleLights = () => {
    setLightsOn(!lightsOn);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.destroy();
      mapInstanceRef.current = null;
    }
  };

  const handleYearClick = () => {
    if (changeYear) {
      changeYear(thisYear === '2026' ? '2025' : '2026'); // 示例切换逻辑
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
          fontWeight: 'bold'
        }}
      >
        {lightsOn ? '💡 Turn off light' : '🌙 Turn on light'}
      </button>
    </div>
  );
};

export default RunMap;