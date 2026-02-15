---
id: domain-modeling-part5
title: "ViewSafe: The Poison Pill Pattern"
date: "2026-01-29"
excerpt: "Enforce data safety at the type level. The poison pill pattern ensures you never accidentally leak raw domain data to the client."
readTime: "7 min read"
---

# Domain Modeling in TypeScript: A Practical Guide

## Part 5: ViewSafe: The Poison Pill Pattern

*This is Part 5 of a 7-part series on domain modeling in TypeScript. [Read Part 4: Queries: Derived State and View Logic](/blog/domain-modeling-part4) | [Read Part 6: Test Data Architecture with Fixture Factories](/blog/domain-modeling-part6) next.*

---

We've established that domain entities should be branded to prevent accidental serialization. But what happens when you have **deeply nested object graphs** where forgetting to map just one nested entity could leak sensitive data?

This is where the **poison pill pattern** comes in—a type-level safety mechanism that automatically detects unmapped branded types at any depth in your view models.

## The Nested Brand Problem

Consider this domain entity:

```typescript
export const UserProfileSchema = z.object({
  userId: z.uuid(),
  displayName: z.string(),
  
  // Nested branded entities
  experienceProfile: ExperienceProfileSchema, // Branded!
  fitnessGoals: FitnessGoalsSchema,          // Branded!
  stats: UserStatsSchema,                    // Branded!
  
  createdAt: z.coerce.date(),
}).brand<'SENSITIVE_DOMAIN_ENTITY'>();
```

When creating a view, you might remember to handle the root entity but **forget about nested ones**:

```typescript
// Oops - forgot to map nested entities!
export type UserProfileView = {
  userId: string;
  displayName: string;
  experienceProfile: ExperienceProfile; // ⚠️ Still branded!
  fitnessGoals: FitnessGoals;          // ⚠️ Still branded!
  stats: UserStats;                    // ⚠️ Still branded!
  createdAt: string;
};
```

**Without the poison pill**, TypeScript would allow this. The mapper function might look correct:

```typescript
export function toUserProfileView(profile: UserProfile): UserProfileView {
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    experienceProfile: profile.experienceProfile, // Branded type leaked!
    fitnessGoals: profile.fitnessGoals,
    stats: profile.stats,
    createdAt: profile.createdAt.toISOString(),
  };
}
```

This compiles, but you've just leaked branded domain entities into your API layer.

## The Poison Pill Solution

The `CreateView` utility automatically detects this and forces you to fix it:

```typescript
export type UserProfileView = CreateView<
  UserProfile,
  never,
  {
    // Must explicitly map nested branded types
    experienceProfile: ExperienceProfileView;
    fitnessGoals: FitnessGoalsView;
    stats: UserStatsView;
    
    // Can add computed fields
    memberSinceDays: number;
  }
>;
```

If you forget to override a branded field, you get a compile error:

```
⛔ ERROR: Raw Domain detected. You must Map or Omit this field! ⛔
```

## How It Works: The Type-Level Mechanism

Here's the implementation breakdown:

```typescript
// 1. Define the brand symbol
type DomainBrandTag = 'domain';

// 2. Define the error message (the "poison pill")
type DomainError = '⛔ ERROR: Raw Domain detected. You must Map or Omit this field! ⛔';

// 3. Define the safety marker
type ViewSafe = {
  [K in typeof z.$brand]?: DomainError;
};

// 4. Recursively resolve values
type ResolveValue<T> = T extends unknown
  ? // Case A: Date → string
    T extends Date
    ? string
    : // Case B: Array → Recurse into elements
    T extends (infer U)[]
    ? ResolveValue<U>[]
    : // Case C: Object → Recurse into properties
    T extends object
    ? {
        // Map all keys except the brand symbol
        [K in keyof T as K extends typeof z.$brand ? never : K]: ResolveValue<T[K]>
      } & ViewSafe // ← Inject the poison pill!
    : // Case D: Primitive → Keep as-is
    T
  : never;

// 5. Create the main utility
export type CreateView<
  TDomain,
  TOmit extends keyof Unbrand<TDomain> | never = never,
  TOverrides extends object = {}
> = Omit<
  {
    [K in keyof Unbrand<TDomain>]: ResolveValue<Unbrand<TDomain>[K]>;
  },
  TOmit | keyof TOverrides
> & TOverrides;
```

**What happens:**

1. **Strip the root brand** with `Unbrand<T>` (removes the `[z.$brand]` property)
2. **Recursively process values** with `ResolveValue`:
   - Dates become strings
   - Arrays recurse into elements
   - Objects recurse into properties **and inject `& ViewSafe`**
   - Primitives pass through unchanged
3. **The poison pill triggers** when a nested object still has a `[z.$brand]` property
4. **TypeScript shows the error** because `ViewSafe` requires `[z.$brand]?: DomainError`

## Real-World Example: Three Levels Deep

Let's trace through a complex case:

```typescript
// Level 1: Root entity
export const UserProfileSchema = z.object({
  userId: z.uuid(),
  
  // Level 2: Nested entity
  stats: UserStatsSchema,
}).brand<'domain'>();

// Level 2: Nested entity
export const UserStatsSchema = z.object({
  totalWorkouts: z.number(),
  
  // Level 3: Double-nested entity
  achievements: z.array(AchievementSchema),
}).brand<'domain'>();

// Level 3: Double-nested entity
export const AchievementSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  earnedAt: z.date(),
}).brand<'domain'>();
```

**Attempt 1: Forget everything**

```typescript
export type UserProfileView = CreateView<UserProfile>;
```

**Result:** Compile error on `stats`:
```
⛔ ERROR: Raw Domain detected. You must Map or Omit this field! ⛔
```

**Attempt 2: Map stats, forget nested achievements**

```typescript
export type UserProfileView = CreateView<
  UserProfile,
  never,
  {
    stats: UserStats, // Still branded!
  }
>;
```

**Result:** Compile error—`UserStats` itself is branded:
```
⛔ ERROR: Raw Domain detected. You must Map or Omit this field! ⛔
```

**Attempt 3: Map stats, forget to map achievements inside**

```typescript
export type UserStatsView = CreateView<
  UserStats,
  never,
  {
    // Forgot to override achievements array
  }
>;

export type UserProfileView = CreateView<
  UserProfile,
  never,
  {
    stats: UserStatsView, // Now unbanded
  }
>;
```

**Result:** Compile error in `UserStatsView`:
```
⛔ ERROR: Raw Domain detected. You must Map or Omit this field! ⛔
Property: achievements
```

**Attempt 4: Correctly map all levels**

```typescript
// Level 3: Achievement view
export type AchievementView = CreateView<Achievement>;
// ✅ No nested entities, so this works

// Level 2: Stats view
export type UserStatsView = CreateView<
  UserStats,
  never,
  {
    achievements: AchievementView[], // ✅ Mapped!
  }
>;

// Level 1: Profile view
export type UserProfileView = CreateView<
  UserProfile,
  never,
  {
    stats: UserStatsView, // ✅ Mapped!
  }
>;
```

**Result:** ✅ Compiles successfully! All brands have been removed.

## The Mapper Functions

The view types force you to write correct mappers:

```typescript
// Level 3
export function toAchievementView(achievement: Achievement): AchievementView {
  return serializeForView(achievement); // Just serialize dates
}

// Level 2
export function toUserStatsView(stats: UserStats): UserStatsView {
  const base = serializeForView(stats);
  
  return {
    ...base,
    achievements: stats.achievements.map(toAchievementView), // Map nested!
  };
}

// Level 1
export function toUserProfileView(profile: UserProfile): UserProfileView {
  const base = serializeForView(profile);
  
  return {
    ...base,
    stats: toUserStatsView(profile.stats), // Map nested!
  };
}
```

Notice the pattern: each level is responsible for mapping its immediate children.

## Date Serialization

The `ResolveValue` type automatically converts `Date` to `string`:

```typescript
type Entity = {
  id: string;
  createdAt: Date;
  stats: {
    lastWorkout: Date;
  };
};

type View = CreateView<Entity>;
// Result:
// {
//   id: string;
//   createdAt: string;  ← Date became string
//   stats: {
//     lastWorkout: string;  ← Nested Date also became string
//   };
// }
```

The `serializeForView` helper does this at runtime:

```typescript
export function serializeForView<T>(value: T): SerializeDates<T> {
  // Base case: Date
  if (value instanceof Date) {
    return value.toISOString() as SerializeDates<T>;
  }
  
  // Recursive case: Array
  if (Array.isArray(value)) {
    return value.map(serializeForView) as SerializeDates<T>;
  }
  
  // Recursive case: Object
  if (value && typeof value === 'object') {
    const result: any = {};
    for (const key in value) {
      result[key] = serializeForView((value as any)[key]);
    }
    return result;
  }
  
  // Base case: Primitive
  return value as SerializeDates<T>;
}
```

This ensures dates are always ISO strings in API responses, with no manual conversion needed.

## Automatic Type Safety

Here's the beautiful part: **you can't forget** to map nested entities.

```typescript
// Use case returns UserProfileView
export class GetProfileUseCase {
  async execute(req: GetProfileRequest): Promise<Result<UserProfileView>> {
    const profile = await this.repo.findById(req.userId);
    
    if (profile.isFailure) {
      return profile;
    }
    
    // ❌ This won't compile
    // return Result.ok(profile.value);
    
    // ✅ Must use view
    return Result.ok(toUserProfileView(profile.value));
  }
}
```

The return type enforces that you call `toUserProfileView`, and the view type enforces that you've mapped all nested entities.

## Edge Cases

### Optional Nested Entities

```typescript
export const ParentSchema = z.object({
  id: z.uuid(),
  child: ChildSchema.optional(), // Optional branded entity
}).brand<'domain'>();

export type ParentView = CreateView<
  Parent,
  never,
  {
    child: ChildView | undefined, // ✅ Preserve optionality
  }
>;

export function toParentView(parent: Parent): ParentView {
  const base = serializeForView(parent);
  
  return {
    ...base,
    child: parent.child ? toChildView(parent.child) : undefined,
  };
}
```

### Arrays of Branded Entities

```typescript
export const TeamSchema = z.object({
  id: z.uuid(),
  members: z.array(MemberSchema), // Array of branded entities
}).brand<'domain'>();

export type TeamView = CreateView<
  Team,
  never,
  {
    members: MemberView[], // ✅ Map to view array
  }
>;

export function toTeamView(team: Team): TeamView {
  const base = serializeForView(team);
  
  return {
    ...base,
    members: team.members.map(toMemberView),
  };
}
```

### Omitting Entire Nested Objects

```typescript
export const ServiceSchema = z.object({
  id: z.uuid(),
  credentials: CredentialsSchema, // Sensitive!
  metadata: MetadataSchema,
}).brand<'domain'>();

export type ServiceView = CreateView<
  Service,
  'credentials', // ✅ Omit entirely
  {
    metadata: MetadataView,
    hasValidCredentials: boolean, // Computed instead
  }
>;

export function toServiceView(service: Service): ServiceView {
  const base = serializeForView(service);
  
  return {
    ...base,
    metadata: toMetadataView(service.metadata),
    hasValidCredentials: !!service.credentials.accessToken,
  };
}
```

## Benefits Recap

**Automatic Detection**
- Catches forgotten mappings at compile time
- Works at any depth in the object graph
- No manual verification needed

**Type-Safe Serialization**
- Dates automatically become strings
- Complex types must be explicitly handled
- Can't accidentally leak branded types

**Clear Intent**
- View types document what's exposed
- Override syntax shows computed fields
- Omit syntax shows hidden fields

**Refactor Safety**
- Add a nested entity? TypeScript tells you to map it
- Change a nested type? View compilation breaks
- Remove a field? Unused mapper code is obvious

## Limitations

**Complex Error Messages**
When the poison pill triggers, TypeScript's error can be cryptic:

```
Type 'ExperienceProfile' does not satisfy the constraint 'ViewSafe'.
  Types of property '[z.$brand]' are incompatible.
```

**Solution:** The custom error message helps, but you still need to understand the pattern.

**No Runtime Enforcement**
The poison pill is compile-time only. At runtime, you could still do:

```typescript
const view: any = profile; // Bypasses type checking
return view;
```

**Solution:** Code review and linting to prevent `any` usage.

## Key Takeaways

1. **CreateView automatically detects** branded types at any depth
2. **The poison pill pattern** uses type constraints to force mapping
3. **Date serialization** happens automatically via `ResolveValue`
4. **Nested entities must be explicitly mapped** to their view types
5. **The compiler enforces correctness** - if it compiles, it's safe

The poison pill pattern transforms view creation from a **manual checklist** ("did I remember to serialize dates? did I omit credentials? did I map nested entities?") into a **compiler-enforced guarantee**.

---

**Next in this series:** Part 6 - Test Data Architecture with Fixture Factories

*See the complete implementation in the [example repository](#).*
