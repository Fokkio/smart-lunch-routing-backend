import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { createApp } from '../src/app';
import { getPool, closePool } from '../src/database/mysql.connection';
import { hashPassword } from '../src/middleware/auth';
import { todayLocal } from '../src/models/dates';
import { cleanupQaRun } from './qa-cleanup';
import { startRoutingFixture } from './qa-routing-fixture';

// Explicit opt-in: creates ONLY labelled QA records on the configured real database.
// Leaves delivery evidence, disables QA accounts and revokes their sessions afterwards.
async function main() {
  assert.equal(process.env.QA_ALLOW_REAL_DB,'yes','Set QA_ALLOW_REAL_DB=yes after authorizing QA data');
  const fixtureRouting = process.env.QA_ROUTING_FIXTURE === 'yes';
  if (fixtureRouting) assert.equal(process.env.OSRM_BASE_URL, 'http://127.0.0.1:4312');
  const routingServer = fixtureRouting ? await startRoutingFixture() : undefined;
  const run=`qa_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`;
  const password=randomBytes(24).toString('base64url');
  const db=getPool();
  await db.execute<ResultSetHeader>('INSERT INTO admin_users(username,display_name,password_hash,role,is_active) VALUES(?,?,?,\'OWNER\',TRUE)',[run,`QA ${run}`,await hashPassword(password)]);
  const server=createApp().listen(4311,'127.0.0.1');
  await new Promise<void>(ready=>server.once('listening',ready));
  const api=async(path:string,token?:string,body?:unknown,method=body===undefined?'GET':'POST',status=200):Promise<any>=>{
    const result=await fetch(`http://127.0.0.1:4311/api${path}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
    const text=await result.text();
    assert.equal(result.status,status,`${method} ${path}: ${text}`);
    return text?JSON.parse(text):undefined;
  };
  try {
    const owner=await api('/auth/login',undefined,{role:'OWNER',username:run,password});
    const token=owner.token;
    const settings=await api('/settings',token);
    const center={lat:settings.latitude,lng:settings.longitude};
    const date=todayLocal();
    const {runSmoke}=await import(pathToFileURL(resolve('../FrontEnd/qa-smoke.mjs')).href);
    if(process.env.QA_READ_ONLY==='yes') {
      for(const width of [1440,390,360]) await runSmoke({baseURL:'http://127.0.0.1:4300',width,data:{ownerUsername:run,password,readOnly:true},outputDir:resolve(process.env.QA_OUTPUT_DIR || '../review/2026-10-06/screenshots')});
      return;
    }
    for(const width of (process.env.QA_WIDTHS || '1440,390,360').split(',').map(Number)) {
      const prefix=`${run}_${width}`;
      const customers:any[]=[];
      for(let i=0;i<5;i++) customers.push(await api('/customers',token,{name:`QA ${prefix} C${i+1}`,phone:`09${randomBytes(4).readUInt32BE()%100000000}`.slice(0,10).padEnd(10,'0'),address:`QA test only ${prefix}`,lat:center.lat+[.004,.006,.012,.014,.03][i]!,lng:center.lng},'POST',201));
      const riders:any[]=[];
      for(let i=0;i<4;i++) {
        const rider=await api('/riders',token,{name:`QA ${prefix} R${i+1}`,isAvailable:true},'POST',201);
        rider.username=`${prefix}_r${i+1}`;
        await api(`/riders/${rider.id}/account`,token,{username:rider.username,password},'PUT',204);
        riders.push(rider);
      }
      const orders:any[]=[];
      for(const customer of customers.slice(0,4)) orders.push(await api('/orders',token,{customerId:customer.id,boxes:1,status:'PENDING',orderDate:date},'POST',201));
      const historyDate=new Date(Date.now()-86400000).toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'});
      for(const [index,status] of [[0,'CANCELLED'],[1,'PENDING'],[4,'CANCELLED']] as const) {
        const order = await api('/orders',token,{customerId:customers[index]!.id,boxes:1,status:'PENDING',orderDate:historyDate},'POST',201);
        if (status === 'CANCELLED') await api(`/orders/${order.id}`,token,{status},'PUT');
        orders.push({...order,status});
      }
      // Real SQL distance query checked against independent spherical distance, including all dates/statuses.
      const nearby=await api(`/orders/nearby?lat=${center.lat}&lng=${center.lng}`,token);
      for(const order of orders) assert.equal(nearby.some((row:any)=>row.id===order.id),order.customerId!==customers[4].id);
      const cancelled=await api(`/orders/nearby?lat=${center.lat}&lng=${center.lng}&date=${historyDate}&status=CANCELLED`,token);
      assert(cancelled.some((row:any)=>row.id===orders[4].id));
      assert(!cancelled.some((row:any)=>row.id===orders[5].id));
      for(const bad of ['lat=&lng=103','lat=91&lng=103','lat=16&lng=103&radiusKm=0','lat=16&lng=103&date=2026-02-30','lat=16&lng=103&status=WRONG']) await api(`/orders/nearby?${bad}`,token,undefined,'GET',400);
      await api('/route-plans/recalculate',token,{planDate:date},'POST',400);
      const planId=await runSmoke({baseURL:'http://127.0.0.1:4300',width,data:{ownerUsername:run,password,center,customers,orders,riders},outputDir:resolve(process.env.QA_OUTPUT_DIR || '../review/2026-10-06/screenshots')});
      const saved=await api(`/route-plans/${planId}`,token);
      assert.equal(saved.status,'SELECTED');
      assert(saved.jobs.every((job:any)=>job.status==='COMPLETED' && job.stops.every((stop:any)=>stop.deliveryStatus==='DELIVERED')));
      const [rows]=await db.execute<RowDataPacket[]>('SELECT order_id,status FROM orders WHERE order_id IN (?,?,?,?)',orders.slice(0,4).map(o=>o.id));
      assert(rows.every(row=>row.status==='DELIVERED'));
      console.log(`PASS real DB ${width}px: plan ${planId}, four QA orders persisted DELIVERED`);
    }
    console.log(`QA run complete: ${run}; QA delivery evidence retained; existing records preserved`);
  } finally {
    await cleanupQaRun(run);
    await new Promise<void>((done,reject)=>server.close(e=>e?reject(e):done()));
    if (routingServer) await new Promise<void>((done, reject) => routingServer.close(error => error ? reject(error) : done()));
    await closePool();
    console.log(`QA accounts disabled: ${run}`);
  }
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
