---
id: domain-modeling-part4
title: "Queries: Derived State and View Logic"
date: "2026-01-22"
excerpt: "Separating state from interpretation is key to a robust domain. Learn how to build pure query functions for consistent view logic."
readTime: "7 min read"
---

# Domain Modeling in TypeScript: A Practical Guide

## Part 4: Queries: Derived State and View Logic

*This is Part 4 of a 7-part series on domain modeling in TypeScript. [Read Part 3: Canonical Schemas as Source of Truth](/blog/domain-modeling-part3) | [Read Part 5: ViewSafe: The Poison Pill Pattern](/blog/domain-modeling-part5) next.*

---

In most applications, business logic ends up scattered across service layers, view models, and even UI components. Want to know if a user's workout streak is still active? That logic might live in three different places, implemented three different ways.

**Queries** solve this by centralizing all derived state computation in your domain layer.

## The Problem: Scattered Business Logic

Consider these common patterns:

```typescript
// In the API service
app.get('/api/profile', async (req, res) => {
  const profile = await db.getProfile(req.userId);
  
  // Business logic in controller 😱
  const daysSince = Math.floor(
    (Date.now() - profile.lastWorkoutDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  return res.json({
    ...profile,
    daysSinceLastWorkout: daysSince,
  });
});

// In React component
function ProfileCard({ profile }) {
  // Same logic duplicated in UI 😱
  const daysSince = Math.floor(
    (Date.now() - profile.lastWorkoutDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  return <div>Days since last workout: {daysSince}</div>;
}

// In notification service
async function shouldSendReminder(userId: string) {
  const profile = await db.getProfile(userId);
  
  // Same logic AGAIN 😱
  const daysSince = Math.floor(
    (Date.now() - profile.lastWorkoutDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  return daysSince > 3;
}
```

**Problems:**

1. **Logic is duplicated** across layers
2. **Inconsistencies** - each implementation might have subtle differences
3. **Hard to test** - business logic mixed with infrastructure
4. **Hard to change** - update one place, miss the others
5. **Not discoverable** - new developers don't know these calculations exist

## The Solution: Domain Queries

Queries are **pure functions** that compute derived state from domain entities:

```typescript
// user-profile.queries.ts

export function getDaysSinceLastWorkout(profile: UserProfile): number | null {
  if (!profile.stats.lastWorkoutDate) {
    return null;
  }
  
  const now = new Date();
  return Math.floor(
    (now.getTime() - profile.stats.lastWorkoutDate.getTime()) / (1000 * 60 * 60 * 24)
  );
}

export function isStreakActive(profile: UserProfile): boolean {
  const daysSince = getDaysSinceLastWorkout(profile);
  return daysSince !== null && daysSince <= 1;
}

export function shouldReceiveCheckIn(profile: UserProfile): boolean {
  const frequency = profile.preferences.coaching.checkInFrequency;
  
  if (frequency === 'never') return false;
  
  const daysSince = getDaysSinceLastWorkout(profile);
  if (daysSince === null) return true; // No workouts yet
  
  switch (frequency) {
    case 'daily': return daysSince >= 1;
    case 'weekly': return daysSince >= 7;
    case 'biweekly': return daysSince >= 14;
    default: return false;
  }
}
```

Now this logic lives in **one place** and can be used everywhere:

```typescript
// In API
app.get('/api/profile', async (req, res) => {
  const profile = await db.getProfile(req.userId);
  return res.json(toUserProfileView(profile)); // Queries called here
});

// In React
function ProfileCard({ profile }: { profile: UserProfileView }) {
  return <div>Days since last workout: {profile.daysSinceLastWorkout}</div>;
}

// In notification service
async function shouldSendReminder(userId: string) {
  const profile = await db.getProfile(userId);
  return shouldReceiveCheckIn(profile);
}
```

## Query Characteristics

Good queries are:

**1. Pure Functions**
```typescript
// ✅ Pure - same input always gives same output
export function getMemberSinceDays(profile: UserProfile): number {
  const now = new Date();
  return Math.floor(
    (now.getTime() - profile.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );
}

// ❌ Impure - depends on external state
let globalDate = new Date();
export function getMemberSinceDays(profile: UserProfile): number {
  return Math.floor(
    (globalDate.getTime() - profile.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );
}
```

**2. No Side Effects**
```typescript
// ✅ No side effects
export function getTotalVolume(stats: UserStats): number {
  return stats.totalVolume;
}

// ❌ Has side effects
export function getTotalVolume(stats: UserStats): number {
  logAnalytics('volume_accessed', stats.userId); // Side effect!
  return stats.totalVolume;
}
```

**3. Composable**
```typescript
// Queries can call other queries
export function getWorkoutFrequency(profile: UserProfile): 'active' | 'inactive' {
  const daysSince = getDaysSinceLastWorkout(profile);
  
  if (daysSince === null) return 'inactive';
  return daysSince <= 7 ? 'active' : 'inactive';
}

export function shouldEncourageReturn(profile: UserProfile): boolean {
  return getWorkoutFrequency(profile) === 'inactive' && 
         getMemberSinceDays(profile) > 30;
}
```

**4. Type-Safe**
```typescript
// Input and output types are explicit
export function getAverageWorkoutDuration(stats: UserStats): number {
  if (stats.totalWorkouts === 0) return 0;
  return Math.round(stats.totalMinutes / stats.totalWorkouts);
}
```

## Organizing Queries

### Pattern 1: Entity-Level Queries

Queries that operate on a complete entity:

```typescript
// user-profile.queries.ts
import { UserProfile } from './user-profile.types.js';

export function shouldReceiveCheckIn(profile: UserProfile): boolean {
  // Uses data from multiple parts of the entity
  const frequency = profile.preferences.coaching.checkInFrequency;
  const daysSince = getDaysSinceLastWorkout(profile);
  // ...
}

export function getMemberSinceDays(profile: UserProfile): number {
  const now = new Date();
  return Math.floor(
    (now.getTime() - profile.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );
}
```

### Pattern 2: Value Object Queries

Queries that operate on nested value objects:

```typescript
// user-stats.queries.ts
import { UserStats } from './user-stats.types.js';

export const UserStatsQueries = {
  isStreakActive(stats: UserStats): boolean {
    if (!stats.lastWorkoutDate) return false;
    
    const daysSince = this.getDaysSinceLastWorkout(stats);
    return daysSince !== null && daysSince <= 1;
  },
  
  getDaysSinceLastWorkout(stats: UserStats): number | null {
    if (!stats.lastWorkoutDate) return null;
    
    const now = new Date();
    return Math.floor(
      (now.getTime() - stats.lastWorkoutDate.getTime()) / (1000 * 60 * 60 * 24)
    );
  },
  
  getAverageWorkoutDuration(stats: UserStats): number {
    if (stats.totalWorkouts === 0) return 0;
    return Math.round(stats.totalMinutes / stats.totalWorkouts);
  },
  
  getAchievementsCount(stats: UserStats): number {
    return stats.achievements.length;
  },
};
```

Entity-level queries delegate to value object queries:

```typescript
// user-profile.queries.ts
import { UserStatsQueries } from '../value-objects/user-stats';

export function isStreakActive(profile: UserProfile): boolean {
  return UserStatsQueries.isStreakActive(profile.stats);
}

export function getDaysSinceLastWorkout(profile: UserProfile): number | null {
  return UserStatsQueries.getDaysSinceLastWorkout(profile.stats);
}
```

This creates a **hierarchical query structure** that matches your domain model.

### Pattern 3: Namespace Exports

For complex domains, group related queries:

```typescript
// connected-service.queries.ts
export const SyncHealthQueries = {
  isSyncHealthy(service: ConnectedService): boolean {
    if (!service.lastSyncAt) return false;
    
    const hoursSinceSync = this.getHoursSinceLastSync(service);
    return hoursSinceSync < 24;
  },
  
  getHoursSinceLastSync(service: ConnectedService): number {
    if (!service.lastSyncAt) return Infinity;
    
    const now = new Date();
    return (now.getTime() - service.lastSyncAt.getTime()) / (1000 * 60 * 60);
  },
  
  needsCredentialRefresh(service: ConnectedService): boolean {
    return !service.credentials.accessToken || 
           this.isTokenExpiringSoon(service.credentials);
  },
  
  isTokenExpiringSoon(credentials: ServiceCredentials): boolean {
    if (!credentials.expiresAt) return false;
    
    const hoursUntilExpiry = 
      (credentials.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
    
    return hoursUntilExpiry < 24;
  },
};

export const SyncStatsQueries = {
  getTotalSyncedItems(service: ConnectedService): number {
    return service.metadata.workoutsSynced + 
           service.metadata.activitiesSynced;
  },
  
  getLastSyncDuration(service: ConnectedService): number | null {
    return service.syncStatus.lastDuration || null;
  },
};
```

## Queries Power the View Layer

Queries are the bridge between domain entities and API responses:

```typescript
// user-profile.view.ts
export type UserProfileView = CreateView<
  UserProfile,
  never,
  {
    experienceProfile: ExperienceProfileView;
    fitnessGoals: FitnessGoalsView;
    stats: UserStatsView;
    
    // Computed fields from queries
    shouldReceiveCheckIn: boolean;
    memberSinceDays: number;
    isStreakActive: boolean;
    daysSinceLastWorkout: number | null;
  }
>;

export function toUserProfileView(profile: UserProfile): UserProfileView {
  const base = serializeForView(profile);
  
  return {
    ...base,
    experienceProfile: toExperienceProfileView(profile.experienceProfile),
    fitnessGoals: toFitnessGoalsView(profile.fitnessGoals),
    stats: toUserStatsView(profile.stats),
    
    // Execute queries to compute derived state
    shouldReceiveCheckIn: shouldReceiveCheckIn(profile),
    memberSinceDays: getMemberSinceDays(profile),
    isStreakActive: isStreakActive(profile),
    daysSinceLastWorkout: getDaysSinceLastWorkout(profile),
  };
}
```

The view type explicitly declares what computed fields are available, and the mapper executes the queries to populate them.

## Real-World Example: Sync Health Monitoring

Here's a complete example showing queries for a connected service:

```typescript
// connected-service.queries.ts

export function isSyncHealthy(service: ConnectedService): boolean {
  // No credentials = unhealthy
  if (!service.credentials.accessToken) {
    return false;
  }
  
  // Never synced = unhealthy
  if (!service.lastSyncAt) {
    return false;
  }
  
  // Last sync too long ago = unhealthy
  const hoursSince = getHoursSinceLastSync(service);
  if (hoursSince > 24) {
    return false;
  }
  
  // Last sync failed = unhealthy
  if (service.syncStatus.lastError) {
    return false;
  }
  
  return true;
}

export function getHoursSinceLastSync(service: ConnectedService): number {
  if (!service.lastSyncAt) return Infinity;
  
  const now = new Date();
  return (now.getTime() - service.lastSyncAt.getTime()) / (1000 * 60 * 60);
}

export function getTotalSyncedItems(service: ConnectedService): number {
  return service.metadata.workoutsSynced + 
         service.metadata.activitiesSynced;
}

export function needsCredentialRefresh(service: ConnectedService): boolean {
  if (!service.credentials.expiresAt) {
    return false;
  }
  
  const hoursUntilExpiry = 
    (service.credentials.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
  
  return hoursUntilExpiry < 24;
}

export function getSyncHealthSummary(service: ConnectedService): {
  status: 'healthy' | 'warning' | 'error';
  message: string;
} {
  if (!service.credentials.accessToken) {
    return { status: 'error', message: 'No credentials configured' };
  }
  
  if (needsCredentialRefresh(service)) {
    return { status: 'warning', message: 'Credentials expiring soon' };
  }
  
  if (!isSyncHealthy(service)) {
    return { status: 'error', message: 'Sync failing or stale' };
  }
  
  return { status: 'healthy', message: 'All systems operational' };
}
```

Used in the view:

```typescript
export type ConnectedServiceView = CreateView<
  ConnectedService,
  'credentials', // Omit sensitive field
  {
    syncStatus: SyncStatusView;
    metadata: ServiceMetadataView;
    
    // Computed fields
    hasValidCredentials: boolean;
    isSyncHealthy: boolean;
    totalSyncedItems: number;
    timeSinceLastSync: number | null;
    needsCredentialRefresh: boolean;
    healthSummary: { status: string; message: string };
  }
>;

export function toConnectedServiceView(
  service: ConnectedService
): ConnectedServiceView {
  const base = serializeForView(service);
  
  return {
    ...base,
    syncStatus: toSyncStatusView(service.syncStatus),
    metadata: toServiceMetadataView(service.metadata),
    
    hasValidCredentials: !!service.credentials.accessToken,
    isSyncHealthy: isSyncHealthy(service),
    totalSyncedItems: getTotalSyncedItems(service),
    timeSinceLastSync: getHoursSinceLastSync(service),
    needsCredentialRefresh: needsCredentialRefresh(service),
    healthSummary: getSyncHealthSummary(service),
  };
}
```

## Testing Queries

Because queries are pure functions, they're trivial to test:

```typescript
// user-profile.queries.spec.ts
import { describe, it, expect } from 'vitest';
import { 
  shouldReceiveCheckIn, 
  getDaysSinceLastWorkout 
} from './user-profile.queries.js';
import { createUserProfileFixture } from './test/user-profile.fixtures.js';

describe('UserProfile Queries', () => {
  describe('shouldReceiveCheckIn', () => {
    it('returns true for never-worked-out users', () => {
      const profile = createUserProfileFixture({
        stats: createUserStatsFixture({
          lastWorkoutDate: null,
        }),
        preferences: createUserPreferencesFixture({
          coaching: { checkInFrequency: 'daily' },
        }),
      });
      
      expect(shouldReceiveCheckIn(profile)).toBe(true);
    });
    
    it('returns false when frequency is "never"', () => {
      const profile = createUserProfileFixture({
        preferences: createUserPreferencesFixture({
          coaching: { checkInFrequency: 'never' },
        }),
      });
      
      expect(shouldReceiveCheckIn(profile)).toBe(false);
    });
    
    it('respects daily frequency', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const profile = createUserProfileFixture({
        stats: createUserStatsFixture({
          lastWorkoutDate: yesterday,
        }),
        preferences: createUserPreferencesFixture({
          coaching: { checkInFrequency: 'daily' },
        }),
      });
      
      expect(shouldReceiveCheckIn(profile)).toBe(true);
    });
  });
  
  describe('getDaysSinceLastWorkout', () => {
    it('returns null when no workout recorded', () => {
      const profile = createUserProfileFixture({
        stats: createUserStatsFixture({
          lastWorkoutDate: null,
        }),
      });
      
      expect(getDaysSinceLastWorkout(profile)).toBe(null);
    });
    
    it('calculates days correctly', () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      
      const profile = createUserProfileFixture({
        stats: createUserStatsFixture({
          lastWorkoutDate: threeDaysAgo,
        }),
      });
      
      expect(getDaysSinceLastWorkout(profile)).toBe(3);
    });
  });
});
```

No mocking, no setup, just input → output verification.

## CQRS-Lite: Commands vs Queries

This pattern is a lightweight version of **Command Query Responsibility Segregation (CQRS)**:

**Commands** (write operations):
- Mutate state
- Return `Result<Entity>`
- Can fail validation
- Have side effects (state change)

**Queries** (read operations):
- Compute derived state
- Return primitive values or view models
- Pure functions
- No side effects

```typescript
// Command - mutates state
export function recordWorkoutCompleted(
  profile: UserProfile,
  workoutDate: Date,
  durationMinutes: number,
): UserProfile {
  return {
    ...profile,
    stats: {
      ...profile.stats,
      totalWorkouts: profile.stats.totalWorkouts + 1,
      lastWorkoutDate: workoutDate,
    },
  };
}

// Query - reads state
export function getDaysSinceLastWorkout(profile: UserProfile): number | null {
  if (!profile.stats.lastWorkoutDate) return null;
  // ... calculate days
}
```

This separation makes your domain logic easier to reason about and test.

## Key Takeaways

1. **Centralize business logic** in domain queries, not service layers
2. **Keep queries pure** - same input always gives same output
3. **Compose queries** - build complex queries from simple ones
4. **Delegate to nested queries** - match your domain structure
5. **Use queries in views** - compute derived state for API responses
6. **Test queries in isolation** - no mocking needed

Queries transform your domain entities into **rich, queryable objects** that encapsulate all business logic for reading state. They're the foundation of type-safe, maintainable view layers.

---

**Next in this series:** Part 5 - ViewSafe: The Poison Pill Pattern

*See the complete implementation in the [example repository](#).*
