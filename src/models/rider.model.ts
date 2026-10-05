import { type ResultSetHeader, type RowDataPacket } from 'mysql2/promise';
import { getPool, withTransaction } from '../database/mysql.connection';
import { lockPlanning } from './plan-inputs';
export type Rider={id:number;name:string;username:string|null;hasPassword:boolean;phone:string|null;isAvailable:boolean};
export type RiderInput={name:string;phone?:string|null;isAvailable?:boolean};
type Row=RowDataPacket&{rider_id:number;rider_name:string;username:string|null;password_hash:string|null;phone:string|null;is_available:number};
const map=(r:Row):Rider=>({id:r.rider_id,name:r.rider_name,username:r.username,hasPassword:Boolean(r.password_hash),phone:r.phone,isAvailable:Boolean(r.is_available)});
export class RiderModel {
 static async findAll():Promise<Rider[]> {const[r]=await getPool().query<Row[]>('SELECT * FROM riders ORDER BY rider_id');return r.map(map);}
 static async findById(id:string):Promise<Rider|null>{const[r]=await getPool().execute<Row[]>('SELECT * FROM riders WHERE rider_id=?',[id]);return r[0]?map(r[0]):null;}
 static async findAvailable():Promise<Rider[]> {
  const[r]=await getPool().query<Row[]>("SELECT * FROM riders WHERE is_available=TRUE AND status='ACTIVE' AND login_enabled=TRUE AND username IS NOT NULL AND password_hash IS NOT NULL ORDER BY rider_id");return r.map(map);
 }
 static async create(i:RiderInput):Promise<Rider>{const[r]=await getPool().execute<ResultSetHeader>('INSERT INTO riders(rider_name,phone,is_available) VALUES(?,?,?)',[i.name,i.phone??null,i.isAvailable??true]);return (await this.findById(String(r.insertId)))!;}
 static async update(id:string,i:Partial<RiderInput>):Promise<Rider|null> {
  await withTransaction(async conn=>{
   await lockPlanning(conn);
   await conn.execute('UPDATE riders SET rider_name=COALESCE(?,rider_name),phone=CASE WHEN ? THEN ? ELSE phone END,is_available=COALESCE(?,is_available) WHERE rider_id=?',[i.name??null,i.phone!==undefined,i.phone??null,i.isAvailable??null,id]);
  });
  return this.findById(id);
 }
 static async delete(id:string):Promise<boolean> {
  return withTransaction(async conn=>{
   await lockPlanning(conn);
   const [rows]=await conn.execute<Row[]>('SELECT rider_id FROM riders WHERE rider_id=? FOR UPDATE',[id]);
   if(!rows.length)return false;
   const [jobs]=await conn.execute<RowDataPacket[]>('SELECT delivery_job_id FROM delivery_jobs WHERE rider_id=? LIMIT 1',[id]);
   if(jobs.length)throw Object.assign(new Error('Cannot delete rider that is referenced by delivery records'),{statusCode:409});
   await conn.execute("DELETE FROM auth_sessions WHERE actor_type='RIDER' AND actor_id=?",[id]);
   const[r]=await conn.execute<ResultSetHeader>('DELETE FROM riders WHERE rider_id=?',[id]);return r.affectedRows>0;
  });
 }
}
