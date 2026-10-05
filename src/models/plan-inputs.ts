import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import type { RouteStopResponse } from '../domain/routing/route-plan.types';
import { ShopSettingsModel, type ShopSettings } from './shop-settings.model';

export type PlanStopInput = Pick<RouteStopResponse, 'orderId' | 'customerId' | 'customerName' | 'phone' | 'address' | 'latitude' | 'longitude' | 'boxCount'>;
export type PlanSnapshot = { shop: ShopSettings; stops: PlanStopInput[]; scope?:'BATCH';window?:{startTime:string;deadline:string} };

export function snapshotStop(stop: PlanStopInput): PlanStopInput {
  const { orderId, customerId, customerName, phone, address, latitude, longitude, boxCount } = stop;
  return { orderId, customerId, customerName, phone, address, latitude, longitude, boxCount };
}

export function readSnapshot(value: unknown): PlanSnapshot | null {
  if (!value) return null;
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object' || !('shop' in parsed) || !Array.isArray(parsed.stops)) return null;
  return parsed as PlanSnapshot;
}

// ponytail: serialize planning writes for this single shop; use per-shop locks if multi-shop is added.
export async function lockPlanning(conn: PoolConnection): Promise<void> {
  await conn.execute('SELECT setting_id FROM shop_settings WHERE setting_id=1 FOR UPDATE');
}

export async function validateSnapshot(conn: PoolConnection, snapshot: PlanSnapshot, planDate: string): Promise<void> {
  const ids=snapshot.scope==='BATCH'?snapshot.stops.map(stop=>stop.orderId):[];
  if(snapshot.scope==='BATCH'&&!ids.length)throw Object.assign(new Error('A round must contain orders'),{statusCode:409});
  const [orders] = await conn.execute<(RowDataPacket & PlanStopInput)[]>(
    `SELECT o.order_id AS orderId,o.customer_id AS customerId,o.box_count AS boxCount,
     c.name AS customerName,c.phone AS phone,c.address AS address,
     c.latitude AS latitude,c.longitude AS longitude FROM orders o
     JOIN customers c ON c.customer_id=o.customer_id
     WHERE o.order_date=? AND o.status='PENDING' ${ids.length?`AND o.order_id IN (${ids.map(()=>'?').join(',')})`:''} ORDER BY o.order_id FOR UPDATE`, [planDate,...ids],
  );
  const actual = orders.map(row => snapshotStop({ ...row, latitude: Number(row.latitude), longitude: Number(row.longitude) }));
  // MySQL/TiDB JSON storage may reorder object keys; compare values, not serialized key order.
  const expected = snapshot.stops.map(snapshotStop).sort((a, b) => a.orderId - b.orderId);
  const actualShop = JSON.stringify(actual) === JSON.stringify(expected) ? await ShopSettingsModel.get(conn) : null;
  if (!actualShop || (Object.keys(actualShop) as Array<keyof ShopSettings>).some(key => actualShop[key] !== snapshot.shop[key])) {
    throw Object.assign(new Error('Orders, customers or shop settings changed; calculate a new plan'), { statusCode: 409 });
  }
}

/** Caller supplies only a fixed SQL predicate; values always use parameters. */
export async function guardPlanEdit(conn: PoolConnection, predicate: string, values: (string | number)[], includeCompleted = true): Promise<void> {
  const joins = `FROM route_plans rp JOIN delivery_jobs dj ON dj.route_plan_id=rp.route_plan_id
    JOIN delivery_job_orders djo ON djo.delivery_job_id=dj.delivery_job_id
    JOIN orders o ON o.order_id=djo.order_id`;
  const [active] = await conn.execute<RowDataPacket[]>(
    `SELECT rp.route_plan_id ${joins} WHERE ${predicate} AND rp.status='SELECTED'
     ${includeCompleted ? '' : "AND (o.status<>'DELIVERED' OR rp.input_snapshot IS NULL)"} LIMIT 1`, values,
  );
  if (active.length) throw Object.assign(new Error('This data belongs to a confirmed delivery plan; cancel the plan before editing'), { statusCode: 409 });
  await conn.execute(
    `UPDATE route_plans rp JOIN delivery_jobs dj ON dj.route_plan_id=rp.route_plan_id
     JOIN delivery_job_orders djo ON djo.delivery_job_id=dj.delivery_job_id
     JOIN orders o ON o.order_id=djo.order_id SET rp.status='REJECTED'
     WHERE ${predicate} AND rp.status='GENERATED'`, values,
  );
}
