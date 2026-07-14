import { vi, describe, it, expect, beforeEach } from 'vitest';
import { UserService } from '@/server/services/userService';
import { db } from '@/lib/db';
import { NotFoundError, ForbiddenError, ConflictError } from '@/lib/errors';
import bcrypt from 'bcryptjs';

// Mock the db dependency
vi.mock('@/lib/db', () => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn((cb) => cb(mockDb)),
  };
  return { db: mockDb };
});

describe('UserService Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getById', () => {
    it('should return a user if found', async () => {
      const mockUser = { id: 'usr-1', name: 'John Doe', email: 'john@example.com', role: 'user', isActive: true };
      
      const mockLimit = vi.fn().mockResolvedValue([mockUser]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

      const result = await UserService.getById('usr-1');
      expect(result).toEqual(mockUser);
      expect(db.select).toHaveBeenCalled();
    });

    it('should throw NotFoundError if user not found', async () => {
      const mockLimit = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

      await expect(UserService.getById('usr-nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('create', () => {
    it('should create a new user successfully if email is unique', async () => {
      const createInput = {
        email: 'new@example.com',
        name: 'New User',
        password: 'securePassword123!',
        role: 'user' as const,
      };

      // 1. Email check mock (select returns empty array)
      const mockLimit = vi.fn().mockResolvedValue([]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.select).mockReturnValueOnce({ from: mockFrom } as any);

      // 2. Transaction insertions mock
      const mockReturnedUser = { id: 'generated-uuid', email: createInput.email, name: createInput.name, role: createInput.role, isActive: true };
      const mockReturning = vi.fn().mockResolvedValue([mockReturnedUser]);
      const mockValues = vi.fn().mockReturnValue({ returning: mockReturning });
      vi.mocked(db.insert).mockReturnValue({ values: mockValues } as any);

      const spyHash = vi.spyOn(bcrypt, 'hash');

      const result = await UserService.create(createInput);
      
      expect(result).toEqual(mockReturnedUser);
      expect(spyHash).toHaveBeenCalledWith(createInput.password, 10);
      expect(db.insert).toHaveBeenCalledTimes(2); // One for user, one for account
    });

    it('should throw ConflictError if email already exists', async () => {
      const createInput = {
        email: 'duplicate@example.com',
        name: 'Duplicate',
        password: 'securePassword123!',
        role: 'user' as const,
      };

      // Email check mock (select returns existing user)
      const mockLimit = vi.fn().mockResolvedValue([{ id: 'existing' }]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.select).mockReturnValue({ from: mockFrom } as any);

      await expect(UserService.create(createInput)).rejects.toThrow(ConflictError);
    });
  });

  describe('update', () => {
    const requestingUser = { id: 'usr-self', name: 'Self', email: 'self@example.com', role: 'user', isActive: true, mustChangePassword: false, emailVerified: true, image: null, permissions: null, createdAt: new Date(), updatedAt: new Date() };
    const adminUser = { id: 'usr-admin', name: 'Admin', email: 'admin@example.com', role: 'admin', isActive: true, mustChangePassword: false, emailVerified: true, image: null, permissions: null, createdAt: new Date(), updatedAt: new Date() };

    it('should allow user to update their own name', async () => {
      // Mock retrieve user to update
      const mockLimit = vi.fn().mockResolvedValue([requestingUser]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.select).mockReturnValueOnce({ from: mockFrom } as any);

      // Mock update statement
      const updatedUser = { ...requestingUser, name: 'New Name' };
      const mockReturning = vi.fn().mockResolvedValue([updatedUser]);
      const mockSet = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: mockReturning }) });
      vi.mocked(db.update).mockReturnValue({ set: mockSet } as any);

      const result = await UserService.update('usr-self', { name: 'New Name' }, requestingUser);
      expect(result).toEqual(updatedUser);
      expect(db.update).toHaveBeenCalled();
    });

    it('should prevent non-admin from updating another user', async () => {
      await expect(
        UserService.update('usr-other', { name: 'New Name' }, requestingUser)
      ).rejects.toThrow(ForbiddenError);
    });

    it('should prevent non-admin from changing their own role', async () => {
      await expect(
        UserService.update('usr-self', { role: 'admin' }, requestingUser)
      ).rejects.toThrow(ForbiddenError);
    });

    it('should allow admin to update other user role', async () => {
      const userToUpdate = { id: 'usr-other', name: 'Other', email: 'other@example.com', role: 'user', isActive: true };
      
      // Mock select
      const mockLimit = vi.fn().mockResolvedValue([userToUpdate]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.select).mockReturnValueOnce({ from: mockFrom } as any);

      // Mock update
      const updatedUser = { ...userToUpdate, role: 'manager' };
      const mockReturning = vi.fn().mockResolvedValue([updatedUser]);
      const mockSet = vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: mockReturning }) });
      vi.mocked(db.update).mockReturnValue({ set: mockSet } as any);

      const result = await UserService.update('usr-other', { role: 'manager' }, adminUser);
      expect(result.role).toBe('manager');
    });
  });

  describe('list', () => {
    it('should return paginated list of users and total count', async () => {
      const mockCountResult = [{ count: 10 }];
      const mockUsersList = [
        { id: 'usr-1', name: 'User 1', email: 'user1@example.com' },
        { id: 'usr-2', name: 'User 2', email: 'user2@example.com' },
      ];

      // Mock total count select
      const mockCountFrom = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(mockCountResult) });
      vi.mocked(db.select).mockReturnValueOnce({ from: mockCountFrom } as any);

      // Mock list select
      const mockOrderBy = vi.fn().mockResolvedValue(mockUsersList);
      const mockOffset = vi.fn().mockReturnValue({ orderBy: mockOrderBy });
      const mockLimit = vi.fn().mockReturnValue({ offset: mockOffset });
      const mockListWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockListFrom = vi.fn().mockReturnValue({ where: mockListWhere });
      vi.mocked(db.select).mockReturnValueOnce({ from: mockListFrom } as any);

      const result = await UserService.list({ isActive: true }, { page: 1, limit: 2 });
      
      expect(result.total).toBe(10);
      expect(result.users).toEqual(mockUsersList);
    });
  });

  describe('resetPassword', () => {
    it('should generate a new password and set mustChangePassword flag', async () => {
      const mockUser = { id: 'usr-1', email: 'user@example.com', name: 'Test' };
      
      // Mock check user existence
      const mockLimit = vi.fn().mockResolvedValue([mockUser]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.select).mockReturnValueOnce({ from: mockFrom } as any);

      // Transaction queries mock (select for account existence)
      const mockAccountLimit = vi.fn().mockResolvedValue([{ id: 'acc-1' }]);
      const mockAccountWhere = vi.fn().mockReturnValue({ limit: mockAccountLimit });
      const mockAccountFrom = vi.fn().mockReturnValue({ where: mockAccountWhere });
      vi.mocked(db.select).mockReturnValueOnce({ from: mockAccountFrom } as any); // inside tx callback

      // Mock account update and user update statements
      vi.mocked(db.update).mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) } as any);

      const result = await UserService.resetPassword('usr-1');
      
      expect(result.newPassword).toBeDefined();
      expect(result.newPassword.length).toBe(16);
      expect(db.update).toHaveBeenCalledTimes(2); // One for credentials, one for users
    });
  });

  describe('deactivate', () => {
    it('should set isActive to false and delete sessions', async () => {
      const mockUser = { id: 'usr-1', email: 'user@example.com', name: 'Test' };
      
      // Mock check user existence
      const mockLimit = vi.fn().mockResolvedValue([mockUser]);
      const mockWhere = vi.fn().mockReturnValue({ limit: mockLimit });
      const mockFrom = vi.fn().mockReturnValue({ where: mockWhere });
      vi.mocked(db.select).mockReturnValueOnce({ from: mockFrom } as any);

      // Mock update and delete statements inside tx
      vi.mocked(db.update).mockReturnValue({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }) } as any);
      vi.mocked(db.delete).mockReturnValue({ where: vi.fn().mockResolvedValue([]) } as any);

      await UserService.deactivate('usr-1');
      
      expect(db.update).toHaveBeenCalled();
      expect(db.delete).toHaveBeenCalled();
    });
  });
});
