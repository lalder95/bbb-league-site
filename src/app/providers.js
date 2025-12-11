'use client';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { SessionProvider } from "next-auth/react";

// Budget Ratios Context: provides global KTC/$ and per-position ratios app-wide
const BudgetRatiosContext = createContext({
  ktcPerDollar: 0,
  positionRatios: {},
  usePositionRatios: false,
  loading: false,
  error: null,
  setUsePositionRatios: () => {},
});

function BudgetRatiosProvider({ children }) {
  const [ktcPerDollar, setKtcPerDollar] = useState(0);
  const [positionRatios, setPositionRatios] = useState({});
  const [usePositionRatios, setUsePositionRatios] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('https://raw.githubusercontent.com/lalder95/AGS_Data/main/CSV/BBB_Contracts.csv', { cache: 'no-store' });
        const text = await res.text();
        const rows = text.split('\n').filter(Boolean);
        if (rows.length < 2) throw new Error('No contracts data');
        const headers = rows[0].split(',').map(h => h.trim());
        const h = (name) => headers.findIndex(col => col.trim() === name);
        const idx = {
          Status: h('Status'),
          Position: h('Position'),
          Year1: h('Relative Year 1 Salary'),
          KTC: h('Current KTC Value'),
        };
        const active = rows.slice(1).map(r => r.split(',')).filter(cols => {
          const status = cols[idx.Status];
          return status === 'Active';
        });
        const toNum = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
        const totalSalary = active.reduce((s, c) => s + toNum(c[idx.Year1]), 0);
        const totalKtc = active.reduce((s, c) => s + toNum(c[idx.KTC]), 0);
        const globalRatio = totalSalary > 0 ? (totalKtc / totalSalary) : 0;
        const byPos = {};
        for (const c of active) {
          const pos = String(c[idx.Position] || 'UNKNOWN').toUpperCase();
          const sal = toNum(c[idx.Year1]);
          const ktc = toNum(c[idx.KTC]);
          if (!byPos[pos]) byPos[pos] = { salary: 0, ktc: 0, count: 0 };
          byPos[pos].salary += sal;
          byPos[pos].ktc += ktc;
          byPos[pos].count += 1;
        }
        const posRatios = Object.fromEntries(Object.entries(byPos).map(([pos, agg]) => [pos, agg.salary > 0 ? (agg.ktc / agg.salary) : 0]));
        if (!cancelled) {
          setKtcPerDollar(globalRatio);
          setPositionRatios(posRatios);
        }
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const value = useMemo(() => ({
    ktcPerDollar,
    positionRatios,
    usePositionRatios,
    setUsePositionRatios,
    loading,
    error,
  }), [ktcPerDollar, positionRatios, usePositionRatios, loading, error]);

  return (
    <BudgetRatiosContext.Provider value={value}>
      {children}
    </BudgetRatiosContext.Provider>
  );
}

export function useBudgetRatios() {
  return useContext(BudgetRatiosContext);
}

export function Providers({ children }) {
  return (
    <SessionProvider>
      <BudgetRatiosProvider>
        {children}
      </BudgetRatiosProvider>
    </SessionProvider>
  );
}