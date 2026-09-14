/**
 * Static env vars every e2e test needs (everything except MONGO_URI, which
 * each spec sets itself from its own MongoMemoryServer instance). AppModule
 * skips loading `.env` under Vitest (see app.module.ts) so these values —
 * not whatever is in the developer's local `.env` — are what the app sees.
 */
export function setStaticTestEnv(): void {
  process.env.PORT = '3000';
  process.env.JWT_ACCESS_SECRET = 'e2e-test-access-secret-32-characters';
  process.env.JWT_REFRESH_SECRET = 'e2e-test-refresh-secret-32-characters';
  process.env.GOOGLE_CLIENT_ID = 'e2e-test-google-client-id';
  process.env.ALLOWED_GOOGLE_DOMAIN = 'example.com';
  process.env.ADMIN_EMAILS = 'admin@example.com';
}
