// ไฟล์นี้: SQL ของตารางออเดอร์ รวมถึงออเดอร์จำลอง และการป้องกันไม่ให้ลบออเดอร์ที่อยู่ในแผนที่ยืนยันแล้ว
import { type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/mysql.connection';
import { toISODate, todayLocal } from './dates';
import { guardPlanEdit, lockPlanning } from './plan-inputs';

export type OrderStatus = 'PENDING' | 'PLANNED' | 'DELIVERING' | 'DELIVERED' | 'CANCELLED';
export type Order = {
  id: number;
  customerId: number;
  boxes: number;
  status: OrderStatus;
  orderDate: string;
  isSimulated: boolean;
  createdAt?: string;
};
export type NearbyOrder = Order & {
  customerName: string;
  customerLat: number;
  customerLng: number;
  distanceKm: number;
};
export type OrderInput = {
  customerId: number;
  boxes: number;
  status?: OrderStatus;
  orderDate?: string;
};
export type OrderFilter = { date?: string; status?: string; customerId?: string };

type Row = RowDataPacket & {
  order_id: number;
  customer_id: number;
  box_count: number;
  status: OrderStatus;
  order_date: string | Date;
  is_simulated: number | boolean;
  created_at: Date;
};
type CustomerIdRow = RowDataPacket & { customer_id: number };
type NearbyRow = Row & {
  customer_name: string;
  customer_latitude: number;
  customer_longitude: number;
  distance_km: number;
};

// แปลงแถวออเดอร์จากฐานข้อมูลให้เป็น object ออเดอร์ที่ใช้ในโค้ด
const map = (row: Row): Order => ({
  id: row.order_id,
  customerId: row.customer_id,
  boxes: row.box_count,
  status: row.status,
  orderDate: toISODate(row.order_date),
  isSimulated: Boolean(row.is_simulated),
  createdAt: row.created_at?.toISOString(),
});

// คลาส SQL ของตารางออเดอร์
export class OrderModel {
// ดึงออเดอร์ทั้งหมด กรองตามวันที่ สถานะ และลูกค้าได้ เรียงตามวันที่และ id จากมากไปน้อย
  static async findAll(filter: OrderFilter = {}): Promise<Order[]> {
    const where: string[] = [];
    const values: string[] = [];
    if (filter.date) { where.push('order_date=?'); values.push(filter.date); }
    if (filter.status) { where.push('status=?'); values.push(filter.status.toUpperCase()); }
    if (filter.customerId) { where.push('customer_id=?'); values.push(filter.customerId); }
    const [rows] = await getPool().execute<Row[]>(
      `SELECT * FROM orders ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY order_date DESC,order_id DESC`,
      values,
    );
    return rows.map(map);
  }

// ดึงออเดอร์ที่ยังค้างส่ง (PENDING) ทั้งหมด
  static findPending(): Promise<Order[]> {
    return this.findAll({ status: 'PENDING' });
  }

// ดึงออเดอร์ที่อยู่ในรัศมีที่กำหนด: คำนวณระยะทาง haversine ใน SQL พร้อมชื่อและพิกัดลูกค้า เรียงจากใกล้ไปไกล
  static async findNearby(lat: number, lng: number, radiusKm: number, filter: OrderFilter = {}): Promise<NearbyOrder[]> {
    const where: string[] = [];
    const values: (number | string)[] = [lat, lat, lng];
    if (filter.date) { where.push('o.order_date=?'); values.push(filter.date); }
    if (filter.status) { where.push('o.status=?'); values.push(filter.status); }
    values.push(radiusKm);
    const [rows] = await getPool().execute<NearbyRow[]>(
      `SELECT o.*, c.name AS customer_name, c.latitude AS customer_latitude,
       c.longitude AS customer_longitude,
       6371 * 2 * ASIN(SQRT(
         POWER(SIN(RADIANS(c.latitude - ?) / 2), 2) +
         COS(RADIANS(?)) * COS(RADIANS(c.latitude)) *
         POWER(SIN(RADIANS(c.longitude - ?) / 2), 2)
       )) AS distance_km
       FROM orders o JOIN customers c ON c.customer_id = o.customer_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       HAVING distance_km <= ?
       ORDER BY distance_km, o.order_id`,
      values,
    );
    return rows.map((row) => ({
      ...map(row),
      customerName: row.customer_name,
      customerLat: Number(row.customer_latitude),
      customerLng: Number(row.customer_longitude),
      distanceKm: Number(row.distance_km),
    }));
  }

// ดึงออเดอร์เดียวตาม id ถ้าไม่เจอคืน null
  static async findById(id: string): Promise<Order | null> {
    const [rows] = await getPool().execute<Row[]>('SELECT * FROM orders WHERE order_id=?', [id]);
    return rows[0] ? map(rows[0]) : null;
  }

// เพิ่มออเดอร์ใหม่: วันที่ว่างใช้วันนี้ สถานะว่างใช้ PENDING แล้วดึงแถวที่สร้างกลับมา
  static async create(input: OrderInput): Promise<Order> {
    const [result] = await getPool().execute<ResultSetHeader>(
      'INSERT INTO orders(customer_id,order_date,box_count,status,is_simulated) VALUES(?,?,?,?,FALSE)',
      [input.customerId, input.orderDate ?? todayLocal(), input.boxes, input.status ?? 'PENDING'],
    );
    return (await this.findById(String(result.insertId)))!;
  }

// สร้างออเดอร์จำลอง: วนลูกค้าทั้งหมดตามลำดับ กล่องวน 1-3 กล่อง สถานะ PENDING และติดป้ายจำลอง
  static async createSimulated(count: number, orderDate: string): Promise<Order[]> {
    const ids = await withTransaction(async (connection) => {
      const [customers] = await connection.query<CustomerIdRow[]>(
        'SELECT customer_id FROM customers ORDER BY customer_id',
      );
      if (customers.length === 0) {
        throw Object.assign(new Error('Create at least one customer before simulating orders'), { statusCode: 422 });
      }
      const insertedIds: number[] = [];
      for (let index = 0; index < count; index += 1) {
        const customerId = customers[index % customers.length]!.customer_id;
        const [result] = await connection.execute<ResultSetHeader>(
          'INSERT INTO orders(customer_id,order_date,box_count,status,is_simulated) VALUES(?,?,?,\'PENDING\',TRUE)',
          [customerId, orderDate, (index % 3) + 1],
        );
        insertedIds.push(result.insertId);
      }
      return insertedIds;
    });
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await getPool().execute<Row[]>(
      `SELECT * FROM orders WHERE order_id IN (${placeholders}) ORDER BY order_id`,
      ids,
    );
    return rows.map(map);
  }

  /**
   * ล้างออเดอร์จำลองเป็นชุดแบบ all-or-nothing
   * รอบที่ยืนยันแล้ว (SELECTED) ยังห้ามลบ (409) แต่รอบฉบับร่าง (GENERATED/REJECTED)
   * ที่อ้างถึงจะถูกล้างซ้ำอัตโนมัติ เส้นทางร่างจะถูกคำนวณใหม่อยู่แล้ว
   */
// ลบออเดอร์จำลองเป็นชุดใน transaction เดียว: ห้ามลบถ้าอยู่ในแผนที่ยืนยันแล้ว แต่ล้างการอ้างอิงจากแผนฉบับร่างก่อน
  static async deleteSimulated(orderIds: number[]): Promise<number> {
    return withTransaction(async (conn) => {
      await lockPlanning(conn);
      const placeholders = orderIds.map(() => '?').join(',');
      const [existing] = await conn.execute<Row[]>(
        `SELECT * FROM orders WHERE is_simulated=TRUE AND order_id IN (${placeholders}) FOR UPDATE`,
        orderIds,
      );
      const existingIds = existing.map(row => row.order_id);
      if (!existingIds.length) return 0;
      await guardConfirmedPlanReference(conn, existingIds);
      await discardDraftReferences(conn, existingIds);
      const [result] = await conn.execute<ResultSetHeader>(
        `DELETE FROM orders WHERE is_simulated=TRUE AND order_id IN (${existingIds.map(() => '?').join(',')})`,
        existingIds,
      );
      return result.affectedRows;
    });
  }

// แก้ไขออเดอร์: ล็อกตอนวางแผน กันการแก้ข้อมูลที่อยู่ในแผนที่ยืนยันแล้ว และออเดอร์ที่ส่งแล้วแก้ได้ผ่านใบงานเท่านั้น
  static async update(id: string, input: Partial<OrderInput>): Promise<Order | null> {
    await withTransaction(async conn => {
      await lockPlanning(conn);
      await guardPlanEdit(conn, 'o.order_id=?', [id]);
      const [rows] = await conn.execute<Row[]>('SELECT * FROM orders WHERE order_id=? FOR UPDATE', [id]);
      if (rows[0] && !['PENDING', 'CANCELLED'].includes(rows[0].status)) {
        throw Object.assign(new Error('Delivery orders must be changed through their delivery job'), { statusCode: 409 });
      }
      await conn.execute(
      'UPDATE orders SET customer_id=COALESCE(?,customer_id),order_date=COALESCE(?,order_date),box_count=COALESCE(?,box_count),status=COALESCE(?,status) WHERE order_id=?',
      [input.customerId ?? null, input.orderDate ?? null, input.boxes ?? null, input.status ?? null, id],
    );
    });
    return this.findById(id);
  }

  /**
   * ลบออเดอร์รายการเดียว: ล้างการอ้างอิงจากรอบฉบับร่าง (GENERATED/REJECTED)
   * ที่อ้างถึงให้ก่อน — รอบเหล่านี้ถูกคำนวณใหม่อยู่แล้ว — แต่ยังห้ามลบ
   * ออเดอร์ที่อยู่ในรอบที่ยืนยันแล้ว (SELECTED) เพื่อรักษาประวัติการจัดส่ง
   */
// ลบออเดอร์เดียว: ห้ามลบถ้าอยู่ในแผนที่ยืนยันแล้ว แต่ล้างการอ้างอิงจากแผนฉบับร่างก่อน แล้วคืนว่าได้ลบจริงหรือไม่
  static async delete(id: string): Promise<boolean> {
    return withTransaction(async (conn) => {
      await lockPlanning(conn);
      const [orderRows] = await conn.execute<Row[]>('SELECT * FROM orders WHERE order_id=? FOR UPDATE', [id]);
      if (!orderRows[0]) return false;
      await guardConfirmedPlanReference(conn, [Number(id)]);
      await discardDraftReferences(conn, [Number(id)]);
      const [result] = await conn.execute<ResultSetHeader>('DELETE FROM orders WHERE order_id=?', [id]);
      return result.affectedRows > 0;
    });
  }
}

/** ออเดอร์ที่อยู่ในแผนยืนยันแล้วจะลบไม่ได้ — ตอบ 409 ตามเดิม */
// กันการลบ: ถ้าออเดอร์อยู่ในแผนที่ยืนยันแล้วโยน error 409
async function guardConfirmedPlanReference(conn: PoolConnection, orderIds: number[]): Promise<void> {
  const placeholders = orderIds.map(() => '?').join(',');
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT 1 FROM route_plans rp
     JOIN delivery_jobs dj ON dj.route_plan_id=rp.route_plan_id
     JOIN delivery_job_orders djo ON djo.delivery_job_id=dj.delivery_job_id
     WHERE djo.order_id IN (${placeholders}) AND rp.status='SELECTED' LIMIT 1`,
    orderIds,
  );
  if (rows.length) {
    throw Object.assign(new Error('Cannot delete order that is part of a delivery plan'), {
      statusCode: 409,
    });
  }
}

/** ล้างการอ้างอิงของออเดอร์ออกจากรอบฉบับร่าง และตัดใบงานร่างที่เหลือ 0 ออเดอร์ทิ้ง */
// ล้างการอ้างอิงของออเดอร์ออกจากแผนฉบับร่าง และตัดใบงานร่างที่เหลือ 0 ออเดอร์ทิ้ง
async function discardDraftReferences(conn: PoolConnection, orderIds: number[]): Promise<void> {
  const placeholders = orderIds.map(() => '?').join(',');
  await conn.execute(
    `DELETE djo FROM delivery_job_orders djo
     JOIN delivery_jobs dj ON dj.delivery_job_id=djo.delivery_job_id
     JOIN route_plans rp ON rp.route_plan_id=dj.route_plan_id
     WHERE djo.order_id IN (${placeholders}) AND rp.status IN ('GENERATED','REJECTED')`,
    orderIds,
  );
  await conn.execute(
    `DELETE dj FROM delivery_jobs dj
     JOIN route_plans rp ON rp.route_plan_id=dj.route_plan_id
     WHERE rp.status IN ('GENERATED','REJECTED')
       AND NOT EXISTS (SELECT 1 FROM delivery_job_orders djo WHERE djo.delivery_job_id=dj.delivery_job_id)`,
    [],
  );
}
