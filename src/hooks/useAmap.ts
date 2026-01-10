// src/hooks/useAmap.ts
import { useRef, useEffect } from 'react';

export function useAmap(
  container: HTMLDivElement | null,
  options: any,
  deps: any[] = []
) {
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!container || !window.AMap) return;

    // 只初始化一次
    if (!mapRef.current) {
      mapRef.current = new window.AMap.Map(container, options);
    }

    return () => {
      // 组件卸载时销毁地图（可选）
      // if (mapRef.current) {
      //   mapRef.current.destroy();
      //   mapRef.current = null;
      // }
    };
  }, [container, ...deps]);

  return mapRef.current;
}