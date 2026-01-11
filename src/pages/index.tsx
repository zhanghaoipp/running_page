// src/pages/index.tsx
import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Helmet } from 'react-helmet-async';
import Layout from '@/components/Layout';
import LocationStat from '@/components/LocationStat';
import RunMap from '@/components/RunMap';
import RunTable from '@/components/RunTable';
import SVGStat from '@/components/SVGStat';
import YearsStat from '@/components/YearsStat';
import useActivities from '@/hooks/useActivities';
import useSiteMetadata from '@/hooks/useSiteMetadata';
import activitiesData from '@/static/activities.json';
import { useInterval } from '@/hooks/useInterval';
import { IS_CHINESE } from '@/utils/const';
import {
  Activity,
  IViewState,
  filterAndSortRuns,
  filterCityRuns,
  filterTitleRuns,
  filterYearRuns,
  geoJsonForRuns,
  getBoundsForGeoData,
  scrollToMap,
  sortDateFunc,
  titleForShow,
  RunIds,
} from '@/utils/utils';
import { useTheme, useThemeChangeCounter } from '@/hooks/useTheme';

const Index = () => {
  const { siteTitle, siteUrl } = useSiteMetadata();
  const { activities, thisYear } = useActivities();
  const themeChangeCounter = useThemeChangeCounter();
  const [year, setYear] = useState(thisYear); // 👈 保留，用于当前选中年份
  const [runIndex, setRunIndex] = useState(-1);
  const [title, setTitle] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentAnimationIndex, setCurrentAnimationIndex] = useState(0);
  const [animationRuns, setAnimationRuns] = useState<Activity[]>([]);
  const [currentFilter, setCurrentFilter] = useState<{
    item: string;
    func: (_run: Activity, _value: string) => boolean;
  }>({ item: thisYear, func: filterYearRuns });

  const [singleRunId, setSingleRunId] = useState<number | null>(null);
  const [animationTrigger, setAnimationTrigger] = useState(0);

  const selectedRunIdRef = useRef<number | null>(null);
  const selectedRunDateRef = useRef<string | null>(null);

  // Hash 处理（略，保持不变）

  // ✅ 新增：计算所有有活动的年份（降序）
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    activities.forEach(act => {
      if (act.start_date) {
        const y = act.start_date.split('-')[0];
        years.add(y);
      }
    });
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  }, [activities]);

  // 其他 useMemo / useCallback（保持不变）

  const runs = useMemo(() => {
    return filterAndSortRuns(
      activities,
      currentFilter.item,
      currentFilter.func,
      sortDateFunc
    );
  }, [activities, currentFilter.item, currentFilter.func]);

  const geoData = useMemo(() => {
    return geoJsonForRuns(runs);
  }, [runs, themeChangeCounter]);

  const bounds = useMemo(() => {
    return getBoundsForGeoData(geoData);
  }, [geoData]);

  const [viewState, setViewState] = useState<IViewState>(() => ({
    ...bounds,
  }));

  const [animatedGeoData, setAnimatedGeoData] = useState(geoData);

  // useInterval（略）

  const startAnimation = useCallback(
    (runsToAnimate: Activity[]) => {
      if (runsToAnimate.length === 0) {
        setAnimatedGeoData(geoData);
        return;
      }
      const sliceNum = runsToAnimate.length >= 8 ? Math.ceil(runsToAnimate.length / 8) : 1;
      setAnimationRuns(runsToAnimate);
      setCurrentAnimationIndex(sliceNum);
      setIsAnimating(true);
    },
    [geoData]
  );

  const changeByItem = useCallback(
    (item: string, name: string, func: (_run: Activity, _value: string) => boolean) => {
      scrollToMap();
      if (name !== 'Year') {
        setYear(thisYear);
      }
      setCurrentFilter({ item, func });
      setRunIndex(-1);
      setTitle(`${item} ${name} Running Heatmap`);
      setSingleRunId(null);
      if (window.location.hash) {
        window.history.pushState(null, '', window.location.pathname);
      }
    },
    [thisYear]
  );

  const changeYear = useCallback(
    (y: string) => {
      setYear(y);
      if ((viewState.zoom ?? 0) > 3 && bounds) {
        setViewState({ ...bounds });
      }
      changeByItem(y, 'Year', filterYearRuns);
      setIsAnimating(false);
    },
    [viewState.zoom, bounds, changeByItem]
  );

  const changeCity = useCallback((city: string) => {
    changeByItem(city, 'City', filterCityRuns);
  }, [changeByItem]);

  const changeTitle = useCallback((title: string) => {
    changeByItem(title, 'Title', filterTitleRuns);
  }, [changeByItem]);

  const setActivity = useCallback((_newRuns: Activity[]) => {
    console.warn('setActivity called but runs are now computed from filters');
  }, []);

  const locateActivity = useCallback(
    (runIds: RunIds) => {
      const ids = new Set(runIds);
      const selectedRuns = !runIds.length ? runs : runs.filter(r => ids.has(r.run_id));
      if (!selectedRuns.length) return;

      const lastRun = selectedRuns.sort(sortDateFunc)[0];
      if (!lastRun) return;

      if (runIds.length === 1) {
        const runId = runIds[0];
        const runIdx = runs.findIndex(run => run.run_id === runId);
        setRunIndex(runIdx);
      } else {
        setRunIndex(-1);
      }

      if (runIds.length === 1) {
        const runId = runIds[0];
        const newHash = `#run_${runId}`;
        if (window.location.hash !== newHash) {
          window.history.pushState(null, '', newHash);
        }
        setSingleRunId(runId);
      } else {
        if (window.location.hash) {
          window.history.pushState(null, '', window.location.pathname);
        }
        setSingleRunId(null);
      }

      const selectedGeoData = geoJsonForRuns(selectedRuns);
      const selectedBounds = getBoundsForGeoData(selectedGeoData);
      setIsAnimating(false);
      setAnimatedGeoData(selectedGeoData);
      if (runIds.length === 1) {
        setAnimationTrigger(prev => prev + 1);
      }
      setViewState({ ...selectedBounds });
      setTitle(titleForShow(lastRun));
      scrollToMap();
    },
    [runs]
  );

  // Auto locate single run（略，保持不变）

  // Bounds / Animation useEffect（略，保持不变）

  // SVG click handler（略，保持不变）

  const { theme } = useTheme();

  return (
    <Layout>
      <Helmet>
        <html lang="en" data-theme={theme} />
      </Helmet>
      <div className="w-full lg:w-1/3">
        <h1 className="my-12 mt-6 text-5xl font-extrabold italic">
          <a href={siteUrl}>{siteTitle}</a>
        </h1>
        {(viewState.zoom ?? 0) <= 3 && IS_CHINESE ? (
          <LocationStat
            changeYear={changeYear}
            changeCity={changeCity}
            changeTitle={changeTitle}
          />
        ) : (
          <YearsStat year={year} onClick={changeYear} />
        )}
      </div>
      <div className="w-full lg:w-2/3" id="map-container">
        {/* ✅ 传递 availableYears */}
        <RunMap
          title={title}
          viewState={viewState}
          geoData={animatedGeoData}
          setViewState={setViewState}
          changeYear={changeYear}
          thisYear={year}
          activities={activitiesData}
          availableYears={availableYears} // 👈 新增 prop
          animationTrigger={animationTrigger}
        />
        {year === 'Total' ? (
          <SVGStat />
        ) : (
          <RunTable
            runs={runs}
            locateActivity={locateActivity}
            setActivity={setActivity}
            runIndex={runIndex}
            setRunIndex={setRunIndex}
          />
        )}
      </div>
      {import.meta.env.VERCEL && <Analytics />}
    </Layout>
  );
};

export default Index;