---
id: domain-modeling-part6
title: "Test Data Architecture with Fixture Factories"
date: "2026-02-05"
excerpt: "Tests are only as good as your data. Discover how to use fixture factories for reliable, repeatable, and type-safe domain testing."
readTime: "7 min read"
---

# Domain Modeling in TypeScript: A Practical Guide

## Part 6: Test Data Architecture with Fixture Factories

*This is Part 6 of a 7-part series on domain modeling in TypeScript. [Read Part 5: ViewSafe: The Poison Pill Pattern](/blog/domain-modeling-part5) | [Read Part 7: Isomorphic Domain Code](/blog/domain-modeling-part7) next.*

---

Tests are only as good as their data. Inline test data leads to brittle tests, duplication, and constant maintenance. **Fixture factories** solve this by providing composable, reusable test data that evolves with your domain.

## The Problem: Inline Test Data

Most tests start like this:

```typescript
describe('UserProfile', () => {
  it('should calculate member days correctly', () => {
    const profile = {
      userId: '123',
      displayName: 'Alice',
      experienceProfile: {
        level: 'beginner',
        capabilities: {
          canDoFullPushup: false,
          canDoFullPullup: false,
          canRunMile: false,
          canSquatBelowParallel: false,
        },
      },
      fitnessGoals: {
        primary: 'strength',
        secondary: [],
        motivation: 'Get stronger',
        successCriteria: [],
      },
      trainingConstraints: {
        location: 'gym',
        availableDays: ['Monday', 'Wednesday', 'Friday'],
        availableEquipment: [],
        maxDuration: 60,
        injuries: [],
      },
      preferences: {
        coaching: {
          checkInFrequency: 'daily',
        },
        notifications: {
          workoutReminders: true,
        },
      },
      stats: {
        totalWorkouts: 0,
        totalMinutes: 0,
        totalVolume: 0,
        currentStreak: 0,
        longestStreak: 0,
        joinedAt: new Date('2024-01-01'),
        lastWorkoutDate: null,
        achievements: [],
      },
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      lastActiveAt: new Date('2024-01-01'),
    } as UserProfile; // Bypasses type checking!
    
    const days = getMemberSinceDays(profile);
    expect(days).toBeGreaterThan(0);
  });
});
```

**Problems:**

1. **80 lines of setup** for a 2-line test
2. **Brittle** - add a required field, break 50 tests
3. **Inconsistent** - each test creates slightly different data
4. **Type-unsafe** - using `as UserProfile` bypasses validation
5. **Not reusable** - can't share between unit/integration/Storybook

## The Solution: Fixture Factories

Fixture factories are functions that create valid domain entities with sensible defaults and allow overrides:

```typescript
// test/user-profile.fixtures.ts
import { faker } from '@faker-js/faker';
import { userProfileFromPersistence } from '../user-profile.factory.js';
import { UserProfile } from '../user-profile.types.js';

export function createUserProfileFixture(
  overrides?: Partial<UserProfile>
): UserProfile {
  const now = new Date();
  
  const data = {
    userId: faker.string.uuid(),
    displayName: faker.person.fullName(),
    avatar: faker.image.avatar(),
    bio: faker.lorem.sentence(),
    location: faker.location.city(),
    timezone: faker.location.timeZone(),
    
    // Nested fixtures
    experienceProfile: createExperienceProfileFixture(),
    fitnessGoals: createFitnessGoalsFixture(),
    trainingConstraints: createTrainingConstraintsFixture(),
    preferences: createUserPreferencesFixture(),
    stats: createUserStatsFixture(),
    
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
    
    ...overrides, // Override anything
  };
  
  // Use fromPersistence to ensure proper branding
  const result = userProfileFromPersistence(data);
  
  if (result.isFailure) {
    throw new Error(`Failed to create fixture: ${result.error}`);
  }
  
  return result.value;
}
```

Now tests are concise and focused:

```typescript
describe('UserProfile', () => {
  it('should calculate member days correctly', () => {
    const profile = createUserProfileFixture({
      createdAt: new Date('2024-01-01'),
    });
    
    const days = getMemberSinceDays(profile);
    expect(days).toBeGreaterThan(0);
  });
  
  it('should detect active streaks', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const profile = createUserProfileFixture({
      stats: createUserStatsFixture({
        lastWorkoutDate: yesterday,
        currentStreak: 5,
      }),
    });
    
    expect(isStreakActive(profile)).toBe(true);
  });
});
```

## Fixture Factory Pattern

### 1. Use Faker for Realistic Data

```typescript
import { faker } from '@faker-js/faker';

export function createUserProfileFixture(
  overrides?: Partial<UserProfile>
): UserProfile {
  const data = {
    userId: faker.string.uuid(),
    displayName: faker.person.fullName(), // "Alice Johnson"
    avatar: faker.image.avatar(),         // "https://cloudflare.../avatar.jpg"
    bio: faker.lorem.sentence(),          // "Fitness enthusiast..."
    location: faker.location.city(),      // "San Francisco"
    timezone: faker.location.timeZone(),  // "America/Los_Angeles"
    // ...
  };
  // ...
}
```

**Why Faker?**
- Generates realistic, varied data
- Catches bugs that hardcoded data misses
- Makes test output readable
- Supports seeding for reproducibility

### 2. Compose Nested Fixtures

Each value object has its own fixture factory:

```typescript
// experience-profile.fixtures.ts
export function createExperienceProfileFixture(
  overrides?: Partial<ExperienceProfile>
): ExperienceProfile {
  const data = {
    level: faker.helpers.arrayElement(['beginner', 'intermediate', 'advanced']),
    yearsTraining: faker.number.int({ min: 0, max: 20 }),
    capabilities: {
      canDoFullPushup: faker.datatype.boolean(),
      canDoFullPullup: faker.datatype.boolean(),
      canRunMile: faker.datatype.boolean(),
      canSquatBelowParallel: faker.datatype.boolean(),
    },
    ...overrides,
  };
  
  return experienceProfileFromPersistence(data).value;
}

// fitness-goals.fixtures.ts
export function createFitnessGoalsFixture(
  overrides?: Partial<FitnessGoals>
): FitnessGoals {
  const data = {
    primary: faker.helpers.arrayElement(['strength', 'endurance', 'flexibility']),
    secondary: [],
    motivation: faker.lorem.sentence(),
    successCriteria: [faker.lorem.words(3)],
    ...overrides,
  };
  
  return fitnessGoalsFromPersistence(data).value;
}
```

Then compose them:

```typescript
export function createUserProfileFixture(
  overrides?: Partial<UserProfile>
): UserProfile {
  const data = {
    // ...
    experienceProfile: createExperienceProfileFixture(),
    fitnessGoals: createFitnessGoalsFixture(),
    trainingConstraints: createTrainingConstraintsFixture(),
    // ...
  };
  // ...
}
```

### 3. Override at Any Level

The composability allows targeted overrides:

```typescript
// Override just one nested field
const profile = createUserProfileFixture({
  experienceProfile: createExperienceProfileFixture({
    level: 'advanced', // Override just the level
  }),
});

// Or provide a complete nested object
const profile = createUserProfileFixture({
  stats: {
    totalWorkouts: 100,
    currentStreak: 30,
    // ... complete object
  } as UserStats,
});
```

### 4. Use fromPersistence for Branding

Fixtures use the `fromPersistence` factory to properly brand entities:

```typescript
export function createUserProfileFixture(
  overrides?: Partial<UserProfile>
): UserProfile {
  const data = { /* ... */ };
  
  // This applies the brand
  const result = userProfileFromPersistence(data);
  
  if (result.isFailure) {
    throw new Error(`Failed to create fixture: ${result.error}`);
  }
  
  return result.value; // Properly branded UserProfile
}
```

This ensures fixtures produce **exactly the same type** as production code.

## Real-World Example: Multi-Level Fixtures

Let's trace through creating a complex fixture:

```typescript
// Level 3: Achievement fixture
export function createAchievementFixture(
  overrides?: Partial<Achievement>
): Achievement {
  const data = {
    id: faker.string.uuid(),
    name: faker.helpers.arrayElement([
      'First Workout',
      '10 Day Streak',
      '100 Workouts',
    ]),
    description: faker.lorem.sentence(),
    earnedAt: faker.date.recent(),
    iconUrl: faker.image.url(),
    ...overrides,
  };
  
  return achievementFromPersistence(data).value;
}

// Level 2: Stats fixture (contains achievements)
export function createUserStatsFixture(
  overrides?: Partial<UserStats>
): UserStats {
  const data = {
    totalWorkouts: faker.number.int({ min: 0, max: 500 }),
    totalMinutes: faker.number.int({ min: 0, max: 10000 }),
    totalVolume: faker.number.int({ min: 0, max: 100000 }),
    currentStreak: faker.number.int({ min: 0, max: 100 }),
    longestStreak: faker.number.int({ min: 0, max: 200 }),
    joinedAt: faker.date.past(),
    lastWorkoutDate: faker.date.recent(),
    
    // Nested array of achievements
    achievements: [
      createAchievementFixture(),
      createAchievementFixture(),
    ],
    
    ...overrides,
  };
  
  return userStatsFromPersistence(data).value;
}

// Level 1: Profile fixture (contains stats)
export function createUserProfileFixture(
  overrides?: Partial<UserProfile>
): UserProfile {
  const data = {
    userId: faker.string.uuid(),
    displayName: faker.person.fullName(),
    
    // Nested stats (which contains nested achievements)
    stats: createUserStatsFixture(),
    
    // ... other fields
    
    ...overrides,
  };
  
  return userProfileFromPersistence(data).value;
}
```

Usage in tests:

```typescript
it('should count achievements', () => {
  const profile = createUserProfileFixture({
    stats: createUserStatsFixture({
      achievements: [
        createAchievementFixture({ name: 'First Workout' }),
        createAchievementFixture({ name: '10 Day Streak' }),
        createAchievementFixture({ name: '100 Workouts' }),
      ],
    }),
  });
  
  expect(profile.stats.achievements).toHaveLength(3);
});
```

## Sharing Fixtures Across Test Types

The same fixtures work in:

**Unit Tests**
```typescript
describe('shouldReceiveCheckIn', () => {
  it('returns true for daily frequency after 1 day', () => {
    const profile = createUserProfileFixture({
      preferences: createUserPreferencesFixture({
        coaching: { checkInFrequency: 'daily' },
      }),
      stats: createUserStatsFixture({
        lastWorkoutDate: subDays(new Date(), 1),
      }),
    });
    
    expect(shouldReceiveCheckIn(profile)).toBe(true);
  });
});
```

**Integration Tests**
```typescript
describe('GetProfileUseCase', () => {
  it('should return existing profile', async () => {
    const profile = createUserProfileFixture();
    await repository.save(profile);
    
    const result = await useCase.execute({ userId: profile.userId });
    
    expect(result.isSuccess).toBe(true);
    expect(result.value.userId).toBe(profile.userId);
  });
});
```

**Storybook Stories**
```typescript
export const WithActiveStreak: Story = {
  args: {
    profile: toUserProfileView(
      createUserProfileFixture({
        stats: createUserStatsFixture({
          currentStreak: 15,
          lastWorkoutDate: new Date(),
        }),
      })
    ),
  },
};
```

## Advanced Patterns

### Pattern 1: Preset Fixtures

Create named fixtures for common scenarios:

```typescript
export const fixtures = {
  beginner: () => createUserProfileFixture({
    experienceProfile: createExperienceProfileFixture({
      level: 'beginner',
      yearsTraining: 0,
      capabilities: {
        canDoFullPushup: false,
        canDoFullPullup: false,
        canRunMile: false,
        canSquatBelowParallel: false,
      },
    }),
  }),
  
  advanced: () => createUserProfileFixture({
    experienceProfile: createExperienceProfileFixture({
      level: 'advanced',
      yearsTraining: 5,
      capabilities: {
        canDoFullPushup: true,
        canDoFullPullup: true,
        canRunMile: true,
        canSquatBelowParallel: true,
      },
    }),
    stats: createUserStatsFixture({
      totalWorkouts: 500,
      currentStreak: 100,
    }),
  }),
  
  withActiveStreak: () => createUserProfileFixture({
    stats: createUserStatsFixture({
      currentStreak: 7,
      lastWorkoutDate: new Date(),
    }),
  }),
};

// Usage
const profile = fixtures.advanced();
```

### Pattern 2: Builder Methods

For complex setup, provide builder methods:

```typescript
export function createUserProfileFixture(
  overrides?: Partial<UserProfile>
): UserProfile {
  // ... implementation
}

// Builder methods
createUserProfileFixture.withActiveStreak = (days: number) => {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  return createUserProfileFixture({
    stats: createUserStatsFixture({
      currentStreak: days,
      lastWorkoutDate: yesterday,
    }),
  });
};

createUserProfileFixture.withAchievements = (count: number) => {
  return createUserProfileFixture({
    stats: createUserStatsFixture({
      achievements: Array.from({ length: count }, () =>
        createAchievementFixture()
      ),
    }),
  });
};

// Usage
const profile = createUserProfileFixture.withActiveStreak(15);
```

### Pattern 3: Sequence Helpers

For testing lists or time-series data:

```typescript
export function createUserProfileSequence(
  count: number,
  overridesFn?: (index: number) => Partial<UserProfile>
): UserProfile[] {
  return Array.from({ length: count }, (_, i) => {
    const overrides = overridesFn?.(i) || {};
    return createUserProfileFixture(overrides);
  });
}

// Usage
const profiles = createUserProfileSequence(10, (i) => ({
  displayName: `User ${i + 1}`,
  stats: createUserStatsFixture({
    totalWorkouts: i * 10,
  }),
}));
```

## Testing Fixtures Themselves

Fixtures should be tested to ensure they create valid entities:

```typescript
describe('createUserProfileFixture', () => {
  it('should create valid profile with defaults', () => {
    const profile = createUserProfileFixture();
    
    expect(profile.userId).toBeDefined();
    expect(profile.displayName).toBeDefined();
    expect(profile.experienceProfile).toBeDefined();
    expect(profile.stats).toBeDefined();
  });
  
  it('should respect overrides', () => {
    const profile = createUserProfileFixture({
      displayName: 'Test User',
    });
    
    expect(profile.displayName).toBe('Test User');
  });
  
  it('should create properly branded entities', () => {
    const profile = createUserProfileFixture();
    
    // This should compile - brand was applied
    const view = toUserProfileView(profile);
    expect(view).toBeDefined();
  });
});
```

## Benefits Recap

**Consistency**
- All tests use the same base data
- Changes propagate automatically
- Less maintenance

**Composability**
- Nested fixtures match domain structure
- Override at any level
- Reuse across test types

**Type Safety**
- Fixtures use `fromPersistence` for branding
- No `as` type assertions needed
- Compiler catches invalid overrides

**Readability**
- Tests focus on what's different, not boilerplate
- Intent is clear from overrides
- Faker makes test output realistic

**Maintainability**
- Add a required field? Update one fixture
- Change a type? Fixture factory catches it
- Refactor domain? Fixtures guide migration

## Key Takeaways

1. **One fixture per entity/value object** - match domain structure
2. **Use Faker for realistic data** - catch bugs, improve readability
3. **Compose nested fixtures** - build complex graphs easily
4. **Override at any level** - tests specify only what matters
5. **Use fromPersistence** - ensures proper branding
6. **Share across test types** - unit, integration, Storybook

Fixture factories transform test data from a **maintenance burden** into a **force multiplier** that makes tests easier to write, easier to read, and easier to maintain.

---

**Next in this series:** Part 7 - Isomorphic Domain Code

*See the complete implementation in the [example repository](#).*
