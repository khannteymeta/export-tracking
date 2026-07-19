import { db } from './db';
import { users, sessions, accounts, verifications, type User } from '../db/schema';
import { eq, and, ne, lt, lte, gt, gte, inArray, like, desc, asc, count } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { betterAuth } from 'better-auth';
import crypto from 'crypto';

// Custom Drizzle-backed database adapter for BetterAuth to manage tables directly
const customDrizzleAdapter = {
  id: 'custom-drizzle-adapter',
  provider: 'postgres', // PostgreSQL adapter provider
  create: async ({ model, data }: { model: string; data: any }) => {
    const table = getTable(model);
    if (!data.id) {
      data.id = crypto.randomUUID();
    }
    const [result] = await db.insert(table).values(data).returning();
    return result;
  },
  findOne: async ({ model, where, join }: { model: string; where: any[]; join?: any }) => {
    const table = getTable(model);
    const conditions = getConditions(table, where);
    const [result] = await db.select().from(table).where(and(...conditions)).limit(1);
    
    if (result && join) {
      if (model === 'user' && join.account) {
        const userAccounts = await db
          .select()
          .from(accounts)
          .where(eq(accounts.userId, result.id));
        (result as any).account = userAccounts;
      }
      if (model === 'session' && join.user) {
        const [sessionUser] = await db
          .select()
          .from(users)
          .where(eq(users.id, result.userId))
          .limit(1);
        (result as any).user = sessionUser || null;
      }
    }
    return result || null;
  },
  findMany: async ({ model, where, limit, offset, sortBy, join }: { model: string; where?: any[]; limit?: number; offset?: number; sortBy?: any; join?: any }) => {
    const table = getTable(model);
    let query = db.select().from(table);
    if (where && where.length > 0) {
      const conditions = getConditions(table, where);
      query = query.where(and(...conditions)) as any;
    }
    if (limit !== undefined) {
      query = query.limit(limit) as any;
    }
    if (offset !== undefined) {
      query = query.offset(offset) as any;
    }
    if (sortBy) {
      const column = table[sortBy.field];
      if (column) {
        query = query.orderBy(sortBy.direction === 'desc' ? desc(column) : asc(column)) as any;
      }
    }
    const results = await query;

    if (results.length > 0 && join) {
      if (model === 'session' && join.user) {
        for (const session of results) {
          const [sessionUser] = await db
            .select()
            .from(users)
            .where(eq(users.id, session.userId))
            .limit(1);
          (session as any).user = sessionUser || null;
        }
      }
      if (model === 'user' && join.account) {
        for (const user of results) {
          const userAccounts = await db
            .select()
            .from(accounts)
            .where(eq(accounts.userId, user.id));
          (user as any).account = userAccounts;
        }
      }
    }
    return results;
  },
  update: async ({ model, where, update }: { model: string; where: any[]; update: any }) => {
    const table = getTable(model);
    const conditions = getConditions(table, where);
    const [result] = await db.update(table).set(update).where(and(...conditions)).returning();
    return result || null;
  },
  updateMany: async ({ model, where, update }: { model: string; where: any[]; update: any }) => {
    const table = getTable(model);
    const conditions = getConditions(table, where);
    const results = await db.update(table).set(update).where(and(...conditions)).returning();
    return results;
  },
  delete: async ({ model, where }: { model: string; where: any[] }) => {
    const table = getTable(model);
    const conditions = getConditions(table, where);
    const [result] = await db.delete(table).where(and(...conditions)).returning();
    return result || null;
  },
  deleteMany: async ({ model, where }: { model: string; where: any[] }) => {
    const table = getTable(model);
    const conditions = getConditions(table, where);
    const results = await db.delete(table).where(and(...conditions)).returning();
    return results;
  },
  count: async ({ model, where }: { model: string; where?: any[] }) => {
    const table = getTable(model);
    let query = db.select({ count: count() }).from(table);
    if (where && where.length > 0) {
      const conditions = getConditions(table, where);
      query = query.where(and(...conditions)) as any;
    }
    const [result] = await query;
    return result ? Number(result.count) : 0;
  }
};

const tables: Record<string, any> = {
  user: users,
  session: sessions,
  account: accounts,
  verification: verifications,
};

function getTable(model: string) {
  const table = tables[model];
  if (!table) throw new Error(`Unknown model: ${model}`);
  return table;
}

function getConditions(table: any, filters: any[]) {
  return filters.map(filter => {
    const column = table[filter.field];
    if (!column) {
      throw new Error(`Unknown field ${filter.field} on model`);
    }
    const value = filter.value;
    switch (filter.operator) {
      case 'eq':
        return eq(column, value);
      case 'ne':
        return ne(column, value);
      case 'lt':
        return lt(column, value);
      case 'lte':
        return lte(column, value);
      case 'gt':
        return gt(column, value);
      case 'gte':
        return gte(column, value);
      case 'in':
        return inArray(column, value);
      case 'contains':
        return like(column, `%${value}%`);
      case 'starts_with':
        return like(column, `${value}%`);
      case 'ends_with':
        return like(column, `%${value}`);
      default:
        return eq(column, value);
    }
  });
}

// Initializing BetterAuth with Custom Adapter, bcrypt Hashing, and JWT/Refresh Expiries
export const auth = betterAuth({
  database: () => customDrizzleAdapter,
  passwordHasher: 'bcrypt', // Custom password hasher setting
  session: {
    // 7-day expiry for access (session) token
    expiresIn: 60 * 60 * 24 * 7,
    // 30-day expiry for refresh token (sliding window limit or update age configuration)
    updateAge: 60 * 60 * 24, // Sliding refresh checked daily
  },
  // Direct customization values for application token requirements
  jwt: {
    accessToken: {
      expiresIn: '7d',
    },
    refreshToken: {
      expiresIn: '30d',
    },
  } as any,
  emailAndPassword: {
    enabled: true,
    password: {
      hash: async (password: string) => {
        return await bcrypt.hash(password, 10);
      },
      verify: async ({ hash, password }) => {
        return await bcrypt.compare(password, hash);
      },
    },
  },
});


// Retrieves the authenticated user from the Request
export async function getCurrentUser(request: Request): Promise<User | null> {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  let token: string | null = null;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }
  if (!token) {
    const cookieHeader = request.headers.get('Cookie') || request.headers.get('cookie') || '';
    const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
    if (match) {
      token = match[1];
    }
  }

  if (token) {
    const [sessionRecord] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.token, token))
      .limit(1);
    if (sessionRecord && sessionRecord.expiresAt > new Date()) {
      const [userRecord] = await db
        .select()
        .from(users)
        .where(eq(users.id, sessionRecord.userId))
        .limit(1);
      if (userRecord) {
        return userRecord;
      }
    }
  }

  const sessionRes = await auth.api.getSession({
    headers: request.headers,
  });
  return (sessionRes?.user as User) || null;
}

// Validates if the user is an Admin
export function validateAdmin(user: User): boolean {
  return user.role === 'admin';
}

// Validates if the user is a Manager or Admin
export function validateManager(user: User): boolean {
  return user.role === 'manager' || user.role === 'admin';
}

// Validates if the user has a specific permission
export function validatePermission(user: User, resource: string): boolean {
  if (user.role === 'admin') return true;
  if (!user.permissions) return false;
  
  try {
    const perms = typeof user.permissions === 'string'
      ? JSON.parse(user.permissions)
      : user.permissions;
      
    if (Array.isArray(perms)) {
      return perms.includes(resource);
    }
  } catch {
    if (typeof user.permissions === 'string') {
      return user.permissions.split(',').map(p => p.trim()).includes(resource);
    }
  }
  return false;
}
