import type { RawInput } from "../../../domain/vehicle/driveInput";

export class TestInputStore {
  private readonly inputs = new Map<string, RawInput>();

  set(vehicleId: string, input: RawInput): void {
    this.inputs.set(vehicleId, input);
  }

  clear(vehicleId: string): void {
    this.inputs.delete(vehicleId);
  }

  get(vehicleId: string): RawInput | undefined {
    return this.inputs.get(vehicleId);
  }

  retain(ids: ReadonlySet<string>): void {
    for (const id of this.inputs.keys()) {
      if (!ids.has(id)) this.inputs.delete(id);
    }
  }
}
