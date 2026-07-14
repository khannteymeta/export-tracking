import { db } from '@/lib/db';
import {
  customers,
  telegramChats,
  customerTelegramChats,
  shipmentExports,
  type Customer,
  type TelegramChat,
  type User,
} from '@/db/schema';
import { eq, and, count, desc, or, inArray, sql } from 'drizzle-orm';
import { NotFoundError, ForbiddenError, ConflictError, ValidationError } from '@/lib/errors';
import {
  validateInput,
  createCustomerSchema,
  updateCustomerSchema,
  type CreateCustomerInput,
  type UpdateCustomerInput,
} from '@/lib/validation';
import { importQueue, importQueueEvents, initImportWorker } from '../jobs/importQueue';

/**
 * Checks if a customer is explicitly or implicitly assigned to a Viewer user.
 */
async function isCustomerAssigned(customerId: string, user: User): Promise<boolean> {
  if (user.role === 'admin' || user.role === 'manager') return true;

  // 1. Check explicit permissions
  if (user.permissions) {
    try {
      const perms = typeof user.permissions === 'string' ? JSON.parse(user.permissions) : user.permissions;
      if (Array.isArray(perms) && perms.includes(customerId)) {
        return true;
      }
    } catch {
      if (typeof user.permissions === 'string') {
        const perms = user.permissions.split(',').map((p) => p.trim());
        if (perms.includes(customerId)) return true;
      }
    }
  }

  // 2. Check implicit assignment (user created a shipment for this customer)
  const shipments = await db
    .select({ id: shipmentExports.id })
    .from(shipmentExports)
    .where(and(eq(shipmentExports.customerId, customerId), eq(shipmentExports.createdBy, user.id)))
    .limit(1);

  return shipments.length > 0;
}

export const CustomerService = {
  /**
   * Retrieves an active customer by ID, loading their assigned telegram chats.
   * Enforces Viewer (user role) visibility restrictions.
   */
  async getById(id: string, requestingUser?: User): Promise<Customer & { telegramChats: TelegramChat[] }> {
    // 1. Enforce access check for Viewer
    if (requestingUser) {
      const assigned = await isCustomerAssigned(id, requestingUser);
      if (!assigned) {
        throw new ForbiddenError('You are not authorized to view this customer');
      }
    }

    // 2. Fetch customer details
    const customer = await db
      .select()
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1)
      .then((res) => res[0]);

    if (!customer) {
      throw new NotFoundError(`Customer with ID ${id}`);
    }

    // 3. Fetch linked telegram chats
    const chats = await db
      .select({
        id: telegramChats.id,
        chatId: telegramChats.chatId,
        username: telegramChats.username,
        firstName: telegramChats.firstName,
        lastName: telegramChats.lastName,
        title: telegramChats.title,
        type: telegramChats.type,
        isActive: telegramChats.isActive,
        createdAt: telegramChats.createdAt,
      })
      .from(customerTelegramChats)
      .innerJoin(telegramChats, eq(customerTelegramChats.telegramChatId, telegramChats.id))
      .where(eq(customerTelegramChats.customerId, id));

    return {
      ...customer,
      telegramChats: chats,
    };
  },

  /**
   * Validates and creates a new customer.
   */
  async create(data: CreateCustomerInput): Promise<Customer> {
    const validationResult = validateInput(createCustomerSchema, data);
    if (!validationResult.success) {
      throw new ValidationError(validationResult.error);
    }

    const { name, email, phone, location } = validationResult.data;

    // Check duplicate email
    if (email) {
      const existing = await db
        .select()
        .from(customers)
        .where(eq(customers.email, email))
        .limit(1)
        .then((res) => res[0]);

      if (existing) {
        throw new ConflictError('Email already in use');
      }
    }

    const [newCustomer] = await db
      .insert(customers)
      .values({
        name,
        email: email ? email.toLowerCase().trim() : null,
        phone,
        address: location,
        isActive: true,
      })
      .returning();

    return newCustomer;
  },

  /**
   * Updates an existing customer. Requires Manager+ role.
   */
  async update(id: string, data: UpdateCustomerInput, requestingUser: User): Promise<Customer> {
    // 1. Authorize: Manager+ required
    if (requestingUser.role !== 'admin' && requestingUser.role !== 'manager') {
      throw new ForbiddenError('Manager access required to update customers');
    }

    // 2. Validate input
    const validationResult = validateInput(updateCustomerSchema, data);
    if (!validationResult.success) {
      throw new ValidationError(validationResult.error);
    }

    const { name, email, phone, location } = validationResult.data;

    // 3. Verify customer exists
    const existing = await db
      .select()
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1)
      .then((res) => res[0]);

    if (!existing) {
      throw new NotFoundError(`Customer with ID ${id}`);
    }

    // 4. Verify email uniqueness if changed
    if (email && email.toLowerCase().trim() !== existing.email?.toLowerCase().trim()) {
      const duplicate = await db
        .select()
        .from(customers)
        .where(eq(customers.email, email))
        .limit(1)
        .then((res) => res[0]);

      if (duplicate) {
        throw new ConflictError('Email already in use');
      }
    }

    const updatePayload: Partial<typeof customers.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updatePayload.name = name;
    if (email !== undefined) updatePayload.email = email ? email.toLowerCase().trim() : null;
    if (phone !== undefined) updatePayload.phone = phone;
    if (location !== undefined) updatePayload.address = location;

    const [updated] = await db
      .update(customers)
      .set(updatePayload)
      .where(eq(customers.id, id))
      .returning();

    return updated;
  },

  /**
   * Lists customers with pagination, search filters, and Viewer assignment constraints.
   * Returns records with count of linked telegram chats.
   */
  async list(
    filters?: { search?: string; isActive?: boolean },
    pagination?: { page?: number; limit?: number },
    requestingUser?: User
  ): Promise<{ customers: (Customer & { chatCount: number })[]; total: number }> {
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 25;
    const offset = (page - 1) * limit;

    const conditions = [];

    // Filter by isActive (default to active only if not specified)
    const activeFilter = filters?.isActive !== undefined ? filters.isActive : true;
    conditions.push(eq(customers.isActive, activeFilter));

    // Handle search filter (case-insensitive partial match on name, email, phone)
    if (filters?.search) {
      const searchPattern = `%${filters.search.toLowerCase()}%`;
      conditions.push(
        or(
          sql`lower(${customers.name}) like ${searchPattern}`,
          sql`lower(${customers.email}) like ${searchPattern}`,
          sql`${customers.phone} like ${searchPattern}`
        )
      );
    }

    // Handle Viewer-specific assignment constraints
    if (requestingUser && requestingUser.role !== 'admin' && requestingUser.role !== 'manager') {
      const assignedIds: string[] = [];
      if (requestingUser.permissions) {
        try {
          const perms = typeof requestingUser.permissions === 'string' ? JSON.parse(requestingUser.permissions) : requestingUser.permissions;
          if (Array.isArray(perms)) {
            assignedIds.push(...perms.filter((id) => typeof id === 'string'));
          }
        } catch {
          if (typeof requestingUser.permissions === 'string') {
            assignedIds.push(...requestingUser.permissions.split(',').map((p) => p.trim()));
          }
        }
      }

      const shipmentsSubQuery = db
        .select({ customerId: shipmentExports.customerId })
        .from(shipmentExports)
        .where(eq(shipmentExports.createdBy, requestingUser.id));

      if (assignedIds.length > 0) {
        conditions.push(
          or(
            inArray(customers.id, assignedIds),
            inArray(customers.id, shipmentsSubQuery)
          )
        );
      } else {
        conditions.push(inArray(customers.id, shipmentsSubQuery));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Fetch total count for pagination metadata
    const [totalResult] = await db
      .select({ count: count() })
      .from(customers)
      .where(whereClause);
    const total = Number(totalResult?.count || 0);

    // Left join subquery to count telegram chats for each customer
    const chatCounts = db
      .select({
        customerId: customerTelegramChats.customerId,
        count: count(customerTelegramChats.id).as('count'),
      })
      .from(customerTelegramChats)
      .groupBy(customerTelegramChats.customerId)
      .as('chat_counts');

    const rawList = await db
      .select({
        customer: customers,
        chatCount: sql<number>`coalesce(${chatCounts.count}, 0)::int`,
      })
      .from(customers)
      .leftJoin(chatCounts, eq(customers.id, chatCounts.customerId))
      .where(whereClause)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(customers.createdAt));

    const mappedList = rawList.map((item) => ({
      ...item.customer,
      chatCount: item.chatCount,
    }));

    return {
      customers: mappedList,
      total,
    };
  },

  /**
   * Soft deletes a customer (sets isActive = false). Requires Manager+ role.
   */
  async delete(id: string, requestingUser: User): Promise<void> {
    // 1. Authorize: Manager+ required
    if (requestingUser.role !== 'admin' && requestingUser.role !== 'manager') {
      throw new ForbiddenError('Manager access required to delete customers');
    }

    // 2. Verify existence
    const existing = await db
      .select()
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1)
      .then((res) => res[0]);

    if (!existing) {
      throw new NotFoundError(`Customer with ID ${id}`);
    }

    // 3. Apply soft delete
    await db
      .update(customers)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(customers.id, id));
  },

  /**
   * Links a Telegram Chat to a Customer.
   */
  async assignTelegramChat(customerId: string, telegramChatId: string): Promise<void> {
    // 1. Verify customer exists
    const customer = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1)
      .then((res) => res[0]);

    if (!customer) {
      throw new NotFoundError(`Customer with ID ${customerId}`);
    }

    // 2. Verify telegram chat exists
    const chat = await db
      .select({ id: telegramChats.id })
      .from(telegramChats)
      .where(eq(telegramChats.id, telegramChatId))
      .limit(1)
      .then((res) => res[0]);

    if (!chat) {
      throw new NotFoundError(`Telegram Chat with ID ${telegramChatId}`);
    }

    // 3. Verify no existing assignment (prevent duplicate)
    const existing = await db
      .select()
      .from(customerTelegramChats)
      .where(
        and(
          eq(customerTelegramChats.customerId, customerId),
          eq(customerTelegramChats.telegramChatId, telegramChatId)
        )
      )
      .limit(1)
      .then((res) => res[0]);

    if (existing) {
      throw new ConflictError('Telegram chat is already assigned to this customer');
    }

    // 4. Create link
    await db.insert(customerTelegramChats).values({
      customerId,
      telegramChatId,
    });
  },

  /**
   * Unlinks a Telegram Chat from a Customer.
   */
  async removeTelegramChat(customerId: string, telegramChatId: string): Promise<void> {
    // Verify relation exists
    const existing = await db
      .select()
      .from(customerTelegramChats)
      .where(
        and(
          eq(customerTelegramChats.customerId, customerId),
          eq(customerTelegramChats.telegramChatId, telegramChatId)
        )
      )
      .limit(1)
      .then((res) => res[0]);

    if (!existing) {
      throw new NotFoundError('Telegram chat association not found');
    }

    // Delete relation
    await db
      .delete(customerTelegramChats)
      .where(
        and(
          eq(customerTelegramChats.customerId, customerId),
          eq(customerTelegramChats.telegramChatId, telegramChatId)
        )
      );
  },

  /**
   * Dispatches and awaits bulk import job using BullMQ.
   */
  async bulkImport(csvData: string): Promise<{ success: number; failed: number; errors: any[] }> {
    // Start worker lazy
    initImportWorker();

    // Enqueue import job
    const job = await importQueue.add('import-customers-job', { csvData });

    // Wait for the worker to process the job and return the summary
    const result = await job.waitUntilFinished(importQueueEvents);

    return result as { success: number; failed: number; errors: any[] };
  },
};
