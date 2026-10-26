'use client';
import { useEffect, useRef, useState } from 'react';
import { ReportDataEngine } from './ReportDataEngine';

// ONE job: create an engine, subscribe to it, hand React the latest state + the
// engine's methods. No fetching, no maths here — same contract as useEntityController.
export function useReportController(schema, options = {}) {
  const engineRef = useRef(null);
  if (!engineRef.current) {
    engineRef.current = new ReportDataEngine(schema, options);
  }
  const engine = engineRef.current;

  const [state, setState] = useState(engine.getState());

  useEffect(() => {
    const unsubscribe = engine.subscribe(setState);
    engine.load();
    return () => {
      unsubscribe();
      engine.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema.apiBase, schema.entity, options.sample, JSON.stringify(options.fixedQuery)]);

  return {
    ...state, // rawRows, loading, error, sample, groupBy, advancedQuery
    schema,
    setFilterValue: engine.setFilterValue.bind(engine),
    clearFilterValue: engine.clearFilterValue.bind(engine),
    setDateRange: engine.setDateRange.bind(engine),
    clearAllAdvancedFilters: engine.clearAllAdvancedFilters.bind(engine),
    setGroupBy: engine.setGroupBy.bind(engine),
    refresh: engine.refresh.bind(engine),
    load: engine.load.bind(engine),
  };
}
