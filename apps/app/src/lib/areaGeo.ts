import { useCallback, useEffect, useState } from 'react';
import type { LatLng } from './geo';
import { requireOnline } from './serverWrite';
import { supabase } from './supabase';

/**
 * Ranh khu trên bản đồ (mục 9, migration 0196). Chỉ tải khi cơ sở bật tính năng "Bản đồ thửa" và khi mở màn bản đồ;
 * không nằm trong đồng bộ chung nên không làm nặng màn khác. Ghi cần mạng (chức năng quản lý, D24).
 */
export interface AreaGeo { area_id: string; ring: LatLng[]; point_count: number; area_m2: number; center_lat: number; center_lng: number; source: 'draw' | 'gps' | 'mixed'; updated_at: string }

export async function fetchAreaGeos(orgId: string): Promise<AreaGeo[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('area_geo').select('area_id, ring, point_count, area_m2, center_lat, center_lng, source, updated_at').eq('organization_id', orgId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as AreaGeo[]).map((g) => ({ ...g, area_m2: Number(g.area_m2) }));
}

export async function saveAreaBoundary(areaId: string, ring: LatLng[], source: 'draw' | 'gps' | 'mixed'): Promise<AreaGeo> {
  requireOnline('lưu ranh khu');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { data, error } = await supabase.rpc('set_area_boundary', { p_area: areaId, p_ring: ring, p_source: source });
  if (error) throw new Error(error.message);
  const g = data as unknown as AreaGeo;
  return { ...g, area_m2: Number(g.area_m2) };
}

export async function clearAreaBoundary(areaId: string): Promise<void> {
  requireOnline('xóa ranh khu');
  if (!supabase) throw new Error('Supabase chưa được cấu hình');
  const { error } = await supabase.rpc('clear_area_boundary', { p_area: areaId });
  if (error) throw new Error(error.message);
}

/** Danh sách ranh của cơ sở; `enabled` false thì không tải gì */
export function useAreaGeos(orgId: string | undefined, enabled: boolean) {
  const [geos, setGeos] = useState<AreaGeo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    if (!orgId || !enabled || !navigator.onLine) return;
    try { setGeos(await fetchAreaGeos(orgId)); setError(null); } catch (e) { setError(e instanceof Error ? e.message : 'Lỗi'); }
  }, [orgId, enabled]);
  useEffect(() => { void reload(); }, [reload]);
  return { geos, error, reload };
}
