---
id: domain-modeling-part5
title: "Part 5: Test Data Architecture with Fixture Factories"
date: "2026-02-05"
excerpt: "Tests are only as good as your data. Discover how to use fixture factories for reliable, repeatable, and type-safe domain testing."
readTime: "5 min read"
tags:
  - typescript
  - domain-modeling
  - testing
  - fixtures
series: Domain Modeling in TypeScript
seriesPart: 5
---

# Domain Modeling in TypeScript: A Practical Guide

## Part 5: Test Data Architecture with Fixture Factories

*This is Part 5 of a 5-part series on domain modeling in TypeScript. [Read Part 4: Queries - Derived State and View Logic](/blog/domain-modeling-part4).*

---

Tests are only as good as their data. Inline test objects lead to brittle tests, duplication, and constant maintenance. **Fixture factories** solve this with composable, reusable test data that evolves with your domain.

## The Problem

Here's a typical test:

```typescript
it('should calculate member days correctly', () => {
  const profile = {
    userId: '123',
    displayName: 'Alice',
    experienceProfile: { /* 15 more fields */ },
    fitnessGoals: { /* 8 more fields */ },
    // ... 80 more lines of setup
  } as UserProfile;
  
  const days = getMemberSinceDays(profile);
  expect(days).toBeGreaterThan(0);
});
```

**Problems:**
- 80+ lines of setup for a 2-line test
- Adding a required field breaks dozens of tests
- Using `as UserProfile` bypasses validation
- Can't share between unit tests, integration tests, and Storybook

## The Solution: Fixture Factories

Create one factory per entity that produces valid, branded domain entities:

```typescript
export function createUserProfileFixture(overrides?: Partial<UserProfile>): UserProfile {
  const data = {
    userId: faker.string.uuid(),
    displayName: faker.person.fullName(),
    experienceProfile: createExperienceProfileFixture(),
    fitnessGoals: createFitnessGoalsFixture(),
    stats: createUserStatsFixture(),
    createdAt: new Date(),
    ...overrides,
  };
  
  // fromPersistence applies the brand
  return userProfileFromPersistence(data).value;
}
```

Now tests are concise:

```typescript
it('should calculate member days correctly', () => {
  const profile = createUserProfileFixture({
    createdAt: new Date('2024-01-01'),
  });
  
  expect(getMemberSinceDays(profile)).toBeGreaterThan(0);
});

it('should detect active streaks', () => {
  const profile = createUserProfileFixture({
    stats: createUserStatsFixture({
      lastWorkoutDate: subDays(new Date(), 1),
      currentStreak: 5,
    }),
  });
  
  expect(isStreakActive(profile)).toBe(true);
});
```

## Key Principles

### 1. Compose Nested Fixtures

Each value object has its own factory, then compose them:

```typescript
function createUserStatsFixture(overrides?: Partial<UserStats>): UserStats {
  return userStatsFromPersistence({
    totalWorkouts: faker.number.int({ min: 0, max: 500 }),
    currentStreak: faker.number.int({ min: 0, max: 100 }),
    lastWorkoutDate: faker.date.recent(),
    achievements: [createAchievementFixture()],
    ...overrides,
  }).value;
}
```

### 2. Use fromPersistence for Branding

Fixtures must use the same factory as production code to produce properly branded entities:

```typescript
function createUserProfileFixture(overrides?: Partial<UserProfile>): UserProfile {
  const data = { /* ... */ };
  
  // This applies the brand - fixtures match production types exactly
  return userProfileFromPersistence(data).value;
}
```

### 3. Override at Any Level

Override just what you need:

```typescript
// Override nested field
createUserProfileFixture({
  experienceProfile: createExperienceProfileFixture({ level: 'advanced' }),
});

// Override leaf field
createUserProfileFixture({
  stats: createUserStatsFixture({ currentStreak: 30 }),
});
```

## Preset Fixtures

For common scenarios, create named presets:

```typescript
export const fixtures = {
  beginner: () => createUserProfileFixture({
    experienceProfile: createExperienceProfileFixture({ level: 'beginner' }),
    stats: createUserStatsFixture({ totalWorkouts: 0 }),
  }),
  
  advancedWithStreak: () => createUserProfileFixture({
    experienceProfile: createExperienceProfileFixture({ level: 'advanced' }),
    stats: createUserStatsFixture({ currentStreak: 15, lastWorkoutDate: new Date() }),
  }),
};

// Usage
const profile = fixtures.advancedWithStreak();
```

## Share Across Test Types

The same fixtures work everywhere:

```typescript
// Unit tests
const profile = createUserProfileFixture({ stats: createUserStatsFixture({ currentStreak: 7 }) });

// Integration tests  
await repository.save(createUserProfileFixture());

// Storybook
export const Sample: Story = {
  args: { profile: toUserProfileView(createUserProfileFixture()) },
};
```

## Benefits

| Without Fixtures | With Fixtures |
|-----------------|---------------|
| 80 lines of setup | 1 line |
| Add field → break 50 tests | Add field → update 1 fixture |
| `as UserProfile` bypasses validation | `fromPersistence` ensures validity |
| Duplicated across test files | Single source of truth |

## Key Takeaways

1. **One factory per entity** - match your domain structure
2. **Use Faker** - realistic data catches real bugs
3. **Compose nested fixtures** - build complex graphs from simple parts
4. **Use fromPersistence** - ensures proper branding
5. **Share across test types** - unit, integration, Storybook

Fixture factories turn test data from a maintenance burden into a reusable asset that makes tests easier to write and maintain.
