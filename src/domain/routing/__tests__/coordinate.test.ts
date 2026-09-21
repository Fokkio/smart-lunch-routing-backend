import { describe, expect, it } from 'vitest';
import { validateCoordinate, type Coordinate } from '../coordinate';
import { InvalidCoordinateError } from '../distance.errors';

describe('validateCoordinate', () => {
  it('accepts a valid coordinate', () => {
    expect(() =>
      validateCoordinate({ latitude: 16.24631, longitude: 103.25286 }),
    ).not.toThrow();
  });

  it.each([
    { latitude: -90, longitude: 0 },
    { latitude: 90, longitude: 0 },
    { latitude: 0, longitude: -180 },
    { latitude: 0, longitude: 180 },
    { latitude: -90, longitude: -180 },
    { latitude: 90, longitude: 180 },
  ])('accepts legal boundary coordinate %o', (coordinate: Coordinate) => {
    expect(() => validateCoordinate(coordinate)).not.toThrow();
  });

  it.each([91, -91, 100, -100])(
    'rejects latitude %s outside [-90, 90]',
    (latitude: number) => {
      expect(() => validateCoordinate({ latitude, longitude: 0 })).toThrow(
        InvalidCoordinateError,
      );
    },
  );

  it.each([181, -181, 360, -360])(
    'rejects longitude %s outside [-180, 180]',
    (longitude: number) => {
      expect(() => validateCoordinate({ latitude: 0, longitude })).toThrow(
        InvalidCoordinateError,
      );
    },
  );

  it.each([
    { latitude: Number.NaN, longitude: 0 },
    { latitude: 0, longitude: Number.NaN },
    { latitude: Number.POSITIVE_INFINITY, longitude: 0 },
    { latitude: 0, longitude: Number.POSITIVE_INFINITY },
    { latitude: Number.NEGATIVE_INFINITY, longitude: 0 },
    { latitude: 0, longitude: Number.NEGATIVE_INFINITY },
  ])('rejects non-finite coordinate %o without producing NaN km', (coordinate: Coordinate) => {
    expect(() => validateCoordinate(coordinate)).toThrow(InvalidCoordinateError);
  });
});
