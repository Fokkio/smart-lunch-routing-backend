// ไฟล์นี้: เรียงลำดับจุดส่งในงานเดียวให้ระยะทางรวมสั้นที่สุด (งานละไม่เกิน 3 จุด)
import type { TravelMatrix } from './distance.types';

/**
 * Optimal stop sequencing for 1–3 stops (pure domain).
 *
 * A rider holds at most 3 orders, so every permutation is enumerated
 * (1 stop → 1, 2 stops → 2, 3 stops → 6). Nearest-neighbour is NOT used
 * for final sequencing — exhaustive search on tiny inputs is exact.
 *
 * Objective: minimum total DURATION from the shop through all stops
 * (travel-matrix durations, road or fallback-estimated). Deterministic
 * tie-breaking: shorter total distance, then lexicographically smaller
 * order-id sequence. Costs come from the caller-supplied matrix, so any
 * `DistanceCalculator` result (Haversine, OSRM, mock) can drive it.
 */
export interface SequencedRoute {
  orderIds: string[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
}

// เรียงจุดส่งในงานเดียวให้ดีที่สุด: ลองทุกการเรียงที่เป็นไปได้ (ไม่เกิน 3 จุด) แล้วเลือกที่ระยะทางรวมสั้นที่สุด
export function sequenceStops(
  shopId: string,
  orderIds: string[],
  matrix: TravelMatrix,
  excludedOrder?: readonly string[],
): SequencedRoute {
  if (orderIds.length === 0) {
    throw new Error('sequenceStops needs at least one stop');
  }
  if (orderIds.length > 3) {
    throw new Error(`sequenceStops supports at most 3 stops, got ${orderIds.length}`);
  }
  const indexOf = new Map(matrix.pointIds.map((id, index) => [id, index]));
  const shopIndex = mustFindIndex(indexOf, shopId);
  const stopIndices = orderIds.map((id) => mustFindIndex(indexOf, id));

  let best: SequencedRoute | null = null;
  let bestKey = '';
  for (const permutation of permutations(stopIndices)) {
    let distance = 0;
    let duration = 0;
    let previous = shopIndex;
    for (const current of permutation) {
      distance += matrix.distancesKm[previous]![current]!;
      duration += matrix.durationsMinutes[previous]![current]!;
      previous = current;
    }
    const ids = permutation.map((i) => matrix.pointIds[i]!);
    const key = ids.join(',');
    if (excludedOrder && key === excludedOrder.join(',')) continue;
    if (
      best === null ||
      duration < best.totalDurationMinutes ||
      (duration === best.totalDurationMinutes && distance < best.totalDistanceKm) ||
      (duration === best.totalDurationMinutes &&
        distance === best.totalDistanceKm &&
        key < bestKey)
    ) {
      best = { orderIds: ids, totalDistanceKm: distance, totalDurationMinutes: duration };
      bestKey = key;
    }
  }
  if (!best) throw new Error('No distinct stop sequence');
  return best;
}

// หาตำแหน่งของจุดในตารางระยะทาง: ถ้าไม่มีจุดนี้โยน error
function mustFindIndex(indexOf: Map<string, number>, id: string): number {
  const index = indexOf.get(id);
  if (index === undefined) throw new Error(`TravelMatrix has no point "${id}"`);
  return index;
}

// สร้างทุกการเรียงที่เป็นไปได้ของรายการที่ส่งมา (ใช้ลองเรียงจุดส่ง)
function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items.slice()];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) result.push([items[i]!, ...tail]);
  }
  return result;
}
