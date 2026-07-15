import { describe, it, expect } from 'vitest';
import { 
  validateInput,
  registerSchema,
  loginSchema,
  createUserSchema,
  updateUserSchema,
  changePasswordSchema,
  createCustomerSchema,
  createTrackerSchema,
  createShipmentExportSchema,
  flagExceptionSchema
} from '@/lib/validation';

describe('Zod Validation Schema Tests', () => {

  describe('registerSchema', () => {
    it('should validate correct registration payload', () => {
      const valid = {
        email: 'user@example.com',
        password: 'securePassword123!',
        name: 'John Doe',
        role: 'user'
      };
      const result = validateInput(registerSchema, valid);
      expect(result.success).toBe(true);
    });

    it('should fail registration if email is invalid', () => {
      const invalid = {
        email: 'not-an-email',
        password: 'securePassword123!',
        name: 'John Doe'
      };
      const result = validateInput(registerSchema, invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.email).toContain('Invalid email address');
      }
    });

    it('should fail registration if password is too short', () => {
      const invalid = {
        email: 'user@example.com',
        password: 'short',
        name: 'John Doe'
      };
      const result = validateInput(registerSchema, invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.password).toContain('Password must be at least 12 characters long');
      }
    });
  });

  describe('loginSchema', () => {
    it('should validate correct login payload', () => {
      const valid = {
        email: 'john@example.com',
        password: 'password123'
      };
      const result = validateInput(loginSchema, valid);
      expect(result.success).toBe(true);
    });

    it('should fail login if password is empty', () => {
      const invalid = {
        email: 'john@example.com',
        password: ''
      };
      const result = validateInput(loginSchema, invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('createUserSchema', () => {
    it('should validate correct user creation payload', () => {
      const valid = {
        email: 'manager@example.com',
        password: 'anotherSecurePassword123!',
        name: 'Manager User',
        role: 'manager'
      };
      const result = validateInput(createUserSchema, valid);
      expect(result.success).toBe(true);
    });
  });

  describe('updateUserSchema', () => {
    it('should validate empty update fields', () => {
      const result = validateInput(updateUserSchema, {});
      expect(result.success).toBe(true);
    });

    it('should reject empty name if name field is provided', () => {
      const invalid = { name: '' };
      const result = validateInput(updateUserSchema, invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('changePasswordSchema', () => {
    it('should validate different passwords', () => {
      const valid = {
        currentPassword: 'oldPassword123!',
        newPassword: 'newPassword123!AndLong'
      };
      const result = validateInput(changePasswordSchema, valid);
      expect(result.success).toBe(true);
    });

    it('should reject same passwords', () => {
      const invalid = {
        currentPassword: 'samePassword123!',
        newPassword: 'samePassword123!'
      };
      const result = validateInput(changePasswordSchema, invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.newPassword).toContain('New password must be different from current password');
      }
    });
  });

  describe('createCustomerSchema', () => {
    it('should validate correct customer info', () => {
      const valid = {
        name: 'Tech Exporters Ltd',
        email: 'info@techexporters.com',
        phone: '+6588887777',
        location: '1 Port Road, Singapore'
      };
      const result = validateInput(createCustomerSchema, valid);
      expect(result.success).toBe(true);
    });

    it('should fail customer creation if phone is empty', () => {
      const invalid = {
        name: 'Tech Exporters Ltd',
        email: 'info@techexporters.com',
        phone: '',
        location: '1 Port Road, Singapore'
      };
      const result = validateInput(createCustomerSchema, invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('createTrackerSchema', () => {
    it('should validate correct tracker info', () => {
      const valid = {
        externalTrackerId: 'TRK-98765',
        customerId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        label: 'Container Alpha',
        trackerType: 'gps'
      };
      const result = validateInput(createTrackerSchema, valid);
      expect(result.success).toBe(true);
    });
  });

  describe('createShipmentExportSchema', () => {
    it('should validate correct shipment details', () => {
      const valid = {
        trackerId: '8b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        customerId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        productCategory: 'electronics',
        productDescription: 'Temperature-sensitive insulin boxes',
        destinationCountry: 'DE',
        shippingMethod: 'air_freight'
      };
      const result = validateInput(createShipmentExportSchema, valid);
      expect(result.success).toBe(true);
    });

    it('should fail shipment creation if shipping method is unsupported', () => {
      const invalid = {
        trackerId: 'd45796bc-3456-5432-cb43-543210987654',
        customerId: 'c34685ab-2345-4321-ba32-432109876543',
        productCategory: 'pharmaceuticals',
        productDescription: 'Temperature-sensitive insulin boxes',
        destinationCountry: 'DE',
        shippingMethod: 'invalid_method'
      };
      const result = validateInput(createShipmentExportSchema, invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('flagExceptionSchema', () => {
    it('should validate supported exception reason', () => {
      const valid = {
        reason: 'signal_loss',
        notes: 'Lost satellite ping'
      };
      const result = validateInput(flagExceptionSchema, valid);
      expect(result.success).toBe(true);
    });

    it('should fail exception flag if reason is invalid', () => {
      const invalid = {
        reason: 'coffee_spill'
      };
      const result = validateInput(flagExceptionSchema, invalid);
      expect(result.success).toBe(false);
    });
  });
});
