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
  changeYear?: (year: string) => void; // 可选：支持点击年份切换
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

  // 🔑 替换为你的高德 KEY
  const AMAP_KEY = 'aafd2d080cfdafafc41ec39d3ba4a458';

  // 提取轨迹坐标（不转换坐标系）
  const extractCoordinates = (geoData: FeatureCollection<RPGeometry>) => {
    const coords: [number, number][][] = [];
    geoData.features.forEach((feature) => {
      if (feature.geometry.type === 'LineString') {
        coords.push(feature.geometry.coordinates as [number, number][]);
      }
    });
    return coords;
  };

  // 从 polyline 或 start_latlng 提取起点
  const getStartPoint = (act: any): [number, number] | null => {
    if (act.start_latlng) {
      return act.start_latlng;
    }
    if (act.summary_polyline) {
      try {
        const decoded = polyline.decode(act.summary_polyline);
        if (decoded.length > 0) {
          return [decoded[0][0], decoded[0][1]]; // [lat, lng]
        }
      } catch (e) {
        console.warn('Polyline decode failed:', act.summary_polyline);
      }
    }
    return null;
  };

  // 生成热力图数据（仅当前年份）
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
          count: Math.min(act.distance / 1000, 20), // km, max 20
        });
      }
    });
    return points;
  };

  // 初始化地图
  const initMap = () => {
    if (mapInstanceRef.current) return;

    const tracks = extractCoordinates(geoData);
    let allPoints: [number, number][] = tracks.flat();

    let center: [number, number] = [116.4, 39.9]; // 默认北京
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
      mapStyle: lightsOn ? 'amap://styles/normal' : 'amap://styles/dark', // 日夜底图
    });
    mapInstanceRef.current = map;

    // 清除旧轨迹
    polylineRefs.current.forEach(poly => poly.setMap(null));
    polylineRefs.current = [];

    // 绘制新轨迹
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

    // 绘制热力图
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
        data: heatmapPoints,
        max: 20
      });
      heatmapRef.current = heatmap;
    }
  };

  // 加载高德 API
  useEffect(() => {
    if (!mapRef.current || !AMAP_KEY) return;

    const scriptId = 'amap-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}&plugin=AMap.Heatmap`;
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

  // 切换日夜模式
  const toggleLights = () => {
    setLightsOn(!lightsOn);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.destroy();
      mapInstanceRef.current = null;
    }
  };

  // 点击年份切换（如果父组件提供了 changeYear）
  const handleYearClick = () => {
    if (changeYear) {
      // 这里可以弹出年份选择器，或简单循环
      // 为简化，此处仅提示（实际逻辑由父组件控制）
      alert('年份切换功能需在父组件实现');
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '600px' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      
      {/* 年份标签（可点击） */}
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