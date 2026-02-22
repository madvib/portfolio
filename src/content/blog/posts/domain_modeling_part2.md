---
id: domain-modeling-part2
title: "Part 2: Type-Safe Domain Security with Branded Types"
date: "2026-01-08"
excerpt: "Primitive obsession is the root of many security vulnerabilities. Discover how branded types can prevent data leaks relative to sensitive domain entities at compile-time."
readTime: "7 min read"
tags:
  - typescript
  - domain-modeling
  - security
series: Domain Modeling in TypeScript
seriesPart: 2
---

# Domain Modeling in TypeScript: A Practical Guide

## Part 2: Type-Safe Domain Security with Branded Types

*This is Part 2 of a 5-part series on domain modeling in TypeScript. [Read Part 1: Architecture and Motivation](/blog/domain-modeling-part1) | [Read Part 3: Deriving Types from Validation Schemas](/blog/domain-modeling-part3) next.*

---

When building applications that handle sensitive data, one of the most dangerous vulnerabilities is accidentally exposing internal domain entities through your API. A misplaced spread operator, a forgotten `omit()`, or a well-intentioned refactor can leak credentials, PII, or other sensitive fields to clients.

TypeScript's type system is powerful, but standard types won't stop you from serializing a domain entity with sensitive fields directly into an API response. This is where **branded types** come in.

> **Note:** While this post uses Zod for illustration (because it's what this project uses), the brand pattern works equally well with pure TypeScript type branding or other validation libraries. The key insight is using the type system to mark entities as unsafe for serialization—how you achieve that is a tooling choice.

## The Problem

Consider this scenario:

```typescript
type User = {
  id: string;
  email: string;
  hashedPassword: string; // 😱 Should never be in API responses
  createdAt: Date;
};

// Later in a controller...
app.get('/users/:id', async (req, res) => {
  const user = await db.getUser(req.params.id);
  res.json(user); // ❌ Just leaked the hashed password!
});
```

Even experienced developers make this mistake. Code reviews catch some cases, but not all. We need the compiler to catch these errors.

## The Solution: Branded Domain Types

By marking domain entities with a type brand, we can indicate "unsafe for serialization" at the type level. With Zod, this looks like:

```typescript
import { z } from 'zod';

export const UserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  hashedPassword: z.string(),
  createdAt: z.coerce.date(),
}).brand<'SENSITIVE_DOMAIN_ENTITY'>();

export type User = Readonly<z.infer<typeof UserSchema>>;
```

> **Pure TypeScript alternative:** You can achieve the same effect with symbol-based type branding:
> ```typescript
> type Brand<T, B> = T & { [Symbol.iterator]: never } & { __brand: B };
> type User = Brand<{ id: string; email: string; hashedPassword: string }, 'SENSITIVE_DOMAIN_ENTITY'>;
> ```

Now `User` has an invisible type brand that prevents it from being used in API responses. The compiler will reject any attempt to serialize it directly.

## The View Layer Pattern

To safely expose domain data, we create explicit **View types** that:

1. Omit sensitive fields
2. Serialize complex types (Date → string)
3. Add computed/enriched fields

```typescript
import type { CreateView } from '@bene/shared';

export type UserView = CreateView<
  User,
  'hashedPassword', // Omit sensitive fields
  {
    // Add computed fields
    profileComplete: boolean;
    memberSince: string; // Serialized date
  }
>;

export function toUserView(user: User): UserView {
  const base = serializeForView(user); // Dates → ISO strings
  
  return {
    ...base,
    profileComplete: !!user.bio && !!user.avatar,
    memberSince: formatDistanceToNow(user.createdAt),
  };
}
```

The `CreateView` utility includes a "poison pill" that causes compile errors if you forget to convert nested branded entities:

```typescript
type ParentView = CreateView<Parent>; // ❌ Compile error!
// "⛔ ERROR: Raw Domain detected. You must Map or Omit this field! ⛔
//  Found brands in: syncStatus, credentials"
```

## Controlled Unbranding

There are exactly **two legitimate ways** to remove the brand:

### 1. Trusted Persistence Layer

When loading data from your database (a trusted source), use the `fromPersistence` factory:

```typescript
export function userFromPersistence(
  data: Unbrand<User>
): Result<User> {
  return Result.ok(data as User);
}
```

### 2. View Serialization

When preparing data for API responses, use the `toXView()` pattern shown above.

**Any other use of `Unbrand` is a code smell.** This includes:
- Type assertions in controllers
- Using `as` casts to bypass errors
- Adding `@ts-ignore` comments

## Real-World Example: ConnectedService

Let's look at a real entity that demonstrates why this matters:

```typescript
export const ConnectedServiceSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  serviceType: z.enum(['strava', 'garmin', 'fitbit']),
  
  // SENSITIVE - API credentials
  credentials: ServiceCredentialsSchema, // Contains accessToken, refreshToken
  
  // Metadata
  metadata: ServiceMetadataSchema,
  syncStatus: SyncStatusSchema,
  
  createdAt: z.coerce.date(),
  lastSyncAt: z.coerce.date().optional(),
}).brand<'SENSITIVE_DOMAIN_ENTITY'>();

export type ConnectedService = Readonly<z.infer<typeof ConnectedServiceSchema>>;
```

Without the brand system, it would be trivial to accidentally expose credentials:

```typescript
// ❌ DANGEROUS - but would compile without brands
app.get('/api/services/:id', async (req, res) => {
  const service = await repo.findById(req.params.id);
  return res.json(service); // Leaked accessToken and refreshToken!
});
```

With brands, this won't compile. You **must** map to a view:

```typescript
export type ConnectedServiceView = CreateView<
  ConnectedService,
  'credentials', // Explicitly omit credentials
  {
    syncStatus: SyncStatusView;
    metadata: ServiceMetadataView;
    hasValidCredentials: boolean;
    isSyncHealthy: boolean;
    totalSyncedItems: number;
    timeSinceLastSync: number | null;
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
    // Computed fields from queries
    hasValidCredentials: !!service.credentials.accessToken,
    isSyncHealthy: Queries.isSyncHealthy(service),
    totalSyncedItems: Queries.getTotalSyncedItems(service),
    timeSinceLastSync: Queries.getTimeSinceLastSync(service),
  };
}
```

Now the controller is type-safe:

```typescript
// ✅ SAFE - compiler enforces view mapping
app.get('/api/services/:id', async (req, res) => {
  const service = await repo.findById(req.params.id);
  
  // This won't compile:
  // return res.json(service); // ❌ Type error!
  
  // Must use view:
  return res.json(toConnectedServiceView(service)); // ✅
});
```

## Nested Brand Detection

The real power comes from detecting branded types **deep in object graphs**:

```typescript
// Parent entity with nested branded children
export const UserProfileSchema = z.object({
  userId: z.uuid(),
  displayName: z.string(),
  // These are ALSO branded domain entities
  experienceProfile: ExperienceProfileSchema, // Branded!
  fitnessGoals: FitnessGoalsSchema,           // Branded!
  stats: UserStatsSchema,                     // Branded!
  createdAt: z.coerce.date(),
}).brand<'SENSITIVE_DOMAIN_ENTITY'>();
```

If you forget to map a nested entity to its view:

```typescript
export type UserProfileView = CreateView<
  UserProfile,
  never,
  {
    // Oops, forgot to map these!
    shouldReceiveCheckIn: boolean,
  }
>;
```

You get a compile error on `experienceProfile`, `fitnessGoals`, and `stats`:

```
⛔ ERROR: Raw Domain detected. You must Map or Omit this field! ⛔
```

The fix is to explicitly provide view types:

```typescript
export type UserProfileView = CreateView<
  UserProfile,
  never,
  {
    experienceProfile: ExperienceProfileView, // ✅ Mapped
    fitnessGoals: FitnessGoalsView,           // ✅ Mapped
    stats: UserStatsView,                     // ✅ Mapped
    shouldReceiveCheckIn: boolean,
  }
>;
```

## How the Poison Pill Works

The `CreateView` utility uses a clever type-level trick. Here's the simplified implementation:

```typescript
type DomainBrandTag = 'domain';

// The poison pill error message
type DomainError = '⛔ ERROR: Raw Domain detected. You must Map or Omit this field! ⛔';

// Marker type that appears when brands are safely removed
type ViewSafe = {
  [K in typeof z.$brand]?: DomainError;
};

// Recursively process values
type ResolveValue<T> = 
  T extends Date ? string :              // Date → string
  T extends Array<infer U> ? ResolveValue<U>[] :  // Recurse arrays
  T extends object ? {
    // Map all keys except the brand
    [K in keyof T as K extends typeof z.$brand ? never : K]: ResolveValue<T[K]>
  } & ViewSafe :                          // Inject poison pill
  T;                                      // Primitives pass through

export type CreateView<
  TDomain,
  TOmit extends keyof Unbrand<TDomain> = never,
  TOverrides extends object = {}
> = Omit<
  {
    [K in keyof Unbrand<TDomain>]: ResolveValue<Unbrand<TDomain>[K]>;
  },
  TOmit | keyof TOverrides
> & TOverrides;
```

**What happens:**

1. Strip the root brand with `Unbrand<T>`
2. Recursively process each value with `ResolveValue`
3. For objects, inject `& ViewSafe` (the poison pill)
4. If a nested object has a brand, the `ViewSafe` type constraint fails
5. TypeScript shows the error message

This means **you can't accidentally leak branded types**, even deeply nested ones.

## Benefits in Practice

This pattern has prevented numerous security issues in production:

**1. Compile-time safety** - Forgotten sensitive fields cause build failures, not data leaks

**2. Self-documenting** - View types explicitly show what's safe to expose

**3. Nested protection** - The poison pill catches branded children in complex object graphs

**4. Refactor confidence** - Adding a sensitive field to an entity immediately highlights everywhere it needs handling

**5. No runtime overhead** - All enforcement happens at compile time

## Real Security Impact

Here are actual bugs this pattern caught during development:

```typescript
// Bug 1: Forgot to omit credentials
export type ServiceView = CreateView<ConnectedService>;
// ❌ Compile error: credentials field contains brand

// Bug 2: Forgot to map nested sync status
export type ServiceView = CreateView<
  ConnectedService,
  'credentials',
  { hasValidCredentials: boolean }
>;
// ❌ Compile error: syncStatus field contains brand

// Bug 3: Tried to return domain entity from API
async function getService(id: string): Promise<ConnectedServiceView> {
  const service = await repo.findById(id);
  return service; // ❌ Type error: ConnectedService ≠ ConnectedServiceView
}
```

All three bugs were caught **before code review**, **before tests**, **before production**.

## Tradeoffs

**Increased verbosity** - Every entity needs a View type and mapper function. For simple CRUD apps, this might feel like overkill.

**Learning curve** - New team members need to understand the brand system and why they can't just spread domain entities into responses.

**Type complexity** - The `CreateView` utility uses advanced TypeScript features. When it breaks, the error messages can be cryptic.

## When to Use This Pattern

This pattern shines when:

- You're handling sensitive data (credentials, PII, financial info)
- You have a medium-to-large team where code review can't catch everything
- You're building long-lived systems where security is critical
- You want compiler-enforced boundaries between domain and presentation layers

For simple apps or prototypes, standard TypeScript types with careful code review may suffice.

## Key Takeaways

1. **Brand domain entities** to mark them as unsafe for serialization
2. **Create explicit View types** that omit sensitive fields and add computed ones
3. **Use the poison pill pattern** to detect nested brands automatically
4. **Only unbrand in two places**: `fromPersistence` and view mappers
5. **Trust the compiler** - if it compiles, your data is safe

Branded types turn security vulnerabilities into compile errors. By making sensitive domain entities incompatible with serialization contexts, we leverage TypeScript's type system to prevent entire classes of bugs before they reach production.
