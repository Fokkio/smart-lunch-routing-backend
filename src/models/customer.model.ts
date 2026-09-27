import { type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { getPool } from '../database/mysql.connection';

export type Customer = {
  id: number;
  name: string;
  phone: string;
  address: string | null;
  lat: number;
  lng: number;
  createdAt?: string;
};

export type CustomerWithDistance = Customer & { distanceKm: number };
export type CustomerInput = {
  name: string;
  phone: string;
  address?: string | null;
  lat: number;
  lng: number;
};

type Row = RowDataPacket & {
  customer_id: number;
  name: string;
  phone: string;
  address: string | null;
  latitude: number;
  longitude: number;
  created_at: Date;
};
type NearbyRow = Row & { distance_km: number };

const map = (row: Row): Customer => ({
  id: row.customer_id,
  name: row.name,
  phone: row.phone,
  address: row.address,
  lat: Number(row.latitude),
  lng: Number(row.longitude),
  createdAt: row.created_at?.toISOString(),
});

export class CustomerModel {
  static async findAll(): Promise<Customer[]> {
    const [rows] = await getPool().query<Row[]>('SELECT * FROM customers ORDER BY customer_id DESC');
    return rows.map(map);
  }

  static async searchByName(query: string): Promise<Customer[]> {
    const [rows] = await getPool().execute<Row[]>(
      'SELECT * FROM customers WHERE name LIKE ? ORDER BY name, customer_id',
      [`%${query}%`],
    );
    return rows.map(map);
  }

  static async searchNearby(lat: number, lng: number, radiusKm: number): Promise<CustomerWithDistance[]> {
    const [rows] = await getPool().execute<NearbyRow[]>(
      `SELECT c.*,
       6371 * 2 * ASIN(SQRT(
         POWER(SIN(RADIANS(c.latitude - ?) / 2), 2) +
         COS(RADIANS(?)) * COS(RADIANS(c.latitude)) *
         POWER(SIN(RADIANS(c.longitude - ?) / 2), 2)
       )) AS distance_km
       FROM customers c
       HAVING distance_km <= ?
       ORDER BY distance_km, customer_id`,
      [lat, lat, lng, radiusKm],
    );
    return rows.map((row) => ({ ...map(row), distanceKm: Number(row.distance_km) }));
  }

  static async findById(id: string): Promise<Customer | null> {
    const [rows] = await getPool().execute<Row[]>('SELECT * FROM customers WHERE customer_id = ?', [id]);
    return rows[0] ? map(rows[0]) : null;
  }

  static async findByPhone(phone: string): Promise<Customer | null> {
    const [rows] = await getPool().execute<Row[]>('SELECT * FROM customers WHERE phone = ? LIMIT 1', [phone]);
    return rows[0] ? map(rows[0]) : null;
  }

  static async create(input: CustomerInput): Promise<Customer> {
    const [result] = await getPool().execute<ResultSetHeader>(
      'INSERT INTO customers (name,phone,address,latitude,longitude) VALUES (?,?,?,?,?)',
      [input.name, input.phone, input.address ?? null, input.lat, input.lng],
    );
    return (await this.findById(String(result.insertId)))!;
  }

  static async update(id: string, input: Partial<CustomerInput>): Promise<Customer | null> {
    await getPool().execute(
      'UPDATE customers SET name=COALESCE(?,name),phone=COALESCE(?,phone),address=COALESCE(?,address),latitude=COALESCE(?,latitude),longitude=COALESCE(?,longitude) WHERE customer_id=?',
      [input.name ?? null, input.phone ?? null, input.address ?? null, input.lat ?? null, input.lng ?? null, id],
    );
    return this.findById(id);
  }

  static async delete(id: string): Promise<boolean> {
    const [result] = await getPool().execute<ResultSetHeader>('DELETE FROM customers WHERE customer_id=?', [id]);
    return result.affectedRows > 0;
  }
}
