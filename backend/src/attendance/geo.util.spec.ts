import { haversineDistanceMeters } from './geo.util';

describe('haversineDistanceMeters', () => {
  it('returns ~0 for the same point', () => {
    const d = haversineDistanceMeters({ lat: 12.9716, lng: 77.5946 }, { lat: 12.9716, lng: 77.5946 });
    expect(d).toBeLessThan(1);
  });

  it('returns roughly the correct distance for two known points', () => {
    // Roughly 111km apart (1 degree of latitude)
    const d = haversineDistanceMeters({ lat: 12.9716, lng: 77.5946 }, { lat: 13.9716, lng: 77.5946 });
    expect(d).toBeGreaterThan(110000);
    expect(d).toBeLessThan(112000);
  });
});
