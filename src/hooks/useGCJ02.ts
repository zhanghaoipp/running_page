import { wgs84ToGcj02 } from '@/utils/coord';

export function useGCJ02() {
  const convertPath = (path: [number, number][]) =>
    path.map(([lng, lat]) => {
      const [gLat, gLng] = wgs84ToGcj02(lat, lng);
      return [gLng, gLat];
    });

  return { convertPath };
}
