---
id: domain-modeling-part3
title: "Part 3: Deriving Types from Validation Schemas"
date: "2026-01-15"
excerpt: "One schema, many models. Learn how to derive domain types, view types, and DTOs from a single validation schema to eliminate drift and duplication."
readTime: "8 min read"
tags:
  - typescript
  - domain-modeling
  - zod
  - validation
series: Domain Modeling in TypeScript
seriesPart: 3
---

# Domain Modeling in TypeScript: A Practical Guide

## Part 3: Deriving Types from Validation Schemas

*This is Part 3 of a 5-part series on domain modeling in TypeScript. [Read Part 2: Type-Safe Domain Security with Brands](/blog/domain-modeling-part2) | [Read Part 4: Queries - Derived State and View Logic](/blog/domain-modeling-part4) next.*

---

Most applications accumulate too many similar types. You end up with domain models, database models, view models, DTOs, and request/response types—all 90% the same, but maintained separately. When you change one, you have to carefully update the others.

This post shows how to flip that around: define your schema once, and derive everything else from it.

## The Many Models Problem

A typical application has several representations of the same logical entity:

```javascript
┌─────────────────────────────────────────────────────────────────┐
│                     Domain Model                                │
│  • Immutable, validated                                         │
│  • Owned by functional core (commands + queries)                │
│  • Branded to prevent serialization leaks                       │
│  • Contains computed/derived fields                             │
└─────────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────-┐ ┌─────────────────┐
│  Database Model │  │   View Model     │ │      DTOs       │
│  (persistence)  │  │  (API response)  │ │ (HTTP/RPC/etc)  │
│                 │  │                  │ │                 │
│ • May flatten   │  │ • Date → string  │ │ • Validate      │
│   nested objs   │  │ • Computed fields│ │   input         │
│ • Snake_case    │  │ • Sensitive ops  │ │ • Serialize     │
│ • ID only refs  │  │                  │ │   output        │
└─────────────────┘  └─────────────────-┘ └─────────────────┘
```

Each transformation is a potential source of bugs:
- Forgetting to serialize dates
- Accidentally leaking sensitive fields
- Database schema diverging from application types

## The Solution: Atomic Schemas with Composition

The key insight is to define **one canonical schema** for each entity, then derive variants through composition:

```
┌─────────────────────────────────────────────────────────────────┐
│                 Canonical Schema (atomic)                       │
│  • Defines structure and validation                             │
│  • Single source of truth                                       │
│  • Can be composed into other schemas                           │
└─────────────────────────────────────────────────────────────────┘
                    │
    ┌───────────────┼───────────────┬───────────────┐
    ▼               ▼               ▼               ▼
┌─────────┐   ┌─────────--┐   ┌─────────┐   ┌─────────┐
│ Domain  │   │ Create    │   │  View   │   │  DTOs   │
│ Schema  │   │ Schema    │   │ Schema  │   │ Schema  │
│ (+brand)│   │(+defaults)│   │(+omit)  │   │(+input) │
└─────────┘   └─────────--┘   └─────────┘   └─────────┘
```

This approach gives you:
- **Zero drift** between models
- **Single place** to change validation rules
- **Automatic propagation** of changes throughout the system

## Defining the Canonical Schema

Start with the validation schema as your source of truth:

```typescript
// user-profile.types.ts
import { z } from 'zod';

// Define shape separately so it can be reused
const UserProfileShape = {
  userId: z.uuid(),
  displayName: z.string().min(1).max(100),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']),
  createdAt: z.coerce.date<Date>(),
};

// The canonical schema - used as composition base
export const UserProfileSchema = z.object(UserProfileShape)
  .brand<'SENSITIVE_DOMAIN_ENTITY'>();

// Derive the domain type
export type UserProfile = Readonly<z.infer<typeof UserProfileSchema>>;
```

By extracting `UserProfileShape`, we can use it to build variants without the brand interfering (Zod's `.pick()` doesn't work well after `.brand()`).

## Deriving the Creation Schema

When creating new entities, you need different validation rules:
- Some fields are auto-generated (IDs, timestamps)
- Some are optional with smart defaults
- You want to validate input, then transform it into the full domain type

```typescript
// user-profile.factory.ts
import { UserProfileSchema, UserProfileShape } from './user-profile.types';

export const CreateUserProfileSchema = z.object(UserProfileShape)
  .pick({
    displayName: true,
    experienceLevel: true,
  })
  .extend({
    userId: z.uuid().optional(),
    createdAt: z.coerce.date().optional(),
  })
  .transform((input, ctx) => {
    const now = new Date();
    
    const data = {
      userId: input.userId || crypto.randomUUID(),
      displayName: input.displayName,
      experienceLevel: input.experienceLevel,
      createdAt: input.createdAt || now,
    };
    
    // Validate against canonical schema to ensure completeness
    const result = UserProfileSchema.safeParse(data);
    if (!result.success) {
      return unwrapOrIssue(Result.fail(mapZodError(result.error)), ctx);
    }
    
    return result.data;
  }) satisfies z.ZodType<UserProfile>;
```

This gives you:
- Input validation (displayName required, experienceLevel must be valid enum)
- Auto-generated fields (userId, createdAt)
- Output that's guaranteed to match the domain type

## Deriving View Schemas

For API responses, you need to:
- Remove sensitive fields
- Serialize dates to ISO strings
- Add computed fields

```typescript
// user-profile.view.ts
import { UserProfileSchema } from './user-profile.types';

export type UserProfileView = CreateView<
  UserProfile,
  'sensitiveField1' | 'sensitiveField2', // Omit sensitive fields
  {
    // Add computed fields
    memberSinceDays: number;
    profileComplete: boolean;
  }
>;

export function toUserProfileView(profile: UserProfile): UserProfileView {
  return {
    ...serializeForView(profile),
    memberSinceDays: getMemberSinceDays(profile),
    profileComplete: !!profile.bio && !!profile.avatar,
  };
}
```

The `CreateView` utility (discussed in Part 2) ensures you can't accidentally return branded domain types.

## Deriving DTO Schemas

For request/response on the wire, you need schemas that handle:
- Input validation at API boundaries
- Type coercion (strings to dates, etc.)
- Protocol-specific transformations

```typescript
// user-profile.dto.ts
import { UserProfileShape } from './user-profile.types';

export const UpdateUserProfileDTO = z.object(UserProfileShape)
  .partial()
  .extend({
    // Override types for wire format
    createdAt: z.string().datetime().optional(),
  });

export type UpdateUserProfileDTO = z.infer<typeof UpdateUserProfileDTO>;
```

## Composing Nested Value Objects

The real power shows when you have nested entities:

```typescript
// Define atomic shapes
const ExperienceProfileShape = {
  level: z.enum(['beginner', 'intermediate', 'advanced']),
  yearsTraining: z.number().min(0),
};

const FitnessGoalsShape = {
  primary: z.enum(['strength', 'endurance', 'hypertrophy', 'general']),
  secondary: z.array(z.enum(['strength', 'endurance', 'hypertrophy', 'general'])),
};

// Compose into parent schema
export const UserProfileSchema = z.object({
  ...UserProfileShape,
  experienceProfile: z.object(ExperienceProfileShape),
  fitnessGoals: z.object(FitnessGoalsShape),
}).brand<'SENSITIVE_DOMAIN_ENTITY'>();
```

Now each nested object has its own canonical schema, which can also be derived from:

```typescript
// Creation schema for nested object
export const CreateExperienceProfileSchema = z.object(ExperienceProfileShape)
  .transform((input) => ({
    ...input,
    capabilities: calculateCapabilities(input.level), // Add derived fields
  }));

// View schema for nested object
export type ExperienceProfileView = CreateView<ExperienceProfile>;
```

## Validation at Every Boundary

Each model serves a specific purpose at a specific boundary:

| Boundary | Purpose | Schema |
|----------|---------|--------|
| HTTP Request | Sanitize & validate input | DTO Schema |
| Domain Creation | Ensure valid entity | Create Schema |
| Domain Storage | Persist validated entity | Domain Schema |
| API Response | Safe serialization | View Schema |
| External API | Match contract | DTO Schema |

```typescript
// API endpoint example
app.patch('/users/:id/profile', (req, res) => {
  // 1. Validate input (DTO schema)
  const dto = UpdateUserProfileDTO.parse(req.body);
  
  // 2. Load existing domain entity
  const profile = userProfileFromPersistence(existingData);
  
  // 3. Apply command (returns new domain entity)
  const updated = updateProfile(profile, dto);
  
  // 4. Return view (can't leak domain type)
  res.json(toUserProfileView(updated));
});
```

## Why This Eliminates Drift

When you need to add a field:

```
1. Add to canonical schema
   └─► TypeScript error in all derived schemas
       └─► Fix each derivation
           └─► Build succeeds, all models updated
```

Instead of:
```
1. Add to domain type
2. Update validation
3. Update factory
4. Update view type
5. Update DTO
6. Update database model
7. Hope you didn't miss any
```

## Handling Schema Composition

Here are common patterns for composing schemas:

### Shared Fields

```typescript
const Timestamps = {
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
};

const UserSchema = z.object({
  ...Timestamps,
  name: z.string(),
});

const PostSchema = z.object({
  ...Timestamps,
  title: z.string(),
});
```

### Discriminated Unions

```typescript
const WorkoutScheduled = z.object({
  type: z.literal('scheduled'),
  scheduledFor: z.coerce.date(),
});

const WorkoutCompleted = z.object({
  type: z.literal('completed'),
  completedAt: z.coerce.date(),
  duration: z.number(),
});

export const WorkoutEventSchema = z.discriminatedUnion('type', [
  WorkoutScheduled,
  WorkoutCompleted,
]);
```

### Custom Validation

```typescript
export const WorkoutSchema = z.object({
  exercises: z.array(ExerciseSchema),
  totalDuration: z.number(),
}).refine(
  (data) => {
    const sum = data.exercises.reduce((s, e) => s + e.duration, 0);
    return Math.abs(sum - data.totalDuration) < 1;
  },
  { message: 'Total duration must match sum of exercises' }
);
```

## Key Takeaways

1. **Define one canonical schema** as your source of truth
2. **Extract shapes** so they can be composed without brand interference
3. **Derive all variants** using `.pick()`, `.extend()`, `.partial()`, and transforms
4. **Validate at every boundary** - input, output, and persistence
5. **Compose nested schemas** to keep validation rules co-located with their entities

When your schema is the single source of truth, adding a field means changing it in one place. TypeScript propagates those changes everywhere automatically—no drift, no forgotten updates.
