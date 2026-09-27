import { describe, expect, it } from 'vitest';
import { parseNearbyQuery, parseSimulationRequest } from '../request-validation';

describe('request validation', () => {
  it('uses the endpoint default radius', () => {
    expect(parseNearbyQuery('16.24', '103.25', undefined, 1)).toEqual({
      lat: 16.24,
      lng: 103.25,
      radiusKm: 1,
    });
  });

  it('rejects invalid coordinates', () => {
    expect(() => parseNearbyQuery('91', '103.25', undefined, 1)).toThrow('lat must be between');
  });

  it('defaults simulation to 25 orders', () => {
    expect(parseSimulationRequest(undefined, undefined)).toEqual({ count: 25, orderDate: undefined });
  });

  it('only accepts 20 to 30 simulated orders', () => {
    expect(() => parseSimulationRequest(19, undefined)).toThrow('between 20 and 30');
    expect(() => parseSimulationRequest(31, undefined)).toThrow('between 20 and 30');
  });
});
