import { vi, describe, it, expect, beforeEach } from 'vitest';
import { CustomerService } from '@/server/services/customerService';
import { db } from '@/lib/db';
import { NotFoundError, ForbiddenError, ConflictError } from '@/lib/errors';
import { type User } from '@/db/schema';

// Helper to create a chainable mock for Drizzle ORM
const makeChainableMock = (finalValue?: any) => {
  const mock: any = {};
  const methods = [
    'select',
    'from',
    'where',
    'limit',
    'offset',
    'orderBy',
    'leftJoin',
    'innerJoin',
    'groupBy',
    'as',
    'insert',
    'values',
    'returning',
    'update',
    'set',
    'delete',
  ];
  methods.forEach((method) => {
    mock[method] = vi.fn().mockReturnValue(mock);
  });
  if (finalValue !== undefined) {
    mock.then = vi.fn((resolve) => resolve(finalValue));
  }
  return mock;
};

// Mock the db dependency
vi.mock('@/lib/db', () => {
  return {
    db: {
      select: vi.fn(),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
});

// Mock the BullMQ/Redis importQueue dependency
vi.mock('@/server/jobs/importQueue', () => {
  return {
    importQueue: {
      add: vi.fn().mockResolvedValue({
        id: 'job-id-123',
        waitUntilFinished: vi.fn().mockResolvedValue({
          success: 2,
          failed: 1,
          errors: [{ row: 3, errors: ['Invalid email'] }],
        }),
      }),
    },
    importQueueEvents: {},
    initImportWorker: vi.fn(),
  };
});

describe('CustomerService Unit Tests', () => {
  const adminUser: User = {
    id: 'usr-admin',
    name: 'Admin User',
    email: 'admin@example.com',
    emailVerified: true,
    image: null,
    role: 'admin',
    permissions: null,
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const managerUser: User = {
    id: 'usr-manager',
    name: 'Manager User',
    email: 'manager@example.com',
    emailVerified: true,
    image: null,
    role: 'manager',
    permissions: null,
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const viewerUser: User = {
    id: 'usr-viewer',
    name: 'Viewer User',
    email: 'viewer@example.com',
    emailVerified: true,
    image: null,
    role: 'user', // "user" role is Viewer
    permissions: null,
    isActive: true,
    mustChangePassword: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getById', () => {
    it('should retrieve customer details with telegram chats for admin', async () => {
      const mockCustomer = { id: 'cust-1', name: 'Acme Corp', email: 'acme@example.com', phone: '123456789', address: '123 Main St', isActive: true };
      const mockChats = [{ id: 'chat-1', chatId: 123456789n, username: 'acme_alerts', type: 'group' }];

      const customerChain = makeChainableMock([mockCustomer]);
      vi.mocked(db.select).mockReturnValueOnce(customerChain);

      const chatsChain = makeChainableMock(mockChats);
      vi.mocked(db.select).mockReturnValueOnce(chatsChain);

      const result = await CustomerService.getById('cust-1', adminUser);

      expect(result).toEqual({ ...mockCustomer, telegramChats: mockChats });
    });

    it('should throw NotFoundError if customer does not exist', async () => {
      const customerChain = makeChainableMock([]);
      vi.mocked(db.select).mockReturnValueOnce(customerChain);

      await expect(CustomerService.getById('cust-nonexistent', adminUser)).rejects.toThrow(NotFoundError);
    });

    it('should allow Viewer access if customer is assigned (implicit by shipments)', async () => {
      const mockCustomer = { id: 'cust-1', name: 'Acme Corp', email: 'acme@example.com', phone: '123456789', address: '123 Main St', isActive: true };

      // 1. Mock shipment check (returns one shipment -> assigned)
      const shipmentChain = makeChainableMock([{ id: 'ship-1' }]);
      vi.mocked(db.select).mockReturnValueOnce(shipmentChain);

      // 2. Mock customer fetch
      const customerChain = makeChainableMock([mockCustomer]);
      vi.mocked(db.select).mockReturnValueOnce(customerChain);

      // 3. Mock chats fetch
      const chatsChain = makeChainableMock([]);
      vi.mocked(db.select).mockReturnValueOnce(chatsChain);

      const result = await CustomerService.getById('cust-1', viewerUser);
      expect(result.id).toBe('cust-1');
    });

    it('should throw ForbiddenError if Viewer is not assigned to the customer', async () => {
      // Mock shipment check (returns empty array -> not assigned)
      const shipmentChain = makeChainableMock([]);
      vi.mocked(db.select).mockReturnValueOnce(shipmentChain);

      await expect(CustomerService.getById('cust-1', viewerUser)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('create', () => {
    it('should create customer successfully', async () => {
      const createInput = {
        name: 'New Exporter',
        email: 'exporter@example.com',
        phone: '+123456789',
        location: 'California, US',
      };

      // Mock email unique check (none found)
      const emailCheckChain = makeChainableMock([]);
      vi.mocked(db.select).mockReturnValueOnce(emailCheckChain);

      // Mock insertion
      const mockReturnedCustomer = { id: 'cust-uuid', name: createInput.name, email: createInput.email, phone: createInput.phone, address: createInput.location, isActive: true };
      const insertChain = makeChainableMock([mockReturnedCustomer]);
      vi.mocked(db.insert).mockReturnValue(insertChain);

      const result = await CustomerService.create(createInput);

      expect(result).toEqual(mockReturnedCustomer);
      expect(db.insert).toHaveBeenCalled();
    });

    it('should throw ConflictError if email is already in use', async () => {
      const createInput = {
        name: 'New Exporter',
        email: 'duplicate@example.com',
        phone: '+123456789',
        location: 'California, US',
      };

      // Mock email unique check (found existing)
      const emailCheckChain = makeChainableMock([{ id: 'existing-id' }]);
      vi.mocked(db.select).mockReturnValue(emailCheckChain);

      await expect(CustomerService.create(createInput)).rejects.toThrow(ConflictError);
    });
  });

  describe('update', () => {
    it('should update customer details for Manager', async () => {
      const existingCustomer = { id: 'cust-1', name: 'Old Name', email: 'old@example.com', phone: '111', address: 'Old Address', isActive: true };
      const updatedCustomer = { ...existingCustomer, name: 'New Name' };

      // Mock customer exists check
      const customerCheckChain = makeChainableMock([existingCustomer]);
      vi.mocked(db.select).mockReturnValueOnce(customerCheckChain);

      // Mock update
      const updateChain = makeChainableMock([updatedCustomer]);
      vi.mocked(db.update).mockReturnValue(updateChain);

      const result = await CustomerService.update('cust-1', { name: 'New Name' }, managerUser);
      expect(result.name).toBe('New Name');
    });

    it('should throw ForbiddenError if update requested by Viewer', async () => {
      await expect(
        CustomerService.update('cust-1', { name: 'New Name' }, viewerUser)
      ).rejects.toThrow(ForbiddenError);
    });
  });

  describe('list', () => {
    it('should return list of customers with chatCount for Manager', async () => {
      const mockCountResult = [{ count: 12 }];
      const mockCustomerRows = [
        { customer: { id: 'cust-1', name: 'Cust 1', email: 'c1@example.com' }, chatCount: 2 },
        { customer: { id: 'cust-2', name: 'Cust 2', email: 'c2@example.com' }, chatCount: 0 },
      ];

      // 1. Mock total count select
      const countChain = makeChainableMock(mockCountResult);
      vi.mocked(db.select).mockReturnValueOnce(countChain);

      // 2. Mock subquery building (no then, just chainable)
      const subqueryChain = makeChainableMock();
      vi.mocked(db.select).mockReturnValueOnce(subqueryChain);

      // 3. Mock list select left join query
      const listChain = makeChainableMock(mockCustomerRows);
      vi.mocked(db.select).mockReturnValueOnce(listChain);

      const result = await CustomerService.list({ search: 'Cust' }, { page: 1, limit: 10 }, managerUser);

      expect(result.total).toBe(12);
      expect(result.customers).toHaveLength(2);
      expect(result.customers[0].chatCount).toBe(2);
    });
  });

  describe('delete', () => {
    it('should set isActive to false for soft delete', async () => {
      const existingCustomer = { id: 'cust-1', name: 'Cust 1', isActive: true };

      // Mock select
      const selectChain = makeChainableMock([existingCustomer]);
      vi.mocked(db.select).mockReturnValueOnce(selectChain);

      // Mock update
      const updateChain = makeChainableMock([]);
      vi.mocked(db.update).mockReturnValue(updateChain);

      await CustomerService.delete('cust-1', managerUser);

      expect(db.update).toHaveBeenCalled();
    });
  });

  describe('assignTelegramChat', () => {
    it('should assign a telegram chat to a customer if both exist and not linked', async () => {
      // Mock customer exists check
      const custChain = makeChainableMock([{ id: 'cust-1' }]);
      vi.mocked(db.select).mockReturnValueOnce(custChain);

      // Mock chat exists check
      const chatChain = makeChainableMock([{ id: 'chat-1' }]);
      vi.mocked(db.select).mockReturnValueOnce(chatChain);

      // Mock duplicate check (returns empty list)
      const dupChain = makeChainableMock([]);
      vi.mocked(db.select).mockReturnValueOnce(dupChain);

      // Mock insert
      const insertChain = makeChainableMock([]);
      vi.mocked(db.insert).mockReturnValue(insertChain);

      await CustomerService.assignTelegramChat('cust-1', 'chat-1');

      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('removeTelegramChat', () => {
    it('should remove telegram chat association', async () => {
      // Mock select association check (returns existing link)
      const linkChain = makeChainableMock([{ id: 'link-1' }]);
      vi.mocked(db.select).mockReturnValueOnce(linkChain);

      // Mock delete
      const deleteChain = makeChainableMock([]);
      vi.mocked(db.delete).mockReturnValue(deleteChain);

      await CustomerService.removeTelegramChat('cust-1', 'chat-1');

      expect(db.delete).toHaveBeenCalled();
    });
  });

  describe('bulkImport', () => {
    it('should add import job to queue and return results', async () => {
      const csvData = 'name,email,phone\nJohn,john@example.com,123\n';
      const result = await CustomerService.bulkImport(csvData);
      expect(result.success).toBe(2);
      expect(result.failed).toBe(1);
    });
  });
});
