import { describe, expect, it } from 'vitest';
import {
  activeStatusRailSlot,
  summarizeWorldInfo,
  wrapFocusIndex,
  type ChallengeHudStatus,
  type TourHudStatus,
} from '../src/app/CreativeUi';

describe('summarizeWorldInfo', () => {
  it('prefers the tour CTA when a route is available', () => {
    expect(
      summarizeWorldInfo({
        title: 'Moonspire',
        landmarks: [
          { name: 'Gatehouse', found: true },
          { name: 'Bridge', found: false },
        ],
        tourCount: 3,
      }),
    ).toEqual({
      progress: '1 of 2 landmarks discovered.',
      tour: '3-stop guided tour available.',
      primaryAction: 'tour',
    });
  });

  it('falls back to explore when there is no guided tour', () => {
    expect(
      summarizeWorldInfo({
        title: 'Plain',
        landmarks: [],
        tourCount: 1,
      }),
    ).toEqual({
      progress: 'No landmarks tracked yet.',
      tour: 'No guided tour available.',
      primaryAction: 'explore',
    });
  });
});

describe('activeStatusRailSlot', () => {
  const challenge: ChallengeHudStatus = {
    name: 'Trial',
    distance: 6,
    index: 0,
    total: 3,
    elapsed: '00:12',
  };
  const tour: TourHudStatus = {
    name: 'Gate',
    distance: 8,
    index: 1,
    total: 4,
    done: false,
  };

  it('shows loading before other HUD states', () => {
    expect(
      activeStatusRailSlot({
        loadingText: 'Building the world',
        challenge,
        tour,
        waypoint: { angleRad: 1, distance: 12 },
      }),
    ).toBe('loading');
  });

  it('falls through challenge, tour, then waypoint', () => {
    expect(
      activeStatusRailSlot({
        loadingText: undefined,
        challenge,
        tour,
        waypoint: { angleRad: 1, distance: 12 },
      }),
    ).toBe('challenge');
    expect(
      activeStatusRailSlot({
        loadingText: undefined,
        challenge: undefined,
        tour,
        waypoint: { angleRad: 1, distance: 12 },
      }),
    ).toBe('tour');
    expect(
      activeStatusRailSlot({
        loadingText: undefined,
        challenge: undefined,
        tour: undefined,
        waypoint: { angleRad: 1, distance: 12 },
      }),
    ).toBe('waypoint');
  });
});

describe('wrapFocusIndex', () => {
  it('wraps forward and backward through the focus list', () => {
    expect(wrapFocusIndex(2, 3, 1)).toBe(0);
    expect(wrapFocusIndex(0, 3, -1)).toBe(2);
  });

  it('chooses the edge element when focus starts outside the trap', () => {
    expect(wrapFocusIndex(-1, 4, 1)).toBe(0);
    expect(wrapFocusIndex(-1, 4, -1)).toBe(3);
  });
});
