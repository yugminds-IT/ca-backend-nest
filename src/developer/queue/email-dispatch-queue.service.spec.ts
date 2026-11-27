import { EmailDispatchQueueService, QueuedEmailJob } from './email-dispatch-queue.service';

const mockAdd = jest.fn();
const mockQueueClose = jest.fn().mockResolvedValue(undefined);
const mockWorkerClose = jest.fn().mockResolvedValue(undefined);

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: mockAdd, close: mockQueueClose })),
  Worker: jest.fn().mockImplementation(() => ({ on: jest.fn(), close: mockWorkerClose })),
}));

jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue('OK'),
  })),
}));

const job = (): Omit<QueuedEmailJob, 'attempts' | 'maxAttempts'> => ({
  messageId: 'msg-1',
  orgId: 7,
  apiKeyId: null,
  from: 'Tavaro <no-reply@example.com>',
  to: ['guest@example.com'],
  subject: 'Hello',
  text: 'Hi',
  html: '<p>Hi</p>',
});

function build(overrides: { suppressed?: boolean } = {}) {
  const emailLogRepo = { findOne: jest.fn().mockResolvedValue(null), save: jest.fn() };
  const webhookRepo = { find: jest.fn().mockResolvedValue([]) };
  const complianceService = {
    isSuppressed: jest.fn().mockResolvedValue(overrides.suppressed ?? false),
    generateUnsubscribeToken: jest.fn().mockReturnValue('token'),
  };
  const emailService = { sendMail: jest.fn().mockResolvedValue(true) };
  const eventsGateway = { emitToOrg: jest.fn() };
  const service = new EmailDispatchQueueService(
    emailLogRepo as never,
    webhookRepo as never,
    emailService as never,
    complianceService as never,
    eventsGateway as never,
  );
  return { service, emailLogRepo, complianceService };
}

describe('EmailDispatchQueueService (no REDIS_URL, in-memory mode)', () => {
  const original = process.env.REDIS_URL;
  let service: EmailDispatchQueueService;

  beforeEach(() => {
    delete process.env.REDIS_URL;
    jest.clearAllMocks();
    ({ service } = build());
    service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    if (original === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = original;
  });

  it('keeps enqueued mail in the in-process queue and never touches BullMQ', async () => {
    await service.enqueue(job());
    expect((service as any).memoryQueue).toHaveLength(1);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('drops a suppressed recipient without queueing', async () => {
    const built = build({ suppressed: true });
    built.service.onModuleInit();
    await built.service.enqueue(job());
    expect((built.service as any).memoryQueue).toHaveLength(0);
    await built.service.onModuleDestroy();
  });

  it('asks for a retry when a send fails with attempts left, and fails permanently at the limit', async () => {
    const dispatch = (service as any).dispatchJob.bind(service);
    const base = { ...job(), attempts: 1, maxAttempts: 3 };
    (service as any).emailService = { sendMail: jest.fn().mockResolvedValue(false) };
    await expect(dispatch(base)).resolves.toBe('retry');
    await expect(dispatch({ ...base, attempts: 3 })).resolves.toBe('failed');
  });
});

describe('EmailDispatchQueueService (REDIS_URL set, BullMQ mode)', () => {
  const original = process.env.REDIS_URL;
  let service: EmailDispatchQueueService;

  beforeEach(() => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    jest.clearAllMocks();
    mockAdd.mockResolvedValue({ id: '1' });
    ({ service } = build());
    service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    if (original === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = original;
  });

  it('adds the job to the Redis queue with 3 attempts and exponential backoff', async () => {
    await service.enqueue(job());
    expect(mockAdd).toHaveBeenCalledTimes(1);
    const [name, data, opts] = mockAdd.mock.calls[0];
    expect(name).toBe('dispatch');
    expect(data).toMatchObject({ messageId: 'msg-1', attempts: 0, maxAttempts: 3 });
    expect(opts).toMatchObject({ attempts: 3, backoff: { type: 'exponential', delay: 10000 } });
    expect((service as any).memoryQueue).toHaveLength(0);
  });

  it('falls back to the in-memory queue when the Redis add fails', async () => {
    mockAdd.mockRejectedValueOnce(new Error('connection refused'));
    await service.enqueue(job());
    expect((service as any).memoryQueue).toHaveLength(1);
  });

  it('makes the BullMQ worker throw on a transient failure so BullMQ retries it', async () => {
    jest.spyOn(service as any, 'dispatchJob').mockResolvedValueOnce('retry');
    await expect(
      (service as any).processBullJob({ data: { ...job(), attempts: 0, maxAttempts: 3 }, attemptsMade: 0 }),
    ).rejects.toThrow('Dispatch attempt 1 failed');
  });

  it('does not throw when the outcome is final, so BullMQ does not retry again', async () => {
    jest.spyOn(service as any, 'dispatchJob').mockResolvedValueOnce('failed');
    await expect(
      (service as any).processBullJob({ data: { ...job(), attempts: 0, maxAttempts: 3 }, attemptsMade: 2 }),
    ).resolves.toBeUndefined();
  });
});
