---
id: domain-modeling-part3
title: "Canonical Schemas as Source of Truth"
date: "2026-01-15"
excerpt: "Schemas should be defined once and used everywhere. Learn how to centralize your Zod definitions for consistent validation across the stack."
readTime: "7 min read"
---

# Domain Modeling in TypeScript: A Practical Guide

## Part 3: Canonical Schemas as Source of Truth

*This is Part 3 of a 7-part series on domain modeling in TypeScript. [Read Part 2: Type-Safe Domain Security with Zod Brands](/blog/domain-modeling-part2) | [Read Part 4: Queries: Derived State and View Logic](/blog/domain-modeling-part4) next.*

---

One of the most common problems in TypeScript applications is **type-runtime drift**: your TypeScript types say one thing, but the actual data at runtime is something else entirely.

```typescript
// Types say this...
interface User {
  email: string;
  age: number;
}

// But runtime gets this...
const user = { email: 123, age: "old" }; // Oops!

// TypeScript doesn't catch it because data came from external API
const result = await fetch('/api/user').then(r => r.json() as User);
```

The solution? **Make schemas your source of truth** and derive everything else from them.

## The Traditional Approach (Type-First)

Most TypeScript codebases start with types:

```typescript
// types.ts
export interface UserProfile {
  userId: string;
  displayName: string;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
  createdAt: Date;
}

// validation.ts - duplicates the shape!
export function validateUserProfile(data: unknown): UserProfile {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid user profile');
  }
  const profile = data as any;
  
  if (typeof profile.userId !== 'string') {
    throw new Error('userId must be a string');
  }
  
  if (typeof profile.displayName !== 'string') {
    throw new Error('displayName must be a string');
  }
  
  // ... 20 more lines of manual validation
  
  return profile as UserProfile;
}

// factory.ts - duplicates the shape again!
export function createUserProfile(input: Partial<UserProfile>): UserProfile {
  return {
    userId: input.userId || generateId(),
    displayName: input.displayName || 'Anonymous',
    experienceLevel: input.experienceLevel || 'beginner',
    createdAt: input.createdAt || new Date(),
  };
}
```

**Problems:**

1. **Three sources of truth** - type, validator, factory can drift apart
2. **Manual validation** - error-prone and verbose
3. **No transformation** - can't coerce types (string → Date)
4. **Poor error messages** - "validation failed" doesn't say what's wrong
5. **Maintenance burden** - change the type, update validation, update factory

## The Schema-First Approach

With Zod (or similar runtime validation libraries), we flip this around:

```typescript
// user-profile.types.ts
import { z } from 'zod';

// 1. Define the schema ONCE
export const UserProfileSchema = z.object({
  userId: z.uuid(),
  displayName: z.string().min(1).max(100),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']),
  createdAt: z.coerce.date<Date>(),
}).brand<'SENSITIVE_DOMAIN_ENTITY'>();

// 2. Derive the type
export type UserProfile = Readonly<z.infer<typeof UserProfileSchema>>;
```

**Benefits:**

- **Single source of truth** - schema defines both runtime and compile-time shape
- **Automatic validation** - `schema.parse()` throws helpful errors
- **Type coercion** - `z.coerce.date()` converts strings to Dates
- **Rich validation** - min/max, regex, custom refinements
- **Type inference** - TypeScript type flows from schema

Now validation and types can never drift:

```typescript
// Validation is automatic
const profile = UserProfileSchema.parse(untrustedData);
// ✅ If this succeeds, profile is guaranteed to match UserProfile type

// Partial validation for updates
const update = UserProfileSchema.partial().parse(partialData);
```

## Deriving Creation Schemas

The real power comes from **reusing the base schema** to create API-specific schemas:

```typescript
// user-profile.factory.ts

// Reuse fields from base schema
export const CreateUserProfileSchema = UserProfileSchema
  .pick({
    displayName: true,
    experienceLevel: true,
  })
  .extend({
    userId: z.uuid().optional(), // Make optional for creation
    createdAt: z.coerce.date<Date>().optional(),
  })
  .transform((input, ctx) => {
    const now = new Date();
    
    const data = {
      userId: input.userId || crypto.randomUUID(),
      displayName: input.displayName,
      experienceLevel: input.experienceLevel,
      createdAt: input.createdAt || now,
    };
    
    // Validate against the full schema
    const result = UserProfileSchema.safeParse(data);
    if (!result.success) {
      return unwrapOrIssue(Result.fail(mapZodError(result.error)), ctx);
    }
    
    return result.data;
  }) satisfies z.ZodType<UserProfile>;
```

**What's happening:**

1. `.pick()` selects required fields from base schema
2. `.extend()` adds optional fields for creation
3. `.transform()` applies defaults and validates
4. `satisfies z.ZodType<UserProfile>` ensures output matches domain type

**Benefits:**

- **DRY** - field definitions reused from base schema
- **Type-safe** - input and output types are enforced
- **Declarative** - clearly shows what's required vs. optional
- **Validated** - final data passes through base schema

## Real-World Example: Nested Value Objects

Let's look at a complex entity with nested value objects:

```typescript
// user-profile.types.ts
export const UserProfileSchema = z.object({
  userId: z.uuid(),
  displayName: z.string().min(1).max(100),
  
  // Nested value objects (also branded!)
  experienceProfile: ExperienceProfileSchema,
  fitnessGoals: FitnessGoalsSchema,
  trainingConstraints: TrainingConstraintsSchema,
  preferences: UserPreferencesSchema,
  stats: UserStatsSchema,
  
  createdAt: z.coerce.date<Date>(),
  updatedAt: z.coerce.date<Date>(),
  lastActiveAt: z.coerce.date<Date>(),
}).brand<'SENSITIVE_DOMAIN_ENTITY'>();
```

The creation schema needs to:
- Require some fields (userId, displayName)
- Make others optional (nested objects)
- Provide smart defaults for nested objects
- Validate the complete entity

```typescript
export const CreateUserProfileSchema = UserProfileSchema
  .pick({
    userId: true,
    displayName: true,
    timezone: true,
  })
  .extend({
    // Allow optional nested objects with their own creation schemas
    experienceProfile: CreateExperienceProfileSchema.optional(),
    fitnessGoals: CreateFitnessGoalsSchema.optional(),
    trainingConstraints: CreateTrainingConstraintsSchema.optional(),
    preferences: UserPreferencesSchema.optional(),
    stats: UserStatsSchema.optional(),
    
    createdAt: z.coerce.date<Date>().optional(),
    updatedAt: z.coerce.date<Date>().optional(),
    lastActiveAt: z.coerce.date<Date>().optional(),
  })
  .transform((input, ctx) => {
    const now = new Date();
    
    const data = {
      ...input,
      
      // Smart defaults for nested objects
      experienceProfile: input.experienceProfile || 
        CreateExperienceProfileSchema.parse({
          level: 'beginner',
          capabilities: {
            canDoFullPushup: false,
            canDoFullPullup: false,
            canRunMile: false,
            canSquatBelowParallel: false,
          },
        }),
      
      fitnessGoals: input.fitnessGoals || 
        CreateFitnessGoalsSchema.parse({
          primary: 'strength',
          secondary: [],
          motivation: 'Improve overall health',
          successCriteria: [],
        }),
      
      trainingConstraints: input.trainingConstraints || 
        CreateTrainingConstraintsSchema.parse({
          location: 'mixed',
          availableDays: ['Monday', 'Wednesday', 'Friday'],
          availableEquipment: [],
          maxDuration: 60,
          injuries: [],
        }),
      
      preferences: input.preferences || 
        CreateUserPreferencesSchema.parse({}),
      
      stats: input.stats || 
        CreateUserStatsSchema.parse({ joinedAt: now }),
      
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
      lastActiveAt: input.lastActiveAt || now,
    };
    
    const result = validateAndBrand(data);
    return unwrapOrIssue(result, ctx);
  }) satisfies z.ZodType<UserProfile>;
```

**Key pattern:**
- Each nested value object has its own `CreateXSchema`
- Defaults are applied declaratively in the transform
- Final validation ensures completeness
- Output type is guaranteed to be `UserProfile`

## Handling Zod's Quirks

Zod is powerful but has some gotchas when combined with `.brand()` and `.readonly()`:

### Issue 1: `.pick()` After `.brand()` Fails

```typescript
// ❌ This doesn't work
const Schema = z.object({...}).brand<'domain'>();
const CreateSchema = Schema.pick({...}); // Type error!
```

**Solution:** Don't brand the base schema used for `.pick()`:

```typescript
// Define base shape
const UserProfileShape = {
  userId: z.uuid(),
  displayName: z.string(),
  // ...
};

// Export branded schema
export const UserProfileSchema = z.object(UserProfileShape)
  .brand<'SENSITIVE_DOMAIN_ENTITY'>();

// Use unbounded shape for picking
const CreateSchema = z.object(UserProfileShape)
  .pick({...});
```

### Issue 2: Type Inference Lost with Modifiers

```typescript
// Inference breaks with too many modifiers
const Schema = z.object({...})
  .readonly()
  .brand<'domain'>()
  .strict();

type T = z.infer<typeof Schema>; // Shows expanded type, not clean name
```

**Solution:** Apply `Readonly<>` at the type level:

```typescript
export const UserProfileSchema = z.object({...})
  .brand<'SENSITIVE_DOMAIN_ENTITY'>();

export type UserProfile = Readonly<z.infer<typeof UserProfileSchema>>;
```

### Issue 3: `.satisfies` vs Explicit Return Type

```typescript
// ❌ Breaks inference
export const CreateSchema: z.ZodType<UserProfile> = ...;

// ✅ Preserves inference
export const CreateSchema = ...
  .transform(...)
  satisfies z.ZodType<UserProfile>;
```

The `satisfies` keyword checks output type without changing inference.

## Validation Patterns

### Pattern 1: Shared Field Definitions

When multiple schemas share fields, extract them:

```typescript
// Shared fields
const sharedFields = {
  id: z.uuid(),
  createdAt: z.coerce.date<Date>(),
  updatedAt: z.coerce.date<Date>(),
};

export const UserSchema = z.object({
  ...sharedFields,
  displayName: z.string(),
}).brand<'domain'>();

export const PostSchema = z.object({
  ...sharedFields,
  title: z.string(),
  authorId: z.uuid(),
}).brand<'domain'>();
```

### Pattern 2: Custom Refinements

For complex business rules:

```typescript
export const WorkoutSchema = z.object({
  exercises: z.array(ExerciseSchema),
  totalDuration: z.number(),
}).refine(
  (data) => {
    const calculatedDuration = data.exercises.reduce(
      (sum, ex) => sum + ex.duration, 
      0
    );
    return Math.abs(calculatedDuration - data.totalDuration) < 1;
  },
  {
    message: 'Total duration must match sum of exercise durations',
    path: ['totalDuration'],
  }
).brand<'domain'>();
```

### Pattern 3: Discriminated Unions

For polymorphic entities:

```typescript
export const NotificationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('workout_reminder'),
    scheduledFor: z.coerce.date(),
  }),
  z.object({
    type: z.literal('achievement_earned'),
    achievementId: z.uuid(),
  }),
  z.object({
    type: z.literal('streak_milestone'),
    streakDays: z.number(),
  }),
]).brand<'domain'>();
```

## Migration Strategy

If you have an existing codebase with types-first, migrate incrementally:

**Step 1:** Add schemas alongside existing types

```typescript
// Keep existing type
export interface User {
  id: string;
  email: string;
}

// Add new schema
export const UserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
});

// Ensure compatibility
export type UserFromSchema = z.infer<typeof UserSchema>;
// Check: User and UserFromSchema should be compatible
```

**Step 2:** Use schemas at API boundaries

```typescript
// Validate external data
app.post('/users', (req, res) => {
  const user = UserSchema.parse(req.body); // Now validated!
  // ... rest of handler
});
```

**Step 3:** Replace manual validation

```typescript
// Before
function validateUser(data: unknown): User {
  // 50 lines of manual checks
}

// After
function validateUser(data: unknown): User {
  return UserSchema.parse(data);
}
```

**Step 4:** Deprecate old types

```typescript
/** @deprecated Use z.infer<typeof UserSchema> instead */
export interface User {
  // ...
}
```

## Benefits Recap

**Single Source of Truth**
- Schema defines structure
- Types derive from schema
- No drift between runtime and compile-time

**Better Validation**
- Automatic, comprehensive
- Helpful error messages
- Type coercion built-in

**Reusability**
- `.pick()`, `.omit()`, `.partial()` create variants
- Creation schemas reuse base schema
- Nested schemas compose naturally

**Type Safety**
- Input validation at boundaries
- Output types guaranteed
- Compile-time + runtime checks

**Developer Experience**
- Less boilerplate
- Better autocomplete
- Clearer intent

## Key Takeaways

1. **Define schemas first**, derive types second
2. **Reuse base schemas** with `.pick()` and `.extend()` for creation
3. **Use `.transform()` for defaults** and complex construction logic
4. **Validate at boundaries** (API endpoints, external data)
5. **Apply brands** to mark sensitive domain entities
6. **Use `satisfies`** to preserve type inference

Canonical schemas eliminate type-runtime drift and make your domain model self-documenting. When the schema changes, everything derived from it changes automatically—no manual synchronization required.

---

**Next in this series:** Part 4 - Queries: Derived State and View Logic

*See the complete implementation in the [example repository](#).*
