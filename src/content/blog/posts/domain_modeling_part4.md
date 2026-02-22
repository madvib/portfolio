---
id: domain-modeling-part4
title: "Part 4: Queries - Derived State and View Logic"
date: "2026-01-22"
excerpt: "Separating state from interpretation is key to a robust domain. Learn how to build pure query functions for consistent view logic."
readTime: "5 min read"
tags:
  - typescript
  - domain-modeling
  - cqrs
series: Domain Modeling in TypeScript
seriesPart: 4
---

# Domain Modeling in TypeScript: A Practical Guide

## Part 4: Queries - Derived State and View Logic

*This is Part 4 of a 5-part series on domain modeling in TypeScript. [Read Part 3: Deriving Types from Validation Schemas](/blog/domain-modeling-part3) | [Part 5: Test Data Architecture](/blog/domain-modeling-part5) next.*

---

In most applications, business logic ends up scattered across service layers, view models, and UI components. Want to know if a user's workout streak is active? That logic might live in three places, implemented three different ways.

**Queries** solve this by centralizing all derived state computation in your domain layer.

## The Problem: Scattered Logic

Business logic that should live in the domain ends up elsewhere:

- In API controllers calculating derived values
- In React components doing the same calculations
- In service layers mixing reads and writes
- In multiple places with slight variations

This leads to inconsistencies, bugs, and hard-to-maintain code.

## The Solution: Domain Queries

Queries are pure functions that derive state from your domain entities:

```typescript
// domain/user-profile.queries.ts

// Simple derived value
export function getDaysSinceLastWorkout(stats: UserStats): number | null {
  if (!stats.lastWorkoutDate) return null;
  
  const now = new Date();
  return Math.floor((now.getTime() - stats.lastWorkoutDate.getTime()) / dayMs);
}

// Boolean derived from entity + preferences
export function shouldReceiveCheckIn(
  profile: UserProfile,
  frequency: UserProfile['preferences']['coaching']['checkInFrequency']
): boolean {
  if (frequency === 'never') return false;
  
  const daysSince = getDaysSinceLastWorkout(profile.stats);
  if (daysSince === null) return true;
  
  switch (frequency) {
    case 'daily': return daysSince >= 1;
    case 'weekly': return daysSince >= 7;
    case 'biweekly': return daysSince >= 14;
  }
}
```

Key characteristics:
- **Pure functions** - no side effects, same input = same output
- **Take domain entities** - work with your branded types
- **Return primitives or derived objects** - not other domain entities
- **Testable** - no mocking needed

## Organizing Queries

### Entity-Level Queries

Queries directly on the entity module:

```typescript
// user-profile.queries.ts
export function getMemberSinceDays(profile: UserProfile): number {
  const now = new Date();
  return Math.floor((now.getTime() - profile.createdAt.getTime()) / dayMs);
}

export function isStreakActive(profile: UserProfile): boolean {
  const days = getDaysSinceLastWorkout(profile.stats);
  return days !== null && days <= 1;
}
```

### Value Object Queries

For complex nested objects, keep queries co-located:

```typescript
// user-stats.queries.ts
export const UserStatsQueries = {
  isStreakActive(stats: UserStats): boolean {
    const days = getDaysSinceLastWorkout(stats);
    return days !== null && days <= 1;
  },
  
  getDaysSinceLastWorkout(stats: UserStats): number | null {
    if (!stats.lastWorkoutDate) return null;
    const now = new Date();
    return Math.floor((now.getTime() - stats.lastWorkoutDate.getTime()) / dayMs);
  },
  
  getAverageWorkoutDuration(stats: UserStats): number {
    if (stats.totalWorkouts === 0) return 0;
    return Math.round(stats.totalMinutes / stats.totalWorkouts);
  },
};
```

### Namespace Exports

Group related queries:

```typescript
// sync-health.queries.ts
export const SyncHealthQueries = {
  isSyncHealthy(status: SyncStatus): boolean {
    const hours = getHoursSinceLastSync(status);
    return hours !== null && hours < 24;
  },
  
  getHoursSinceLastSync(status: SyncStatus): number | null {
    if (!status.lastSyncAt) return null;
    return Math.floor((Date.now() - status.lastSyncAt.getTime()) / hourMs);
  },
  
  needsCredentialRefresh(credentials: ServiceCredentials): boolean {
    if (!credentials.expiresAt) return false;
    const hoursUntil = (credentials.expiresAt.getTime() - Date.now()) / hourMs;
    return hoursUntil < 24;
  },
};
```

## Queries Power Views

Views use queries to add computed fields:

```typescript
// user-profile.view.ts
export function toUserProfileView(profile: UserProfile): UserProfileView {
  return {
    ...serializeForView(profile),
    
    // Queries provide computed fields
    memberSinceDays: getMemberSinceDays(profile),
    isStreakActive: isStreakActive(profile),
    daysSinceLastWorkout: getDaysSinceLastWorkout(profile.stats),
    shouldReceiveCheckIn: shouldReceiveCheckIn(
      profile, 
      profile.preferences.coaching.checkInFrequency
    ),
  };
}
```

This ensures views are consistent—everywhere the same query is used, the same logic applies.

## Commands vs Queries

Commands mutate state, queries derive it:

```typescript
// Command - returns new entity
function recordWorkoutCompleted(
  profile: UserProfile, 
  workout: WorkoutData
): UserProfile {
  return {
    ...profile,
    stats: {
      ...profile.stats,
      totalWorkouts: profile.stats.totalWorkouts + 1,
      lastWorkoutDate: workout.date,
      // ... more mutations
    },
  };
}

// Query - returns derived value
function getDaysSinceLastWorkout(stats: UserStats): number | null {
  if (!stats.lastWorkoutDate) return null;
  // ...
}
```

Both are pure functions in the domain layer. The distinction is:
- **Commands** - take entity + input, return new entity
- **Queries** - take entity (or subset), return derived value

## Testing Queries

Queries are trivial to test—no mocking required:

```typescript
describe('shouldReceiveCheckIn', () => {
  it('returns true for never-worked-out users', () => {
    const profile = createUserProfileFixture({
      stats: createUserStatsFixture({ lastWorkoutDate: null }),
      preferences: createUserPreferencesFixture({
        coaching: { checkInFrequency: 'daily' },
      }),
    });
    
    expect(shouldReceiveCheckIn(profile, 'daily')).toBe(true);
  });
  
  it('respects weekly frequency', () => {
    const profile = createUserProfileFixture({
      stats: createUserStatsFixture({
        lastWorkoutDate: subDays(new Date(), 3),
      }),
      preferences: createUserPreferencesFixture({
        coaching: { checkInFrequency: 'weekly' },
      }),
    });
    
    expect(shouldReceiveCheckIn(profile, 'weekly')).toBe(false);
  });
});
```

## Key Takeaways

1. **Centralize derived logic** - one place for business calculations
2. **Pure functions** - no side effects, easy to test
3. **Organize by entity** - co-locate queries with their entities
4. **Views use queries** - ensures consistency across the application
5. **Commands return entities, queries return values** - clear separation

Queries turn scattered calculations into a maintainable, testable domain layer where business logic lives in one place.
