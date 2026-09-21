import { RiderModel, type Rider, type RiderInput } from '../models/rider.model';

/** Rider application workflow. CRUD + availability lookup. */
export class RiderService {
  static findAll(): Promise<Rider[]> {
    return RiderModel.findAll();
  }

  static findById(id: string): Promise<Rider | null> {
    return RiderModel.findById(id);
  }

  static findAvailable(): Promise<Rider[]> {
    return RiderModel.findAvailable();
  }

  static create(input: RiderInput): Promise<Rider> {
    return RiderModel.create(input);
  }

  static update(id: string, input: Partial<RiderInput>): Promise<Rider | null> {
    return RiderModel.update(id, input);
  }
}
