// Shared helpers for unit tests (*.spec.ts). Not imported by application code.
import { User } from './entities/user.entity';
import { RoleName } from './common/enums/role.enum';

/** A jest-mocked TypeORM repository: `create` echoes its input, `save` assigns an id. */
export function mockRepo() {
  let nextId = 100;
  return {
    findOne: jest.fn(),
    find: jest.fn(),
    findBy: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    upsert: jest.fn(),
    remove: jest.fn(),
    create: jest.fn((x: any) => ({ ...x })),
    save: jest.fn((x: any) =>
      Promise.resolve(x.id ? x : { ...x, id: nextId++ }),
    ),
    createQueryBuilder: jest.fn(),
  };
}

export type MockRepo = ReturnType<typeof mockRepo>;

export function userWith(role: RoleName, extra: Partial<User> = {}): User {
  return {
    id: 1,
    email: 'u@example.com',
    role: { id: 9, name: role },
    organizationId: role === RoleName.MASTER_ADMIN ? null : 10,
    organization:
      role === RoleName.MASTER_ADMIN
        ? null
        : {
            id: 10,
            name: 'Firm',
            approvalStatus: 'approved',
            accessUntil: null,
          },
    ...extra,
  } as unknown as User;
}
