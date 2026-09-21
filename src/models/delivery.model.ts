// TODO:
// Delivery persistence schema is still open (no deliveries table exists in
// the frontend demo — the plan lives in localStorage). SQL below assumes a
// minimal `deliveries` table; confirm/adjust against Aiven before use.
//
// What is needed:
// - Confirm deliveries/assignments table design (columns for rider,
//   order list, stop order, plan version) with the project owner.

import { getPool } from '../database/mysql.connection';

export interface Delivery {
  id: string;
  riderId: string;
  orderIds: string[];
  createdAt: string;
}

function noDb<T>(method: string): T {
  throw new Error(
    `[DeliveryModel.${method}] Database not configured — set DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME.`,
  );
}

export class DeliveryModel {
  static async create(input: Omit<Delivery, 'id' | 'createdAt'>): Promise<Delivery> {
    const pool = getPool();
    if (!pool) return noDb('create');
    const delivery: Delivery = {
      ...input,
      id: `DLV-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    await pool.query('INSERT INTO deliveries (id, rider_id, created_at) VALUES (?, ?, ?)', [
      delivery.id,
      delivery.riderId,
      delivery.createdAt,
    ]);
    // TODO: persist orderIds/stop order in a join table once schema is confirmed.
    return delivery;
  }

  static async findById(id: string): Promise<Delivery | null> {
    const pool = getPool();
    if (!pool) return noDb('findById');
    const [rows] = await pool.query('SELECT * FROM deliveries WHERE id = ?', [id]);
    const list = rows as Delivery[];
    return list[0] ?? null;
  }

  // TODO: implement once the assignment/join-table schema is confirmed.
  static async saveAssignment(_deliveryId: string, _orderIds: string[]): Promise<void> {
    return noDb('saveAssignment');
  }

  // TODO: implement rider job-sheet lookup once schema is confirmed.
  static async findRiderJob(_riderId: string): Promise<Delivery[]> {
    return noDb('findRiderJob');
  }
}
