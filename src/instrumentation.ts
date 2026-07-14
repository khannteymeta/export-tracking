/**
 * Next.js Instrumentation hook.
 * Next.js automatically invokes the register() function once when the server starts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { initBackgroundJobs } = await import('./server/jobs/init');
      await initBackgroundJobs();
    } catch (err) {
      console.error('[Instrumentation] Failed to initialize background jobs during app startup:', err);
    }
  }
}
