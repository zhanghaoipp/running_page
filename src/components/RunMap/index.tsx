// src/components/RunMap/index.tsx
import React, { useEffect, useRef } from 'react';
import type { FeatureCollection } from 'geojson';
import { RPGeometry } from '@/static/run_countries';
import styles from './style.module.css';

interface IRunMapProps {
  title: string;
  geoData: FeatureCollection<RPGeometry>;
  thisYear: string;
  // 其他 props 在高德方案中暂不使用，但保留接口兼容
  viewState?: any;
  setViewState?: any;
  changeYear?: (year: string) => void;
  animationTrigger?: number;
}

const RunMap = ({
  title,
  geoData,
  thisYear,
}: IRunMapProps) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  // 高德 Key（请替换为你自己的）
  const AMAP_KEY = 'aafd2d080cfdafafc41ec39d3ba4a458';

  // 解码 GeoJSON LineString 为 [lng, lat] 数组
  const extractCoordinates = (geoData: FeatureCollection<RPGeometry>) => {
    const coords: [number, number][][] = [];
    geoData.features.forEach((feature) => {
      if (feature.geometry.type === 'LineString') {
        // 原数据是 [lon, lat]，高德也是 [lng, lat]，顺序一致
        coords.push(feature.geometry.coordinates as [number, number][]);
      }
    });
    return coords;
  };

  useEffect(() => {
    if (!mapRef.current || !AMAP_KEY) return;

    // 动态加载高德 JS API
    const scriptId = 'amap-script';
    if (!document.getElementById(scriptId)) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${AMAP_KEY}`;
      script.onload = initMap;
      document.head.appendChild(script);
    } else {
      initMap();
    }

    function initMap() {
      if (mapInstanceRef.current) return; // 防止重复初始化

      // 默认中心点（北京）
      const defaultCenter: [number, number] = [116.397428, 39.90923];
      let allPoints: [number, number][] = [];

      // 提取所有轨迹点
      const tracks = extractCoordinates(geoData);
      tracks.forEach(track => {
        allPoints = allPoints.concat(track);
      });

      // 计算最佳中心和缩放
      let center: [number, number] = defaultCenter;
      let zoom = 10;
      if (allPoints.length > 0) {
        const lats = allPoints.map(p => p[1]);
        const lngs = allPoints.map(p => p[0]);
        const minLat = Math.min(...lats), maxLat = Math.max(...lats);
        const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
        center = [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
        // 简单估算缩放级别（可根据需求调整）
        const latDiff = maxLat - minLat;
        const lngDiff = maxLng - minLng;
        const maxDiff = Math.max(latDiff, lngDiff);
        if (maxDiff < 0.01) zoom = 16;
        else if (maxDiff < 0.1) zoom = 13;
        else if (maxDiff < 1) zoom = 10;
        else zoom = 7;
      }

      // 初始化地图
      const map = new (window as any).AMap.Map(mapRef.current, {
        zoom,
        center,
        viewMode: '2D',
      });
      mapInstanceRef.current = map;

      // 添加轨迹线
      tracks.forEach((points, idx) => {
        const polyline = new (window as any).AMap.Polyline({
          path: points,
          strokeColor: '#3b82f6',
          strokeOpacity: 0.6,
          strokeWeight: 4,
          zIndex: 10,
        });
        map.add(polyline);
      });

      // 自动缩放包含所有轨迹（如果有点）
      if (allPoints.length > 0) {
        map.setFitView(undefined, false, [50, 50, 50, 50]); // 内边距
      }
    }

    return () => {
      // 清理（可选）
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, [geoData, AMAP_KEY]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '600px' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      <div className={styles.runTitle}>{title}</div>
      {/* 简化版年份切换（可点击） */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'rgba(255,255,255,0.8)',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '14px',
          cursor: 'pointer',
        }}
        onClick={() => {
          // 如果有 changeYear 回调，可扩展
          console.log('Current year:', thisYear);
        }}
      >
        {thisYear}
      </div>
    </div>
  );
};

export default RunMap;