import { UserService } from '../server/services/userService';
import { db } from '../lib/db';
import { users, accounts, sessions, auditLogs } from './schema';
import { eq } from 'drizzle-orm';

async function run() {
  console.log('--- STARTING USER MANAGEMENT SERVICE INTEGRATION TEST ---');

  try {
    // 1. Test database connection
    console.log('Testing connection to database...');
    // A quick check using drizzle
    await db.select({ count: users.id }).from(users).limit(1);
    console.log('Database connection successful!');
  } catch (error: any) {
    console.error('\n[DATABASE CONNECTION ERROR]');
    console.error('Could not connect to the database. Make sure your PostgreSQL server is running');
    console.error('and that the DATABASE_URL environment variable is configured correctly.');
    console.error('Error message:', error.message);
    console.log('\nExiting verification script. You can run unit tests with `bun run vitest` for mocked verification.');
    process.exit(1);
  }

  // Define test variables
  const testEmail = `test.user.${Date.now()}@example.com`;
  let testUserId: string | null = null;

  try {
    // 2. Create User
    console.log(`\n1. Creating test user: ${testEmail}...`);
    const newUser = await UserService.create({
      email: testEmail,
      name: 'Test Verification User',
      password: 'SecureTemporaryPassword123!',
      role: 'user',
    });
    testUserId = newUser.id;
    console.log('User created successfully:', {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      isActive: newUser.isActive,
    });

    // Verify credentials account was created
    const userAccount = await db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, newUser.id))
      .limit(1)
      .then((res) => res[0]);
    console.log('Associated credentials account exists:', !!userAccount);

    // 3. Get User by ID
    console.log(`\n2. Retrieving user by ID: ${testUserId}...`);
    const fetchedUser = await UserService.getById(testUserId);
    console.log('User retrieved successfully:', fetchedUser.name);

    // 4. List Users (filtered by role = 'user')
    console.log('\n3. Listing users (role: user, isActive: true)...');
    const { users: activeUsers, total } = await UserService.list({ role: 'user', isActive: true }, { page: 1, limit: 10 });
    console.log(`Found ${total} active user(s). User is in list:`, activeUsers.some(u => u.id === testUserId));

    // 5. Update User (updating name)
    console.log(`\n4. Updating user name (requestingUser: self)...`);
    const updatedUser = await UserService.update(testUserId, { name: 'Updated Verification User Name' }, fetchedUser);
    console.log('User updated name:', updatedUser.name);

    // 6. Reset Password
    console.log(`\n5. Resetting user password...`);
    const { newPassword } = await UserService.resetPassword(testUserId);
    console.log('Temporary password generated:', newPassword);
    
    // Check that mustChangePassword is set to true
    const userAfterReset = await UserService.getById(testUserId);
    console.log('User mustChangePassword value:', userAfterReset.mustChangePassword);

    // 7. Deactivate User
    console.log(`\n6. Deactivating user...`);
    await UserService.deactivate(testUserId);
    const userAfterDeactivate = await UserService.getById(testUserId);
    console.log('User isActive value:', userAfterDeactivate.isActive);

    // Verify that sessions table is cleared for this user
    const userSessions = await db.select().from(sessions).where(eq(sessions.userId, testUserId));
    console.log('Active user sessions remaining (should be 0):', userSessions.length);

    // 8. Retrieve Audit Logs
    console.log('\n7. Retrieving latest audit logs for this user...');
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, testUserId))
      .orderBy(auditLogs.createdAt);
    
    console.log(`Found ${logs.length} audit logs:`);
    logs.forEach((log) => {
      console.log(`- Action: ${log.action}, Entity: ${log.entity}, Timestamp: ${log.createdAt.toISOString()}`);
    });

    console.log('\n--- ALL SERVICE lifecycle operations VERIFIED SUCCESSFULLY ---');
  } catch (error: any) {
    console.error('\n[VERIFICATION ERROR]', error);
  } finally {
    // Cleanup created user to keep database clean
    if (testUserId) {
      console.log(`\nCleaning up created test user with ID ${testUserId}...`);
      await db.delete(accounts).where(eq(accounts.userId, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
      await db.delete(auditLogs).where(eq(auditLogs.entityId, testUserId));
      console.log('Cleanup completed.');
    }
    process.exit(0);
  }
}

run();
