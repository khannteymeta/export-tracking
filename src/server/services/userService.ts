import { db } from '@/lib/db';
import { users, accounts, sessions, type User } from '@/db/schema';
import { eq, and, count, desc } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '@/lib/errors';
import { validateInput, createUserSchema, type CreateUserInput, type UpdateUserInput } from '@/lib/validation';

function generateRandomPassword(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
  let tempPassword = '';
  // Generate a cryptographically secure 16-character password
  for (let i = 0; i < 16; i++) {
    tempPassword += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return tempPassword;
}

export const UserService = {
  /**
   * Retrieves a user by their unique ID.
   * Throws NotFoundError if the user does not exist.
   */
  async getById(id: string): Promise<User> {
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
      .then((res) => res[0]);

    if (!user) {
      throw new NotFoundError(`User with ID ${id}`);
    }

    return user;
  },

  /**
   * Validates and creates a new user, hashes their password,
   * inserts both user and account records, and returns the user without the password.
   */
  async create(data: CreateUserInput): Promise<User> {
    // 1. Validate inputs schema-level
    const validationResult = validateInput(createUserSchema, data);
    if (!validationResult.success) {
      throw new ValidationError(validationResult.error);
    }

    const { email, password, name, role } = validationResult.data;

    // 2. Check for duplicate email
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
      .then((res) => res[0]);

    if (existingUser) {
      throw new ConflictError('Email already in use');
    }

    // 3. Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 4. Create database records in a transaction to guarantee consistency
    return await db.transaction(async (tx) => {
      const userId = crypto.randomUUID();

      // Insert User
      const [newUser] = await tx
        .insert(users)
        .values({
          id: userId,
          name,
          email,
          role,
          isActive: true,
          mustChangePassword: false,
        })
        .returning();

      // Insert Account (BetterAuth credential link)
      await tx.insert(accounts).values({
        id: crypto.randomUUID(),
        userId,
        accountId: email,
        providerId: 'credential',
        password: hashedPassword,
      });

      return newUser;
    });
  },

  /**
   * Updates a user's details. Enforces authorization checks:
   * - A user can update their own details, or an admin can update anyone.
   * - Only admins can modify user roles.
   */
  async update(id: string, data: UpdateUserInput, requestingUser: User): Promise<User> {
    // 1. Validate authorization
    if (requestingUser.role !== 'admin' && requestingUser.id !== id) {
      throw new ForbiddenError('You are not authorized to update this user');
    }

    // 2. Prevent role escalations or edits by non-admins
    if (data.role && requestingUser.role !== 'admin') {
      throw new ForbiddenError('Only administrators can modify user roles');
    }

    // 3. Verify user exists
    const userToUpdate = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
      .then((res) => res[0]);

    if (!userToUpdate) {
      throw new NotFoundError(`User with ID ${id}`);
    }

    // 4. Update the user record
    const updatePayload: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (data.name !== undefined) {
      updatePayload.name = data.name;
    }
    if (data.role !== undefined) {
      updatePayload.role = data.role;
    }

    const [updatedUser] = await db
      .update(users)
      .set(updatePayload)
      .where(eq(users.id, id))
      .returning();

    return updatedUser;
  },

  /**
   * Lists users with optional filters and pagination.
   */
  async list(
    filters?: { role?: string; isActive?: boolean },
    pagination?: { page?: number; limit?: number }
  ): Promise<{ users: User[]; total: number }> {
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 25;
    const offset = (page - 1) * limit;

    const conditions = [];
    if (filters?.role) {
      conditions.push(eq(users.role, filters.role));
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(users.isActive, filters.isActive));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Retrieve total count for metadata headers/responses
    const [totalResult] = await db
      .select({ count: count() })
      .from(users)
      .where(whereClause);
    const total = Number(totalResult?.count || 0);

    // Retrieve paged data
    const listResult = await db
      .select()
      .from(users)
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(users.createdAt));

    return {
      users: listResult,
      total,
    };
  },

  /**
   * Resets password to a secure random printable string, hashes it,
   * updates the credentials in the database, and flags mustChangePassword.
   */
  async resetPassword(id: string): Promise<{ newPassword: string }> {
    // 1. Verify user exists
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
      .then((res) => res[0]);

    if (!user) {
      throw new NotFoundError(`User with ID ${id}`);
    }

    // 2. Generate and hash temporary password
    const temporaryPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    // 3. Update database
    await db.transaction(async (tx) => {
      // Find or create credential account
      const existingAccount = await tx
        .select()
        .from(accounts)
        .where(and(eq(accounts.userId, id), eq(accounts.providerId, 'credential')))
        .limit(1)
        .then((res) => res[0]);

      if (existingAccount) {
        await tx
          .update(accounts)
          .set({ password: hashedPassword, updatedAt: new Date() })
          .where(eq(accounts.id, existingAccount.id));
      } else {
        await tx.insert(accounts).values({
          id: crypto.randomUUID(),
          userId: id,
          accountId: user.email,
          providerId: 'credential',
          password: hashedPassword,
        });
      }

      // Mark user as requiring password change on next login
      await tx
        .update(users)
        .set({ mustChangePassword: true, updatedAt: new Date() })
        .where(eq(users.id, id));
    });

    return {
      newPassword: temporaryPassword,
    };
  },

  /**
   * Soft deletes a user (sets isActive = false) and invalidates all session tokens.
   */
  async deactivate(id: string): Promise<void> {
    // 1. Verify user exists
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1)
      .then((res) => res[0]);

    if (!user) {
      throw new NotFoundError(`User with ID ${id}`);
    }

    // 2. Perform deactivation and session deletion
    await db.transaction(async (tx) => {
      // Set isActive = false
      await tx
        .update(users)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(users.id, id));

      // Delete all sessions for the user to force immediate logout
      await tx.delete(sessions).where(eq(sessions.userId, id));
    });
  },
};
