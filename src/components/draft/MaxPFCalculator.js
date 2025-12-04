// Keep this module as a thin client wrapper that re-exports server-safe util
'use client';
import calculateSeasonMaxPF from '@/utils/maxpf';
export { calculateSeasonMaxPF };
export default calculateSeasonMaxPF;
