import { SetMetadata } from "@nestjs/common";
import type { AdminPermission } from "./admin.types.js";

export const ADMIN_PERMISSION_METADATA = "admin_permission";

export const RequireAdminPermission = (permission: AdminPermission) =>
  SetMetadata(ADMIN_PERMISSION_METADATA, permission);
