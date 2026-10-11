import { installVehicles } from "./vehicle/install";

export function bootstrap(): void {
  installVehicles();
  console.warn("[mycar] loaded");
}
