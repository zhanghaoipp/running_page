import { useRef } from 'react';

export function useAmap(container: HTMLDivElement | null, options: any) {
  const mapRef = useRef<any>(null);

  if (!mapRef.current && container && (window as any).AMap) {
    mapRef.current = new (window as any).AMap.Map(container, options);
  }

  return mapRef.current;
}
