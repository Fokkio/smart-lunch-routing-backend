import { createServer } from 'node:http';
import { haversineKmBetween } from '../src/domain/routing/haversine-distance-calculator';

/** External OSRM test double: all coordinates stay on loopback; NOT real road evidence. */
export async function startRoutingFixture() {
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url!, 'http://127.0.0.1:4312');
      const pairs = url.pathname.split('/').at(-1)!.split(';').map(pair => pair.split(',').map(Number));
      const points = pairs.map(([longitude, latitude]) => ({ latitude, longitude }));
      const km = (a: number, b: number) => haversineKmBetween(points[a], points[b]);
      const geometry = (coordinates: number[][]) => ({ type: 'LineString', coordinates });
      const legs = points.slice(1).map((_, index) => ({ distance: km(index, index + 1) * 1000, duration: km(index, index + 1) * 120,
        steps: [{ geometry: geometry([pairs[index], pairs[index + 1]]) }] }));
      const body = url.pathname.startsWith('/table/') ? { code: 'Ok',
        distances: points.map((_, a) => points.map((_, b) => km(a, b) * 1000)),
        durations: points.map((_, a) => points.map((_, b) => km(a, b) * 120)),
      } : { code: 'Ok', routes: [{ distance: legs.reduce((sum, leg) => sum + leg.distance, 0), duration: legs.reduce((sum, leg) => sum + leg.duration, 0), geometry: geometry(pairs), legs }] };
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body));
    } catch { res.writeHead(400); res.end('{}'); }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(4312, '127.0.0.1', resolve); });
  return server;
}
