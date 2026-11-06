# Firebase migration review

The migration replaces authentication and persistent storage throughout the application while preserving the existing finance screens and REST response shapes. Firebase IDs are strings, and form submission and validation preserve those IDs.

## Review checkpoints

- The root environment file is loaded by the server and explicitly mapped for Vite; only public Firebase web fields reach client code.
- The supplied service-account JSON is referenced externally and must belong to the configured project.
- Firebase verifies passwords; the expense API receives ID tokens and never handles password storage.
- Protected endpoints verify token expiry, project, revocation, and disabled-account state.
- Every finance path is scoped to the verified UID. Direct Firestore browser access is denied by rules.
- Sign-in restoration and token refresh use Firebase SDK state. Late responses cannot restore logged-out users, expire another account, or replay a write under a new identity.
- Financial mutations serialize on the user's root document and stage all reads before any writes.
- Uniqueness, category references, amount precision, and alert history behavior are covered by integration tests.
- Test and production environments are separated. Production rejects emulator configuration; integration tests require both emulators and a demo project.
- Test cleanup is limited to accounts created by the test run.

## Validation

See [VERIFICATION.md](VERIFICATION.md) for the completed run results and commands. API tests use the actual Firebase emulators; frontend tests use controlled SDK/network responses for race conditions; browser tests exercise real SDK interactions against the emulators.
