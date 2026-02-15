---
id: domain-modeling-part1
title: "Domain Modeling in TypeScript: A Practical Guide"
date: "2026-01-01"
excerpt: "Learn how to build a unified domain layer across Node.js, Browser, and Edge using Functional Core principles for shared validation and data safety."
readTime: "7 min read"
---

# Domain Modeling in TypeScript: A Practical Guide

## Part 1: Architecture and Motivation

*This is Part 1 of a 7-part series on domain modeling in TypeScript. [Read Part 2: Type-Safe Domain Security with Zod Brands](/blog/domain-modeling-part2) next.*

---

When building a fitness coaching application, I needed my domain code to work in multiple environments: Node.js for the API server, browsers for client-side validation, Cloudflare Workers for edge functions, and Storybook for UI development. I also needed compile-time guarantees that sensitive data (credentials, tokens, PII) would never accidentally leak through API responses.

Traditional approaches didn't cut it. Type-only definitions drift from runtime validation. Service layers accumulate business logic that becomes hard to test. View models get constructed ad-hoc, making it easy to forget date serialization or expose sensitive fields.

This series documents the architecture I built to solve these problems, inspired by **Functional Core, Imperative Shell (FCIS)** principles and Domain-Driven Design.

## Core Principles

**1. Functional Core**
Business logic lives in pure functions with no side effects:
- Commands: `(entity, params) => Result<entity>`
- Queries: `(entity) => value`
- Factories: `(input) => Result<entity>`

**2. Imperative Shell**
Infrastructure code (I/O, databases, APIs) lives at the boundaries:
- Repositories handle persistence
- Controllers handle HTTP
- Use cases orchestrate workflows

**3. Single Source of Truth**
Zod schemas define structure, validation, and types:
- TypeScript types are derived, never written manually
- Creation schemas reuse base schemas
- No drift between compile-time and runtime

**4. Compile-Time Safety**
Branded types prevent entire classes of bugs:
- Can't return domain entities from APIs
- Can't forget to serialize Dates
- Can't leak sensitive nested fields

## The File Structure

```
domain/
  user-profile/
    user-profile.types.ts       # Schema → Type definitions
    user-profile.factory.ts     # Entity creation & rehydration
    user-profile.commands.ts    # State mutations (writes)
    user-profile.queries.ts     # Derived state (reads)
    user-profile.view.ts        # API-safe presentation layer
    test/
      user-profile.fixtures.ts  # Test data factories
      user-profile.spec.ts      # Domain logic tests
```

Each file has a specific, well-defined responsibility:

**Types (`.types.ts`)** - Single source of truth
- Zod schema defines structure and validation
- TypeScript type is derived from schema
- Domain brand marks sensitive entities

**Factory (`.factory.ts`)** - Controlled entity creation
- `fromPersistence()` - rehydrates trusted DB data
- `CreateEntitySchema` - validates and constructs from untrusted input
- Enforces invariants at creation time

**Commands (`.commands.ts`)** - State transitions
- Pure functions: `(entity, params) => Result<entity>`
- Validate business rules before mutations
- Return new instances (immutability)

**Queries (`.queries.ts`)** - Derived state
- Pure functions: `(entity) => value`
- No side effects, just computations
- Power the view layer with business logic

**View (`.view.ts`)** - API-safe serialization
- Strips sensitive fields
- Serializes complex types (Date → ISO string)
- Adds computed fields from queries
- Enforced type-safety via branded types

## A Complete Flow

Let's trace a request through the entire pattern:

```typescript
// 1. API Request arrives
POST /api/profile
{
  "userId": "123",
  "displayName": "Alice",
  "timezone": "America/New_York"
}

// 2. Use Case validates with Factory Schema
const profile = CreateUserProfileSchema.parse(request.body);
// ✅ Returns branded UserProfile with all defaults applied

// 3. Execute business logic via Commands
const updated = updateDisplayName(profile, "Alice Cooper");
if (updated.isFailure) {
  return Result.fail(updated.error);
}

// 4. Persist the domain entity
await repository.save(updated.value);

// 5. Map to View using Queries
const view = toUserProfileView(updated.value);
// ✅ Type-safe: cannot return raw UserProfile
// ✅ Dates serialized, sensitive fields omitted
// ✅ Computed fields added via queries

// 6. Return API response
return Response.json(view);
```

At every step, the compiler enforces correctness:
- Can't create invalid entities (factory validates)
- Can't mutate state incorrectly (commands enforce invariants)
- Can't leak sensitive data (view types are branded differently)
- Can't skip serialization (branded types prevent it)

## Real-World Example: UserProfile

Let's look at a concrete implementation:

### 1. Schema & Type Definition

```typescript
// user-profile.types.ts
import { z } from 'zod';
import { DomainBrandTag } from '@bene/shared';

export const UserProfileSchema = z.object({
  userId: z.uuid(),
  displayName: z.string().min(1).max(100),
  avatar: z.url().optional(),
  bio: z.string().max(500).optional(),
  experienceProfile: ExperienceProfileSchema, // Nested value object
  fitnessGoals: FitnessGoalsSchema,
  stats: UserStatsSchema,
  createdAt: z.coerce.date<Date>(),
  updatedAt: z.coerce.date<Date>(),
  lastActiveAt: z.coerce.date<Date>(),
}).brand<DomainBrandTag>();

export type UserProfile = Readonly<z.infer<typeof UserProfileSchema>>;
```

**Key decisions:**
- Zod schema is the source of truth (runtime validation + type inference)
- `.brand<DomainBrandTag>()` marks this as sensitive domain data
- `Readonly<>` enforces immutability
- Nested value objects (ExperienceProfile, FitnessGoals) follow same pattern

### 2. Factory for Creation

```typescript
// user-profile.factory.ts
export const CreateUserProfileSchema = UserProfileSchema
  .pick({
    userId: true,
    displayName: true,
    timezone: true,
  })
  .extend({
    experienceProfile: CreateExperienceProfileSchema.optional(),
    fitnessGoals: CreateFitnessGoalsSchema.optional(),
    createdAt: z.coerce.date<Date>().optional(),
  })
  .transform((input, ctx) => {
    const now = new Date();
    
    const data = {
      ...input,
      // Apply smart defaults
      experienceProfile: input.experienceProfile || 
        CreateExperienceProfileSchema.parse({ level: 'beginner' }),
      fitnessGoals: input.fitnessGoals || 
        CreateFitnessGoalsSchema.parse({ primary: 'strength' }),
      stats: CreateUserStatsSchema.parse({ joinedAt: now }),
      createdAt: input.createdAt || now,
      updatedAt: now,
      lastActiveAt: now,
    };
    
    return unwrapOrIssue(validateAndBrand(data), ctx);
  }) satisfies z.ZodType<UserProfile>;
```

**Why this works:**
- Reuses base schema via `.pick()` (DRY)
- Smart defaults for complex nested objects
- Validates and brands in one transform
- Returns strongly-typed `UserProfile`

### 3. Commands for Mutations

```typescript
// user-profile.commands.ts
import { Guard, Result } from '@bene/shared';

export function updateDisplayName(
  profile: UserProfile,
  displayName: string,
): Result<UserProfile> {
  const guardResult = Guard.combine([
    Guard.againstEmptyString(displayName, 'displayName'),
    Guard.againstTooLong(displayName, 100, 'displayName'),
  ]);
  
  if (guardResult.isFailure) {
    return Result.fail(guardResult.error);
  }

  return Result.ok({
    ...profile,
    displayName,
    updatedAt: new Date(),
  } as UserProfile);
}

export function recordWorkoutCompleted(
  profile: UserProfile,
  workoutDate: Date,
  durationMinutes: number,
  volumeLifted: number,
): UserProfile {
  // Complex business logic: streak calculation
  let newStreak = profile.stats.currentStreak;
  
  if (profile.stats.lastWorkoutDate) {
    const daysSince = calculateDaysBetween(
      profile.stats.lastWorkoutDate, 
      workoutDate
    );
    
    if (daysSince === 1) {
      newStreak += 1; // Continue streak
    } else if (daysSince > 1) {
      newStreak = 1; // Streak broken
    }
  } else {
    newStreak = 1; // First workout
  }

  return {
    ...profile,
    stats: {
      ...profile.stats,
      totalWorkouts: profile.stats.totalWorkouts + 1,
      totalMinutes: profile.stats.totalMinutes + durationMinutes,
      currentStreak: newStreak,
      longestStreak: Math.max(newStreak, profile.stats.longestStreak),
      lastWorkoutDate: workoutDate,
    },
    lastActiveAt: new Date(),
    updatedAt: new Date(),
  };
}
```

**Pattern notes:**
- Pure functions: input → validated result
- Guards validate invariants before mutations
- Returns new instance (immutability)
- Complex business logic (streak calculation) lives in domain, not service layer

### 4. Queries for Derived State

```typescript
// user-profile.queries.ts
import { UserStatsQueries } from '../value-objects/user-stats';

export function shouldReceiveCheckIn(profile: UserProfile): boolean {
  const frequency = profile.preferences.coaching.checkInFrequency;
  
  if (frequency === 'never') return false;
  
  const daysSince = UserStatsQueries.getDaysSinceLastWorkout(profile.stats);
  
  if (daysSince === null) return true; // No workouts yet
  
  switch (frequency) {
    case 'daily': return daysSince >= 1;
    case 'weekly': return daysSince >= 7;
    case 'biweekly': return daysSince >= 14;
    default: return false;
  }
}

export function getMemberSinceDays(profile: UserProfile): number {
  const now = new Date();
  return Math.floor(
    (now.getTime() - profile.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  );
}
```

**Why queries matter:**
- Business logic for reads (CQRS-lite)
- Reusable across use cases
- Delegate to nested queries (`UserStatsQueries`) for separation of concerns
- Pure, testable functions

### 5. View Layer for API Safety

```typescript
// user-profile.view.ts
import { CreateView, serializeForView } from '@bene/shared';

export type UserProfileView = CreateView<
  UserProfile,
  never, // No fields omitted (all are safe)
  {
    // Override nested branded types with their views
    experienceProfile: ExperienceProfileView;
    fitnessGoals: FitnessGoalsView;
    stats: UserStatsView;
    
    // Add computed fields from queries
    shouldReceiveCheckIn: boolean;
    memberSinceDays: number;
  }
>;

export function toUserProfileView(profile: UserProfile): UserProfileView {
  const base = serializeForView(profile); // Dates → ISO strings
  
  return {
    ...base,
    experienceProfile: toExperienceProfileView(profile.experienceProfile),
    fitnessGoals: toFitnessGoalsView(profile.fitnessGoals),
    stats: toUserStatsView(profile.stats),
    
    // Computed fields
    shouldReceiveCheckIn: shouldReceiveCheckIn(profile),
    memberSinceDays: getMemberSinceDays(profile),
  };
}
```

**The magic of CreateView:**
- Automatically detects if you forget to map nested branded types
- Serializes Dates to ISO strings
- Allows omitting sensitive fields
- Allows adding computed fields
- **Type error if you try to return raw UserProfile from API**

### 6. Use Case Orchestration

```typescript
// get-profile.use-case.ts
export class GetProfileUseCase {
  async execute(request: { userId: string }): Promise<Result<UserProfileView>> {
    // 1. Load from repository (imperative shell)
    const profileResult = await this.repository.findById(request.userId);
    
    if (profileResult.isSuccess) {
      // 2. Map to view (functional core: queries executed here)
      return Result.ok(toUserProfileView(profileResult.value));
    }
    
    // 3. Create default if not found (functional core)
    const defaultProfile = CreateUserProfileSchema.parse({
      userId: request.userId,
      displayName: 'New User',
      timezone: 'UTC',
    });
    
    // 4. Persist (imperative shell)
    await this.repository.save(defaultProfile);
    
    // 5. Return view
    return Result.ok(toUserProfileView(defaultProfile));
  }
}
```

**Notice:**
- Use case can only return `UserProfileView`, not `UserProfile` (type safety!)
- Factory applies defaults automatically
- Queries run during view mapping
- Clean, readable orchestration
- Functional core (domain logic) separated from imperative shell (I/O)

## Why This Architecture

**1. Testability**
Pure functions are trivial to test - no mocking needed:
```typescript
describe('shouldReceiveCheckIn', () => {
  it('respects daily frequency', () => {
    const profile = createUserProfileFixture({
      preferences: { coaching: { checkInFrequency: 'daily' } },
    });
    expect(shouldReceiveCheckIn(profile)).toBe(true);
  });
});
```

**2. Portability**
Using only Web Standard APIs means domain code runs anywhere:
- Node.js API servers
- Browser client-side validation
- Cloudflare Workers edge functions
- Storybook for UI development
- Any JavaScript runtime

**3. Type Safety**
Branded types prevent entire classes of bugs:
```typescript
// ❌ This won't compile
async function getUser(id: string): Promise<UserProfile> {
  const user = await repo.find(id);
  return user; // Can't return branded type from API boundary
}

// ✅ Must use view
async function getUser(id: string): Promise<UserProfileView> {
  const user = await repo.find(id);
  return toUserProfileView(user); // Compiler enforces this
}
```

**4. Maintainability**
Single source of truth eliminates drift:
- Change schema → types update automatically
- Change domain logic → all consumers get it
- Add field → compiler shows everywhere that needs updating

**5. Clear Boundaries**
Functional core vs imperative shell makes dependencies obvious:
- Domain code has zero I/O
- Infrastructure code coordinates
- Easy to reason about, easy to refactor

## What's Coming

Now that you understand the overall architecture, we'll dive deep into each component:

**Part 2: Type-Safe Domain Security with Zod Brands** - How the brand system prevents data leaks at compile-time

**Part 3: Canonical Schemas as Source of Truth** - Why Zod schemas should drive everything, and how to handle the quirks

**Part 4: Queries - Derived State and View Logic** - CQRS-lite pattern for separating reads from writes

**Part 5: ViewSafe - The Poison Pill Pattern** - Deep dive on `CreateView` and automatic nested brand detection

**Part 6: Test Data Architecture** - Fixture factories, composition, and sharing test data across layers

**Part 7: Isomorphic Domain Code** - Making domain portable across all JavaScript runtimes

---

*This is Part 1 of a 7-part series on domain modeling in TypeScript. The complete pattern is in production powering a fitness coaching application.*
