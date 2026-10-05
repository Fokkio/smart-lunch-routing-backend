import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { GeoJsonLineString } from '../domain/routing/distance.types';
import type {
  DeliveryRouteResponse,
  RoutePlanDetailResponse,
  RoutePlanResponse,
  RoutePlanStatus,
  RoutePlanSummaryResponse,
  RouteStopResponse,
} from '../domain/routing/route-plan.types';
import { getPool, withTransaction } from '../database/mysql.connection';
import { toISODate } from './dates';
import { lockPlanning, readSnapshot, snapshotStop, validateSnapshot, type PlanSnapshot } from './plan-inputs';
import { busyRiderSql } from './rider.model';
import { badInput } from '../services/input-validation';
export type JobAssignment = {jobId:number;riderId:number};

export type PlanRow = RowDataPacket & {
  route_plan_id: number; plan_date: string | Date; start_time: string;
  estimated_finish_time: string | null; rider_count: number | null;
  total_distance_km: number | null; total_delivery_cost: number | null;
  total_revenue: number | null; total_food_cost: number | null;
  estimated_profit: number | null; status: RoutePlanStatus;
  routing_source: string | null; approximate: number | boolean | null;
  input_snapshot?: string | PlanSnapshot | null;
};
export type JobRow = RowDataPacket & {
  acknowledged_at?: string | Date | null; status?:'WAITING'|'DELIVERING'|'COMPLETED'|'ASSIGNED'|'DELIVERED';
  delivery_job_id: number; route_plan_id: number; rider_id: number | null;
  job_code: string; total_orders: number; total_boxes: number;
  total_distance_km: number | null; estimated_duration_min: number | null;
  estimated_start_time: string | null; estimated_finish_time: string | null;
  delivery_cost: number | null; route_geometry: string | object | null;
};

/** 409 — a conflicting SELECTED plan already exists for the date. */
export class PlanConflictError extends Error {
  readonly statusCode = 409;
  constructor(message: string) {
    super(message);
    this.name = 'PlanConflictError';
  }
}

export type StopRow = RowDataPacket & {
  order_id: number; stop_sequence: number; distance_from_previous_km: number | null;
  travel_time_from_previous_min: number | null; estimated_arrival_time: string | null;
  customer_id: number; box_count: number; customer_name: string;
  customer_phone: string | null; customer_address: string | null;
  customer_latitude: number; customer_longitude: number;
  delivery_status: 'WAITING' | 'DELIVERING' | 'DELIVERED';
  leg_geometry: string | object | null;
};

/**
 * RoutePlan persistence against route_plans / delivery_jobs /
 * delivery_job_orders (migrations 001 + 002). One plan is created per
 * generate call — never overwritten; plans coexist and the owner picks.
 */
export class RoutePlanModel {
  static async acknowledgeJob(jobId:number,riderId:number,start=false):Promise<boolean> {
    return withTransaction(async conn=>{
      await lockPlanning(conn);
      const [rows]=await conn.execute<JobRow[]>(`SELECT dj.* FROM delivery_jobs dj JOIN route_plans rp ON rp.route_plan_id=dj.route_plan_id
        WHERE dj.delivery_job_id=? AND dj.rider_id=? AND rp.status='SELECTED' FOR UPDATE`,[jobId,riderId]);
      const job=rows[0];
      if(!job)return false;
      if(job.status==='COMPLETED')throw new PlanConflictError('This job is already completed');
      if(start && !job.acknowledged_at)throw new PlanConflictError('Acknowledge the job before starting');
      if(start){
        await conn.execute("UPDATE delivery_jobs SET status='DELIVERING' WHERE delivery_job_id=?",[jobId]);
        await conn.execute("UPDATE orders o JOIN delivery_job_orders djo ON djo.order_id=o.order_id SET o.status='DELIVERING' WHERE djo.delivery_job_id=? AND o.status='PLANNED'",[jobId]);
      }else await conn.execute('UPDATE delivery_jobs SET acknowledged_at=COALESCE(acknowledged_at,UTC_TIMESTAMP()) WHERE delivery_job_id=?',[jobId]);
      return true;
    });
  }
  static async deliverStop(planId: number, jobId: number, orderId: number, riderId?: number): Promise<boolean> {
    return withTransaction(async (conn) => {
      const [rows] = await conn.execute<(RowDataPacket & {
        status: RoutePlanStatus; job_status: string; delivery_status: string; stop_sequence: number; rider_id: number | null;acknowledged_at:string|null;
      })[]>(
        `SELECT rp.status, dj.status AS job_status, o.status AS delivery_status, djo.stop_sequence, dj.rider_id,dj.acknowledged_at
         FROM route_plans rp JOIN delivery_jobs dj ON dj.route_plan_id=rp.route_plan_id
         JOIN delivery_job_orders djo ON djo.delivery_job_id=dj.delivery_job_id
         JOIN orders o ON o.order_id=djo.order_id
         WHERE rp.route_plan_id=? AND dj.delivery_job_id=? AND djo.order_id=? FOR UPDATE`,
        [planId, jobId, orderId],
      );
      const stop = rows[0];
      if (!stop) return false;
      if (riderId !== undefined && stop.rider_id !== riderId) return false;
      if (stop.status !== 'SELECTED') {
        throw Object.assign(new Error('Only a selected plan can record deliveries'), { statusCode: 409 });
      }
      if (stop.delivery_status === 'DELIVERED') return true;
      if (!stop.acknowledged_at) throw new PlanConflictError('Acknowledge the job before recording deliveries');
      if (stop.job_status !== 'DELIVERING' || stop.delivery_status !== 'DELIVERING') {
        throw new PlanConflictError('Start the job before recording deliveries');
      }
      const [earlier] = await conn.execute<(RowDataPacket & { count: number })[]>(
        `SELECT COUNT(*) AS count FROM delivery_job_orders djo
         JOIN orders o ON o.order_id=djo.order_id
         WHERE djo.delivery_job_id=? AND djo.stop_sequence<? AND o.status<>'DELIVERED'`,
        [jobId, stop.stop_sequence],
      );
      if (Number(earlier[0]?.count ?? 0) > 0) {
        throw Object.assign(new Error('Deliver earlier stops first'), { statusCode: 409 });
      }
      await conn.execute(`UPDATE orders SET status='DELIVERED' WHERE order_id=?`, [orderId]);
      const [remaining] = await conn.execute<(RowDataPacket & { count: number })[]>(
        `SELECT COUNT(*) AS count FROM delivery_job_orders djo
         JOIN orders o ON o.order_id=djo.order_id
         WHERE djo.delivery_job_id=? AND o.status<>'DELIVERED'`, [jobId],
      );
      await conn.execute(
        `UPDATE delivery_jobs SET status=? WHERE delivery_job_id=?`,
        [Number(remaining[0]?.count ?? 0) === 0 ? 'COMPLETED' : 'DELIVERING', jobId],
      );
      return true;
    });
  }

  /** Persist an assembled plan with all jobs/stops in one transaction. */
  static async create(plan: RoutePlanResponse, startTime: string): Promise<number> {
    return withTransaction(async (conn) => {
      await lockPlanning(conn);
      if (!plan.shop) throw new Error('Plan shop snapshot is required');
      const snapshot: PlanSnapshot = { shop: plan.shop, stops: plan.jobs.flatMap(job => job.stops.map(snapshotStop)) };
      if(plan.partialBatch)snapshot.scope='BATCH';
      if (plan.deliveryDeadline) snapshot.window = { startTime:startTime.slice(0,5),deadline:plan.deliveryDeadline };
      await validateSnapshot(conn, snapshot, plan.planDate);
      const [planResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO route_plans(plan_date,start_time,estimated_finish_time,rider_count,
         total_distance_km,total_delivery_cost,total_revenue,total_food_cost,
         estimated_profit,status,routing_source,approximate,input_snapshot)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          plan.planDate, toTime(startTime), toTime(plan.estimatedFinishTime),
          plan.riderCount, plan.totalDistanceKm, plan.totalDeliveryCost,
          plan.totalRevenue, plan.totalFoodCost, plan.estimatedProfit,
          'GENERATED', plan.routingSource, plan.approximate ? 1 : 0,
          JSON.stringify(snapshot),
        ],
      );
      const routePlanId = planResult.insertId;
      for (const job of plan.jobs) {
        const jobCode = `P${routePlanId}-R${job.riderIndex + 1}`;
        const [jobResult] = await conn.execute<ResultSetHeader>(
          `INSERT INTO delivery_jobs(route_plan_id,rider_id,job_code,total_orders,total_boxes,
           total_distance_km,estimated_duration_min,estimated_start_time,estimated_finish_time,
           delivery_cost,route_geometry)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
          [
            routePlanId, job.riderId, jobCode, job.totalOrders, job.totalBoxes,
            job.distanceKm, Math.round(job.durationMinutes),
            toTime(job.estimatedStartTime), toTime(job.estimatedFinishTime),
            job.deliveryCost, job.geometry ? JSON.stringify(job.geometry) : null,
          ],
        );
        const deliveryJobId = jobResult.insertId;
        for (const stop of job.stops) {
          await conn.execute(
            `INSERT INTO delivery_job_orders(delivery_job_id,order_id,stop_sequence,
             distance_from_previous_km,travel_time_from_previous_min,estimated_arrival_time,leg_geometry)
             VALUES(?,?,?,?,?,?,?)`,
            [
              deliveryJobId, stop.orderId, stop.sequence,
              stop.distanceFromPreviousKm, stop.travelTimeFromPreviousMin,
              toTime(stop.estimatedArrivalTime),
              stop.geometry ? JSON.stringify(stop.geometry) : null,
            ],
          );
        }
      }
      return routePlanId;
    });
  }

  static async list(planDate?: string): Promise<RoutePlanSummaryResponse[]> {
    // totalBoxes is NOT a route_plans column — derive it from the
    // normalized delivery_jobs rows (SUM per plan, 0 when jobless).
    // Grouping by the primary key keeps this valid under
    // ONLY_FULL_GROUP_BY (all other columns are functionally dependent).
    const select = `SELECT rp.route_plan_id, rp.plan_date, rp.start_time,
        rp.estimated_finish_time, rp.rider_count, rp.total_distance_km,
        rp.total_delivery_cost, rp.total_revenue, rp.total_food_cost,
        rp.estimated_profit, rp.status, rp.routing_source, rp.approximate,rp.input_snapshot,
        COALESCE(SUM(dj.total_boxes), 0) AS total_boxes
      FROM route_plans rp LEFT JOIN delivery_jobs dj
        ON dj.route_plan_id = rp.route_plan_id`;
    const [rows] = planDate
      ? await getPool().execute<Array<PlanRow & { total_boxes: number }>>(
          `${select} WHERE rp.plan_date = ? GROUP BY rp.route_plan_id ORDER BY rp.route_plan_id DESC`,
          [planDate],
        )
      : await getPool().query<Array<PlanRow & { total_boxes: number }>>(
          `${select} GROUP BY rp.route_plan_id ORDER BY rp.route_plan_id DESC`,
        );
    return rows.map((row) => toPlanSummary(row, Number(row.total_boxes ?? 0)));
  }

  /** Full plan with jobs, stops, customer details, and geometry. */
  static async findFull(routePlanId: number, conn?: PoolConnection): Promise<RoutePlanDetailResponse | null> {
    const db = conn ?? getPool();
    const [plans] = await db.execute<PlanRow[]>(
      'SELECT * FROM route_plans WHERE route_plan_id = ?', [routePlanId]);
    const plan = plans[0];
    if (!plan) return null;
    const [jobs] = await db.execute<JobRow[]>(
      'SELECT * FROM delivery_jobs WHERE route_plan_id = ? ORDER BY delivery_job_id', [routePlanId]);
    const full: RoutePlanDetailResponse = {
      ...toPlanSummary(plan, 0),
      shop: readSnapshot(plan.input_snapshot)?.shop,
      routePlanId: plan.route_plan_id,
      totalBoxes: 0,
      totalRevenue: Number(plan.total_revenue ?? 0),
      totalFoodCost: Number(plan.total_food_cost ?? 0),
      totalDeliveryCost: Number(plan.total_delivery_cost ?? 0),
      estimatedProfit: Number(plan.estimated_profit ?? 0),
      jobs: [],
    };
    for (const [riderIndex, job] of jobs.entries()) {
      const [stops] = await db.execute<StopRow[]>(STOP_QUERY, [job.delivery_job_id]);
      full.jobs.push(toJobResponse(job, stops, riderIndex, full.approximate, readSnapshot(plan.input_snapshot)));
      full.totalBoxes += job.total_boxes;
    }
    return full;
  }

  static async findRiderJobs(riderId: number, planDate: string) {
    const [rows] = await getPool().execute<Array<JobRow & { approximate: number | boolean; input_snapshot: PlanRow['input_snapshot'] }>>(
      `SELECT dj.*, rp.approximate, rp.input_snapshot FROM delivery_jobs dj
       JOIN route_plans rp ON rp.route_plan_id=dj.route_plan_id
       WHERE dj.rider_id=? AND rp.status='SELECTED' AND (rp.plan_date=? OR
        (rp.plan_date<? AND EXISTS(SELECT 1 FROM delivery_job_orders pending_stop
         JOIN orders pending_order ON pending_order.order_id=pending_stop.order_id
         WHERE pending_stop.delivery_job_id=dj.delivery_job_id AND pending_order.status IN ('PLANNED','DELIVERING'))))
       ORDER BY rp.plan_date, dj.delivery_job_id`, [riderId, planDate, planDate],
    );
    return Promise.all(rows.map(async (row) => ({
      planId: row.route_plan_id,
      shop: readSnapshot(row.input_snapshot)?.shop,
      deliveryDeadline: readSnapshot(row.input_snapshot)?.window?.deadline,
      job: await this.mapJob(row, 0, Boolean(row.approximate), readSnapshot(row.input_snapshot)),
    })));
  }

  static async findSelectedRiderJobPlan(riderId: number, jobId: number): Promise<number | null> {
    const [rows] = await getPool().execute<(RowDataPacket & { route_plan_id: number })[]>(
      `SELECT rp.route_plan_id FROM delivery_jobs dj
       JOIN route_plans rp ON rp.route_plan_id=dj.route_plan_id
       WHERE dj.delivery_job_id=? AND dj.rider_id=? AND rp.status='SELECTED'`, [jobId, riderId],
    );
    return rows[0]?.route_plan_id ?? null;
  }

  /**
   * Select a plan: mark SELECTED and move its orders PENDING → PLANNED so
   * the next generate only sees unplanned orders. Transactional.
   *
   * Planning writes share the shop lock. Distinct rounds may coexist;
   * revalidation prevents duplicate orders and riders with unfinished work.
   *
   * @throws {PlanConflictError} (HTTP 409) when another plan for the same
   * work is no longer assignable.
   */
  static async select(routePlanId: number, assignments?: JobAssignment[]): Promise<RoutePlanResponse | null> {
    if (assignments !== undefined && (!Array.isArray(assignments) || !assignments.length || assignments.some(a => !a || !Number.isSafeInteger(a.jobId) || a.jobId < 1 || !Number.isSafeInteger(a.riderId) || a.riderId < 1)
      || new Set(assignments.map(a=>a.jobId)).size!==assignments.length || new Set(assignments.map(a=>a.riderId)).size!==assignments.length)) badInput('Each job needs one distinct rider');
    const updated = await withTransaction(async (conn) => {
      await lockPlanning(conn);
      // Lock the target row: concurrent selects of the SAME plan serialize here.
      const [plans] = await conn.execute<PlanRow[]>(
        'SELECT * FROM route_plans WHERE route_plan_id = ? FOR UPDATE', [routePlanId]);
      const plan = plans[0];
      if (!plan || plan.status !== 'GENERATED') return false;
      if (assignments) {
        const [jobs] = await conn.execute<JobRow[]>('SELECT delivery_job_id FROM delivery_jobs WHERE route_plan_id=? FOR UPDATE',[routePlanId]);
        if(jobs.length!==assignments.length || jobs.some(job=>!assignments.some(a=>a.jobId===job.delivery_job_id))) badInput('Assignments must cover every job in this plan');
        for(const a of assignments) {
          const [ready]=await conn.execute<RowDataPacket[]>(`SELECT r.rider_id FROM riders r WHERE r.rider_id=? AND is_available=TRUE AND status='ACTIVE'
           AND login_enabled=TRUE AND username IS NOT NULL AND password_hash IS NOT NULL AND NOT ${busyRiderSql} FOR UPDATE`,[a.riderId]);
          if(!ready.length)throw new PlanConflictError('The chosen rider is unavailable or already has unfinished work');
          await conn.execute('UPDATE delivery_jobs SET rider_id=? WHERE delivery_job_id=? AND route_plan_id=?',[a.riderId,a.jobId,routePlanId]);
        }
      }
      const [assignment] = await conn.execute<(RowDataPacket & {
        total: number; distinct_riders: number; unavailable: number;
      })[]>(
        `SELECT COUNT(*) AS total, COUNT(DISTINCT dj.rider_id) AS distinct_riders,
         SUM(dj.rider_id IS NULL OR COALESCE(r.is_available, FALSE)=FALSE OR COALESCE(r.status,'INACTIVE')<>'ACTIVE'
          OR COALESCE(r.login_enabled,FALSE)=FALSE OR r.username IS NULL OR r.password_hash IS NULL OR ${busyRiderSql}) AS unavailable
         FROM delivery_jobs dj LEFT JOIN riders r ON r.rider_id=dj.rider_id
         WHERE dj.route_plan_id=?`, [routePlanId],
      );
      const jobs = assignment[0];
      if (!jobs || Number(jobs.total) === 0 || Number(jobs.total) !== Number(jobs.distinct_riders) || Number(jobs.unavailable) > 0) {
        throw Object.assign(new Error('Every job needs a distinct available rider before selecting this plan'), { statusCode: 422 });
      }
      // Separate rounds may coexist; snapshot checks prevent duplicated orders and busy checks prevent duplicated riders.
      const snapshot = readSnapshot(plan.input_snapshot);
      if (!snapshot) throw new PlanConflictError('This draft has no input snapshot; calculate a new plan');
      await validateSnapshot(conn, snapshot, toISODate(plan.plan_date));
      await conn.execute('UPDATE delivery_jobs SET assigned_at=UTC_TIMESTAMP() WHERE route_plan_id=?',[routePlanId]);
      await conn.execute('UPDATE route_plans SET status = ? WHERE route_plan_id = ?', ['SELECTED', routePlanId]);
      await conn.execute(
        `UPDATE orders SET status = 'PLANNED' WHERE status = 'PENDING' AND order_id IN
         (SELECT order_id FROM delivery_job_orders WHERE delivery_job_id IN
          (SELECT delivery_job_id FROM delivery_jobs WHERE route_plan_id = ?))`,
        [routePlanId],
      );
      return true;
    });
    if (!updated) return null;
    return this.findFull(routePlanId);
  }

  /** Delete one plan and its jobs/stops; restore pending orders only for a selected plan. */
  static async deleteById(routePlanId: number, draftOnly = false): Promise<boolean> {
    return withTransaction(async (conn) => {
      await lockPlanning(conn);
      const [plans] = await conn.execute<PlanRow[]>(
        'SELECT route_plan_id, status FROM route_plans WHERE route_plan_id = ? FOR UPDATE', [routePlanId]);
      if (!plans[0]) return false;
      if (draftOnly && plans[0].status === 'SELECTED') return false;
      if (plans[0].status === 'SELECTED') {
        const [delivered] = await conn.execute<(RowDataPacket & { count: number })[]>(
          `SELECT COUNT(*) AS count FROM delivery_job_orders djo
           JOIN delivery_jobs dj ON dj.delivery_job_id=djo.delivery_job_id
           JOIN orders o ON o.order_id=djo.order_id
           WHERE dj.route_plan_id=? AND o.status='DELIVERED'`, [routePlanId],
        );
        if (Number(delivered[0]?.count ?? 0) > 0) {
          throw Object.assign(new Error('A plan with completed deliveries cannot be deleted'), { statusCode: 409 });
        }
        await conn.execute(
          `UPDATE orders SET status = 'PENDING' WHERE status IN ('PLANNED','DELIVERING') AND order_id IN
           (SELECT order_id FROM delivery_job_orders WHERE delivery_job_id IN
            (SELECT delivery_job_id FROM delivery_jobs WHERE route_plan_id = ?))`,
          [routePlanId],
        );
      }
      await conn.execute(
        `DELETE djo FROM delivery_job_orders djo JOIN delivery_jobs dj
         ON dj.delivery_job_id=djo.delivery_job_id WHERE dj.route_plan_id=?`, [routePlanId],
      );
      await conn.execute('DELETE FROM delivery_jobs WHERE route_plan_id = ?', [routePlanId]);
      await conn.execute('DELETE FROM route_plans WHERE route_plan_id = ?', [routePlanId]);
      return true;
    });
  }

  private static async mapJob(
    job: JobRow,
    riderIndex: number,
    approximate: boolean,
    snapshot: PlanSnapshot | null = null,
  ): Promise<DeliveryRouteResponse> {
    const [stops] = await getPool().execute<StopRow[]>(STOP_QUERY, [job.delivery_job_id]);
    return toJobResponse(job, stops, riderIndex, approximate, snapshot);
  }
}

const STOP_QUERY = `SELECT jbo.order_id, jbo.stop_sequence, jbo.distance_from_previous_km,
        jbo.travel_time_from_previous_min, jbo.estimated_arrival_time,
        jbo.leg_geometry,
        CASE WHEN o.status='DELIVERED' THEN 'DELIVERED'
             WHEN o.status='DELIVERING' THEN 'DELIVERING' ELSE 'WAITING' END AS delivery_status,
        o.customer_id, o.box_count, c.name AS customer_name, c.phone AS customer_phone,
        c.address AS customer_address, c.latitude AS customer_latitude,
        c.longitude AS customer_longitude
 FROM delivery_job_orders jbo
 JOIN orders o ON o.order_id = jbo.order_id
 JOIN customers c ON c.customer_id = o.customer_id
 WHERE jbo.delivery_job_id = ? ORDER BY jbo.stop_sequence`;

/**
 * Pure summary mapping (DB-free, unit-tested): real persisted metrics, no
 * fake zeros. totalBoxes is passed in — derived from delivery_jobs, since
 * route_plans has no total_boxes column by design (normalized schema).
 */
export function toPlanSummary(
  row: PlanRow,
  totalBoxes: number,
): RoutePlanSummaryResponse {
  return {
    startTime: hhmm(row.start_time),
    deliveryDeadline: readSnapshot(row.input_snapshot)?.window?.deadline ?? readSnapshot(row.input_snapshot)?.shop.deliveryDeadline.slice(0,5),
    routePlanId: row.route_plan_id,
    planDate: toISODate(row.plan_date),
    status: row.status,
    routingSource: (row.routing_source as RoutePlanSummaryResponse['routingSource']) ?? 'ROAD',
    approximate: Boolean(row.approximate),
    riderCount: row.rider_count ?? 0,
    totalDistanceKm: Number(row.total_distance_km ?? 0),
    estimatedFinishTime: hhmm(row.estimated_finish_time),
    totalBoxes,
    totalRevenue: Number(row.total_revenue ?? 0),
    totalFoodCost: Number(row.total_food_cost ?? 0),
    totalDeliveryCost: Number(row.total_delivery_cost ?? 0),
    estimatedProfit: Number(row.estimated_profit ?? 0),
  };
}

/** Pure job mapping (DB-free, unit-tested): stops, customer data, geometry. */
export function toJobResponse(
  job: JobRow,
  stops: StopRow[],
  riderIndex: number,
  approximate: boolean,
  snapshot: PlanSnapshot | null = null,
): DeliveryRouteResponse {
    return {
      acknowledgedAt: job.acknowledged_at instanceof Date ? job.acknowledged_at.toISOString() : job.acknowledged_at ?? null,
      status: job.status === 'ASSIGNED' ? 'WAITING' : job.status === 'DELIVERED' ? 'COMPLETED' : job.status ?? 'WAITING',
      jobId: job.delivery_job_id,
      jobCode: job.job_code,
      riderIndex,
      riderId: job.rider_id,
      totalOrders: job.total_orders,
      totalBoxes: job.total_boxes,
      distanceKm: Number(job.total_distance_km ?? 0),
      durationMinutes: Number(job.estimated_duration_min ?? 0),
      estimatedStartTime: hhmm(job.estimated_start_time),
      estimatedFinishTime: hhmm(job.estimated_finish_time),
      deliveryCost: Number(job.delivery_cost ?? 0),
      geometry: parseGeometry(job.route_geometry),
      approximate,
      stops: stops.map((s): RouteStopResponse => ({
        sequence: s.stop_sequence,
        orderId: s.order_id,
        customerId: s.customer_id,
        customerName: s.customer_name,
        phone: s.customer_phone ?? '',
        address: s.customer_address,
        latitude: Number(s.customer_latitude),
        longitude: Number(s.customer_longitude),
        boxCount: s.box_count,
        distanceFromPreviousKm: Number(s.distance_from_previous_km ?? 0),
        travelTimeFromPreviousMin: Number(s.travel_time_from_previous_min ?? 0),
        estimatedArrivalTime: hhmm(s.estimated_arrival_time),
        deliveryStatus: s.delivery_status,
        geometry: parseGeometry(s.leg_geometry),
        ...snapshot?.stops.find(stop => stop.orderId === s.order_id),
      })),
    };
}

/** "HH:MM" → "HH:MM:SS" for TIME columns; passes through full values. */
function toTime(value: string): string {
  return /^\d{2}:\d{2}$/.test(value) ? `${value}:00` : value;
}

/** TIME/"HH:MM" column → "HH:MM" (empty when unknown). */
function hhmm(value: string | null): string {
  if (!value) return '';
  return String(value).slice(0, 5);
}

function parseGeometry(value: JobRow['route_geometry']): GeoJsonLineString | null {
  if (!value) return null;
  try {
    const parsed = (typeof value === 'string' ? JSON.parse(value) : value) as GeoJsonLineString;
    if (parsed?.type === 'LineString' && Array.isArray(parsed.coordinates)) return parsed;
    return null;
  } catch {
    return null;
  }
}
