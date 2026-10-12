// Composition root: one install call per feature (ADR 0046).
import { installVehicles } from "./vehicle/install";

export function bootstrap(): void {
  installVehicles();
  console.warn("[mycar] loaded");
}
