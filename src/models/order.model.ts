import { type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
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

const map = (row: Row): Order => ({
  id: row.order_id,
  customerId: row.customer_id,
  boxes: row.box_count,
  status: row.status,
  orderDate: toISODate(row.order_date),
  isSimulated: Boolean(row.is_simulated),
  createdAt: row.created_at?.toISOString(),
});

export class OrderModel {
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

  static findPending(): Promise<Order[]> {
    return this.findAll({ status: 'PENDING' });
  }

  static async findNearby(lat: number, lng: number, radiusKm: number): Promise<NearbyOrder[]> {
    const [rows] = await getPool().execute<NearbyRow[]>(
      `SELECT o.*, c.name AS customer_name, c.latitude AS customer_latitude,
       c.longitude AS customer_longitude,
       6371 * 2 * ASIN(SQRT(
         POWER(SIN(RADIANS(c.latitude - ?) / 2), 2) +
         COS(RADIANS(?)) * COS(RADIANS(c.latitude)) *
         POWER(SIN(RADIANS(c.longitude - ?) / 2), 2)
       )) AS distance_km
       FROM orders o JOIN customers c ON c.customer_id = o.customer_id
       HAVING distance_km <= ?
       ORDER BY distance_km, o.order_id`,
      [lat, lat, lng, radiusKm],
    );
    return rows.map((row) => ({
      ...map(row),
      customerName: row.customer_name,
      customerLat: Number(row.customer_latitude),
      customerLng: Number(row.customer_longitude),
      distanceKm: Number(row.distance_km),
    }));
  }

  static async findById(id: string): Promise<Order | null> {
    const [rows] = await getPool().execute<Row[]>('SELECT * FROM orders WHERE order_id=?', [id]);
    return rows[0] ? map(rows[0]) : null;
  }

  static async create(input: OrderInput): Promise<Order> {
    const [result] = await getPool().execute<ResultSetHeader>(
      'INSERT INTO orders(customer_id,order_date,box_count,status,is_simulated) VALUES(?,?,?,?,FALSE)',
      [input.customerId, input.orderDate ?? todayLocal(), input.boxes, input.status ?? 'PENDING'],
    );
    return (await this.findById(String(result.insertId)))!;
  }

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

  static async deleteSimulated(): Promise<number> {
    const [result] = await getPool().execute<ResultSetHeader>('DELETE FROM orders WHERE is_simulated=TRUE');
    return result.affectedRows;
  }

  static async update(id: string, input: Partial<OrderInput>): Promise<Order | null> {
    await withTransaction(async conn => {
      await lockPlanning(conn);
      await guardPlanEdit(conn, 'o.order_id=?', [id]);
      await conn.execute(
      'UPDATE orders SET customer_id=COALESCE(?,customer_id),order_date=COALESCE(?,order_date),box_count=COALESCE(?,box_count),status=COALESCE(?,status) WHERE order_id=?',
      [input.customerId ?? null, input.orderDate ?? null, input.boxes ?? null, input.status ?? null, id],
    );
    });
    return this.findById(id);
  }

  static async delete(id: string): Promise<boolean> {
    const [result] = await getPool().execute<ResultSetHeader>('DELETE FROM orders WHERE order_id=?', [id]);
    return result.affectedRows > 0;
  }
}
