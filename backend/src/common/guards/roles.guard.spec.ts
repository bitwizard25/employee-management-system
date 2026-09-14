import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function mockContext(role: string | undefined, requiredRoles: string[] | undefined) {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(requiredRoles) } as unknown as Reflector;
  const guard = new RolesGuard(reflector);
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    getHandler: () => {},
    getClass: () => {},
  } as unknown as ExecutionContext;
  return { guard, context };
}

describe('RolesGuard', () => {
  it('allows access when no roles are required', () => {
    const { guard, context } = mockContext('employee', undefined);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when the user has a required role', () => {
    const { guard, context } = mockContext('admin', ['admin']);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies access when the user lacks a required role', () => {
    const { guard, context } = mockContext('employee', ['admin']);
    expect(guard.canActivate(context)).toBe(false);
  });
});
