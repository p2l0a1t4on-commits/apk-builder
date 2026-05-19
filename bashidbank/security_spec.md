# Security Specification for BashidBank

## Data Invariants
1. A `User` profile can only be created/updated by the authenticated owner.
2. An `Account` can only be read/written by the authenticated owner.
3. A `Transaction` can only be created by an authenticated user who is the `fromUserId`.
4. In a `Transaction`, `amount` must be positive.
5. All `createdAt`, `updatedAt`, and `timestamp` fields must be set to `request.time`.

## The Dirty Dozen Payloads
1. **Identity Spoofing**: Attempt to create a `User` profile for another user's UID.
2. **Identity Spoofing**: Attempt to update another user's `displayName`.
3. **Privilege Escalation**: Attempt to read another user's `Account` (balance).
4. **Data Poisoning**: Attempt to set a negative `amount` in a transaction.
5. **Data Poisoning**: Attempt to set a massive `amount` (e.g., 1e15) in a transaction.
6. **State Bypassing**: Attempt to create a transaction where `fromUserId` is not the sender.
7. **Timestamp Fraud**: Attempt to set a custom `timestamp` (past or future) in a transaction.
8. **Shadow Field Injection**: Attempt to add an `isAdmin: true` field to a `User` profile.
9. **Relational Sync Failure**: Attempt to create a `Transaction` without updating the `Account` balance (if using batches).
10. **Orphaned Write**: Attempt to create a `Transaction` to a non-existent `toUserId`.
11. **Update Gap**: Attempt to change the `currency` of an `Account` from `BSD` to something else.
12. **Malicious ID**: Attempt to create a document with a 1.5KB string as an ID.

## Test Runner
Testing will be performed via the standard Firestore rules testing suite (simulated behavior based on defined helpers).
