import { useRef } from 'react';

export function useHeatmap(map: any) {
  const heatmapRef = useRef<any>(null);

  const updateHeatmap = (points: { lng: number; lat: number; count: number }[]) => {
    if (!map || points.length === 0) return;

    (window as any).AMap.plugin(['AMap.Heatmap'], () => {
      if (!heatmapRef.current) {
        heatmapRef.current = new (window as any).AMap.Heatmap(map, {
          radius: 25,
          opacity: [0, 0.8],
        });
      }

      heatmapRef.current.setData({
        data: points,
        max: 20,
      });
    });
  };

  const clearHeatmap = () => {
    if (heatmapRef.current) {
      heatmapRef.current.setMap(null);
      heatmapRef.current = null;
    }
  };

  return { updateHeatmap, clearHeatmap };
}
