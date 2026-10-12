// Composition root: one install call per feature (ADR 0046).
import { NAMESPACE } from "./shared/identifiers";
import { installVehicles } from "./vehicle/install";

export function bootstrap(): void {
  installVehicles();
  console.warn(`[${NAMESPACE}] loaded`);
}
