import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withTransaction } from '../../database/mysql.connection';
import { RoutePlanModel } from '../route-plan.model';

vi.mock('../../database/mysql.connection', () => ({ withTransaction: vi.fn() }));

const execute = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(withTransaction).mockImplementation(async (work) => work({ execute } as never));
});

describe('RoutePlanModel.deliverStop', () => {
  it('rejects a stop assigned to another rider before changing any data', async () => {
    execute.mockResolvedValueOnce([[{ status: 'SELECTED', delivery_status: 'WAITING', stop_sequence: 1, rider_id: 9 }]]);
    await expect(RoutePlanModel.deliverStop(1, 2, 3, 8)).resolves.toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('rejects an unselected plan without changing an order', async () => {
    execute.mockResolvedValueOnce([[{ status: 'GENERATED', delivery_status: 'WAITING', stop_sequence: 1 }]]);
    await expect(RoutePlanModel.deliverStop(1, 2, 3)).rejects.toMatchObject({ statusCode: 409 });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('requires earlier stops to be delivered', async () => {
    execute.mockResolvedValueOnce([[{ status: 'SELECTED', delivery_status: 'PLANNED', stop_sequence: 2 }]])
      .mockResolvedValueOnce([[{ count: 1 }]]);
    await expect(RoutePlanModel.deliverStop(1, 2, 3)).rejects.toMatchObject({ statusCode: 409 });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('updates the stop, order and job together', async () => {
    execute.mockResolvedValueOnce([[{ status: 'SELECTED', delivery_status: 'PLANNED', stop_sequence: 1 }]])
      .mockResolvedValueOnce([[{ count: 0 }]])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([[{ count: 0 }]])
      .mockResolvedValueOnce([{}]);
    await expect(RoutePlanModel.deliverStop(1, 2, 3)).resolves.toBe(true);
    expect(execute.mock.calls[2]![0]).toContain("status='DELIVERED'");
    expect(execute.mock.calls[4]![1]).toEqual(['COMPLETED', 2]);
  });
});

describe('RoutePlanModel.select', () => {
  it('rejects a plan with an unassigned job', async () => {
    execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ status: 'GENERATED' }]])
      .mockResolvedValueOnce([[{ total: 1, distinct_riders: 0, unavailable: 1 }]]);
    await expect(RoutePlanModel.select(1)).rejects.toMatchObject({ statusCode: 422 });
    expect(execute).toHaveBeenCalledTimes(3);
  });
});

describe('RoutePlanModel.deleteById', () => {
  it('deletes only the requested generated plan without resetting order status', async () => {
    execute.mockResolvedValueOnce([[{ route_plan_id: 8, status: 'GENERATED' }]])
      .mockResolvedValue([{}]);
    await expect(RoutePlanModel.deleteById(8)).resolves.toBe(true);
    expect(execute).toHaveBeenCalledTimes(4);
    expect(execute.mock.calls[1]![0]).toContain('DELETE djo');
    expect(execute.mock.calls[2]![1]).toEqual([8]);
    expect(execute.mock.calls[3]![1]).toEqual([8]);
  });

  it('restores pending orders when removing a selected plan', async () => {
    execute.mockResolvedValueOnce([[{ route_plan_id: 8, status: 'SELECTED' }]])
      .mockResolvedValueOnce([[{ count: 0 }]])
      .mockResolvedValue([{}]);
    await expect(RoutePlanModel.deleteById(8)).resolves.toBe(true);
    expect(execute.mock.calls[2]![0]).toContain("status = 'PENDING'");
    expect(execute.mock.calls[3]![0]).toContain('DELETE djo');
  });

  it('keeps plans with completed deliveries', async () => {
    execute.mockResolvedValueOnce([[{ route_plan_id: 8, status: 'SELECTED' }]])
      .mockResolvedValueOnce([[{ count: 1 }]]);
    await expect(RoutePlanModel.deleteById(8)).rejects.toMatchObject({ statusCode: 409 });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('never prunes a plan that became selected', async () => {
    execute.mockResolvedValueOnce([[{ route_plan_id: 8, status: 'SELECTED' }]]);
    await expect(RoutePlanModel.deleteById(8, true)).resolves.toBe(false);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
