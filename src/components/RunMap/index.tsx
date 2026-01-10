// src/components/RunMap/index.tsx
import React, { useEffect, useRef, useState } from 'react';
import type { FeatureCollection } from 'geojson';
import { RPGeometry } from '@/static/run_countries';

interface IRunMapProps {
  title: string;
  geoData: FeatureCollection<RPGeometry>;
  thisYear: string;
  activities: Array<{
    start_latlng?: [number, number];
    distance: number;
    start_date: string;
  }>;
}

const RunMap = ({
  title,
  geoData,
  thisYear,
  activities,
}: IRunMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const heatmapRef = useRef<any>(null);
  const [lightsOn, setLightsOn] = useState(false); // 日夜模式状态

  const AMAP_KEY = 'aafd2d080cfdafafc41ec39d3ba4a458';

  // 提取轨迹坐标
  const extractCoordinates = (geoData: FeatureCollection<RPGeometry>) => {
    const coords: [number, number][][] = [];
    geoData.features.forEach((feature) => {
      if (feature.geometry.type === 'LineString') {
        coords.push(feature.geometry.coordinates as [number, number][]);
      }
    });
    return coords;
  };

  // 生成热力图数据（仅当前年份）
  const generateHeatmapData = () => {
    const currentYear = new Date().getFullYear();
    const points: { lng: number; lat: number; count: number }[] = [];

    activities.forEach((act) => {
      if (!act.start_latlng) return;
      const [lat, lng] = act.start_latlng;
      const actYear = new Date(act.start_date).getFullYear();
      if (actYear === Number(thisYear)) {
        points.push({
          lng,
          lat,
          count: Math.min(act.distance / 1000, 20), // 距离转权重（km）
        });
      }
    });
    return points;
  };

  useEffect(() => {
    if (!mapRef.current || !AMAP_KEY) return;

    const scriptId = 'amap-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      // 注意：加载 Heatmap 插件
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}&plugin=AMap.Heatmap`;
      script.onload = initMap;
      document.head.appendChild(script);
    } else {
      initMap();
    }

    function initMap() {
      if (mapInstanceRef.current) return;

      const defaultCenter: [number, number] = [116.4, 39.9];
      let allPoints: [number, number][] = [];

      const tracks = extractCoordinates(geoData);
      tracks.forEach(track => allPoints = allPoints.concat(track));

      let center = defaultCenter;
      let zoom = 10;
      if (allPoints.length > 0) {
        const lats = allPoints.map(p => p[1]);
        const lngs = allPoints.map(p => p[0]);
        center = [(Math.min(...lngs) + Math.max(...lngs)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
        const maxDiff = Math.max(Math.max(...lngs) - Math.min(...lngs), Math.max(...lats) - Math.min(...lats));
        zoom = maxDiff < 0.01 ? 16 : maxDiff < 0.1 ? 13 : maxDiff < 1 ? 10 : 7;
      }

      const map = new (window as any).AMap.Map(mapRef.current, {
        zoom,
        center,
        viewMode: '2D',
      });
      mapInstanceRef.current = map;

      // 绘制轨迹线
      tracks.forEach(points => {
        const polyline = new (window as any).AMap.Polyline({
          path: points,
          strokeColor: lightsOn ? '#3b82f6' : '#555',
          strokeOpacity: 0.6,
          strokeWeight: 4,
        });
        map.add(polyline);
      });

      // 绘制热力图
      const heatmapPoints = generateHeatmapData();
      if (heatmapPoints.length > 0) {
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
    // 重新初始化地图（简单方案）
    if (mapInstanceRef.current) {
      mapInstanceRef.current.destroy();
      mapInstanceRef.current = null;
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '600px' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      
      {/* 标题 */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        background: 'rgba(255,255,255,0.8)',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '14px',
        zIndex: 10
      }}>
        {title}
      </div>

      {/* 年份 */}
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        background: 'rgba(255,255,255,0.8)',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '14px',
        zIndex: 10
      }}>
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
          fontSize: '12px'
        }}
      >
        {lightsOn ? '💡 Turn off light' : '🌙 Turn on light'}
      </button>
    </div>
  );
};

export default RunMap;