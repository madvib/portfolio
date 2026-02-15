---
id: domain-modeling-part7
title: "Isomorphic Domain Code"
date: "2026-02-12"
excerpt: "The ultimate goal: one domain to rule them all. See how to share your domain logic seamlessly across Node.js, Browsers, and Edge workers."
readTime: "7 min read"
---

# Domain Modeling in TypeScript: A Practical Guide

## Part 7: Isomorphic Domain Code

*This is Part 7 of a 7-part series on domain modeling in TypeScript. [Read Part 6: Test Data Architecture with Fixture Factories](/blog/domain-modeling-part6) to finish the series.*

---

Your domain code is the heart of your application. But what happens when you want to run it in different environments? Node.js for your API server, browsers for client-side validation, Cloudflare Workers for edge computing, Deno for serverless functions?

**Isomorphic domain code** runs anywhere JavaScript runs, by using only Web Standard APIs.

## The Problem: Node.js Lock-In

Most TypeScript backends start with Node-specific APIs:

```typescript
// user-profile.factory.ts
import { randomUUID } from 'crypto'; // ❌ Node.js only
import { URL } from 'url';           // ❌ Node.js only

export const CreateUserProfileSchema = UserProfileSchema
  .extend({
    id: z.uuid().optional(),
  })
  .transform((input) => ({
    ...input,
    id: input.id || randomUUID(), // Breaks in browser!
  }));

// workout-activity.commands.ts
export function validateVideoUrl(url: string): Result<string> {
  try {
    new URL(url); // Breaks in browser (if imported from 'url')!
    return Result.ok(url);
  } catch {
    return Result.fail('Invalid URL');
  }
}
```

**Problems:**

1. **Can't use in browsers** - Vite/Webpack externalize Node modules
2. **Can't use in Cloudflare Workers** - Node APIs not available
3. **Can't use in Storybook** - runs in browser context
4. **Can't use in React Native** - different runtime
5. **Hard to test client-side validation** - domain code won't bundle

When I added domain code as a dev dependency to Storybook for fixture factories, everything broke with:

```
Uncaught Error: Module "crypto" has been externalized for browser 
compatibility. Cannot access "crypto.randomUUID" in client code.
```

## The Solution: Web Standard APIs

Modern JavaScript runtimes (Node 18+, all browsers, Workers, Deno) support **Web Standard APIs**:

```typescript
// ✅ Works everywhere
crypto.randomUUID();        // Global crypto API
new URL(videoUrl);          // Global URL constructor
new Date();                 // Always available
Math.random();              // Always available
JSON.parse();               // Always available
```

These aren't Node APIs or browser APIs—they're **web platform standards** implemented consistently across runtimes.

## Migration: crypto Module

### Before (Node-only)

```typescript
import { randomUUID } from 'crypto';

export const CreateCheckInSchema = CheckInSchema
  .extend({
    id: z.uuid().optional(),
  })
  .transform((input) => ({
    ...input,
    id: input.id || randomUUID(),
  }));
```

### After (Isomorphic)

```typescript
// No import needed!

export const CreateCheckInSchema = CheckInSchema
  .extend({
    id: z.uuid().optional(),
  })
  .transform((input) => ({
    ...input,
    id: input.id || crypto.randomUUID(), // ✅ Global API
  }));
```

**The global `crypto` object is available in:**
- Node.js 19+ (and 15+ with flag)
- All modern browsers
- Cloudflare Workers
- Deno
- Bun

## Migration: url Module

### Before (Node-only)

```typescript
import { URL } from 'url';

export function validateVideoUrl(url: string): Result<string> {
  try {
    new URL(url);
    return Result.ok(url);
  } catch {
    return Result.fail('Invalid URL');
  }
}
```

### After (Isomorphic)

```typescript
// No import needed!

export function validateVideoUrl(url: string): Result<string> {
  try {
    new URL(url); // ✅ Global constructor
    return Result.ok(url);
  } catch {
    return Result.fail('Invalid URL');
  }
}
```

## Other Web Standard APIs

Your domain code can safely use:

**Crypto**
```typescript
crypto.randomUUID()              // Generate UUIDs
crypto.getRandomValues(array)    // Secure random bytes
crypto.subtle.digest()           // Hashing (SHA-256, etc.)
```

**URL Handling**
```typescript
new URL(string)                  // Parse and validate URLs
url.searchParams                 // Query string parsing
url.pathname, url.hostname       // URL components
```

**Encoding/Decoding**
```typescript
btoa(string)                     // Base64 encode
atob(string)                     // Base64 decode
TextEncoder                      // String to Uint8Array
TextDecoder                      // Uint8Array to string
```

**Date/Time**
```typescript
new Date()                       // Date handling
Date.now()                       // Current timestamp
Intl.DateTimeFormat             // Locale-aware formatting
```

**Data Structures**
```typescript
Map, Set, WeakMap, WeakSet      // Collections
Array methods                    // map, filter, reduce, etc.
Object.entries, keys, values     // Object manipulation
```

**JSON**
```typescript
JSON.parse(string)               // Parse JSON
JSON.stringify(object)           // Serialize JSON
```

## What You CAN'T Use

Avoid Node-specific modules entirely:

**❌ File System**
```typescript
import fs from 'fs';
import { readFile } from 'fs/promises';
```

**❌ Path Manipulation**
```typescript
import path from 'path';
import { join, resolve } from 'path';
```

**❌ Process/Environment**
```typescript
import { env } from 'process';
process.cwd();
```

**❌ Streams (Node-style)**
```typescript
import { Readable } from 'stream';
```

**❌ Utilities**
```typescript
import { promisify } from 'util';
import { inspect } from 'util';
```

**Domain code shouldn't need these anyway**—they're infrastructure concerns, not business logic.

## Real-World Impact

After migrating to Web Standard APIs:

**✅ Storybook works**
```typescript
// Fixtures now work in Storybook
export const WithProfile: Story = {
  args: {
    profile: toUserProfileView(
      createUserProfileFixture() // Uses crypto.randomUUID()
    ),
  },
};
```

**✅ Client-side validation**
```typescript
// Can reuse domain schemas in React
import { CreateCheckInSchema } from '@bene/domain';

function CheckInForm() {
  const onSubmit = (data: unknown) => {
    const result = CreateCheckInSchema.safeParse(data);
    // Same validation as backend!
  };
}
```

**✅ Edge runtime support**
```typescript
// Deploy to Cloudflare Workers
export default {
  async fetch(request: Request) {
    const data = await request.json();
    const checkIn = CreateCheckInSchema.parse(data);
    // Domain logic runs at the edge!
  },
};
```

## Enforcing Isomorphism: ESLint

Prevent accidental Node imports with linting:

```javascript
// packages/domain/.eslintrc.js
module.exports = {
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['crypto', 'node:crypto'],
          message: 'Use global crypto instead: crypto.randomUUID()',
        },
        {
          group: ['url', 'node:url'],
          message: 'Use global URL instead: new URL()',
        },
        {
          group: ['fs', 'fs/*', 'node:fs', 'node:fs/*'],
          message: 'Domain code cannot use file system APIs',
        },
        {
          group: ['path', 'node:path'],
          message: 'Domain code cannot use path APIs',
        },
        {
          group: ['util', 'node:util'],
          message: 'Domain code cannot use Node util APIs',
        },
        {
          group: ['stream', 'node:stream'],
          message: 'Domain code cannot use Node stream APIs',
        },
      ],
    }],
  },
};
```

Now if someone tries to import a Node module:

```typescript
import { randomUUID } from 'crypto'; // ❌ ESLint error!
// Use global crypto instead: crypto.randomUUID()
```

## Testing Across Runtimes

Because your domain is isomorphic, you can test it anywhere:

**Node.js (Vitest)**
```typescript
describe('CreateCheckInSchema', () => {
  it('generates UUID when not provided', () => {
    const checkIn = CreateCheckInSchema.parse({
      userId: '123',
      timestamp: new Date(),
    });
    
    expect(checkIn.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
});
```

**Browser (Playwright Component Tests)**
```typescript
test('validates check-in form', async ({ mount }) => {
  const component = await mount(<CheckInForm />);
  
  // Domain schema validates in browser!
  await component.getByLabel('User ID').fill('invalid');
  await component.getByRole('button').click();
  
  await expect(component).toContainText('Invalid UUID');
});
```

**Edge Runtime (Miniflare for Workers)**
```typescript
const env = getMiniflareBindings();
const worker = new MyWorker(env);

const response = await worker.fetch(new Request('http://localhost/', {
  method: 'POST',
  body: JSON.stringify({ userId: '123' }),
}));

const data = await response.json();
expect(data.id).toBeDefined(); // UUID generated at edge!
```

## Legacy Node.js Support

If you need to support Node.js < 19 (which doesn't have global `crypto`), use a polyfill:

```typescript
// shared/polyfills.ts
if (typeof crypto === 'undefined') {
  // Only runs in old Node versions
  globalThis.crypto = require('crypto').webcrypto;
}
```

Import this once at your application entry point, not in domain code.

## Performance Considerations

Web Standard APIs have excellent performance:

**crypto.randomUUID()**
- Faster than most UUID libraries
- Uses native crypto (hardware accelerated)
- No dependencies

**URL constructor**
- Native parsing, very fast
- Better than regex-based validation
- Handles edge cases correctly

**JSON.parse/stringify**
- Highly optimized in all runtimes
- Use for serialization, not custom implementations

## Design Principles

To keep domain code isomorphic:

**1. No I/O in Domain Layer**
Domain code should never:
- Read files
- Write files
- Make network requests
- Access environment variables
- Interact with databases

**2. Pure Business Logic**
Domain code should be:
- Pure functions (same input → same output)
- Deterministic (no randomness except crypto.randomUUID)
- Side-effect free (except creating new objects)

**3. Infrastructure at Boundaries**
Put platform-specific code in:
- Repositories (database I/O)
- Services (API calls)
- Controllers (HTTP handling)
- Adapters (external integrations)

## Real-World Example: Portable Workout Validation

```typescript
// workout.commands.ts - 100% isomorphic

export function validateWorkoutActivity(
  activity: WorkoutActivity,
  videoUrl?: string
): Result<WorkoutActivity> {
  // URL validation using Web Standard API
  if (videoUrl) {
    try {
      const url = new URL(videoUrl);
      
      // Business logic
      if (!['youtube.com', 'vimeo.com'].includes(url.hostname)) {
        return Result.fail('Video must be from YouTube or Vimeo');
      }
    } catch {
      return Result.fail('Invalid video URL');
    }
  }
  
  // More validation using only Web Standard APIs
  if (activity.exercises.length === 0) {
    return Result.fail('Workout must have at least one exercise');
  }
  
  const totalDuration = activity.exercises.reduce(
    (sum, ex) => sum + ex.durationSeconds,
    0
  );
  
  if (totalDuration > 7200) { // 2 hours
    return Result.fail('Workout cannot exceed 2 hours');
  }
  
  return Result.ok(activity);
}
```

This code runs identically in:
- Node.js API server
- React form validation
- Cloudflare Worker for edge validation
- Storybook for UI preview
- Vitest for testing

## Benefits Recap

**Portability**
- Run in Node.js, browsers, Workers, Deno
- No runtime-specific code
- Easy to migrate between platforms

**Reusability**
- Share validation between client and server
- Use in Storybook for fixtures
- Test in any environment

**Future-Proof**
- Web Standards evolve slowly
- Broad compatibility
- No dependency on Node.js versioning

**Simpler Dependencies**
- No polyfills needed (for modern runtimes)
- Smaller bundle sizes
- Fewer security vulnerabilities

**Better Testing**
- Test in actual target environments
- No mocking of platform APIs
- Confidence in real-world behavior

## Key Takeaways

1. **Use Web Standard APIs** - crypto, URL, Date, JSON
2. **Avoid Node-specific imports** - no fs, path, util, etc.
3. **Enforce with ESLint** - catch violations early
4. **Domain = pure business logic** - no I/O, no side effects
5. **Test anywhere** - Node, browser, edge, all work

Isomorphic domain code is **portable**, **reusable**, and **future-proof**. By constraining yourself to Web Standard APIs, you gain the freedom to run your business logic anywhere JavaScript runs.

---

## Series Conclusion

We've covered the complete FCIS pattern for domain modeling in TypeScript:

1. **FCIS Architecture** - Factories, Commands, Invariants (Guards), Schemas
2. **Branded Types** - Compile-time security for sensitive data
3. **Canonical Schemas** - Zod as single source of truth
4. **Queries** - Derived state and view logic
5. **ViewSafe** - Automatic nested brand detection
6. **Fixture Factories** - Composable, maintainable test data
7. **Isomorphic Code** - Portable across all JavaScript runtimes

Together, these patterns create a domain layer that is:
- **Type-safe** - compiler catches bugs
- **Secure** - brands prevent data leaks
- **Testable** - pure functions, easy fixtures
- **Maintainable** - single source of truth
- **Portable** - runs anywhere

The initial investment in setting up this architecture pays dividends in reduced bugs, faster development, and confident refactoring.

---

*See the complete implementation in the [example repository](#).*

*Have questions or improvements? [Open an issue](#) or [contribute](#).*
