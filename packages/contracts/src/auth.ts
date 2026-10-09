import { z } from "zod";
import { PERMISSIONS, ROLES } from "@rebania/domain";
import { uuid } from "./common.ts";

export const Channel = z.enum(["web", "mobile"]);

export const LoginRequest = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
  channel: Channel,
  deviceLabel: z.string().max(80).optional(),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

/** Mobile recebe tokens no corpo; web recebe cookie httpOnly e corpo sem tokens. */
export const LoginResponse = z.object({
  user: z.object({ id: uuid, name: z.string(), email: z.string() }),
  tokens: z
    .object({
      accessToken: z.string(),
      accessExpiresAt: z.string(),
      refreshToken: z.string(),
      refreshExpiresAt: z.string(),
    })
    .optional(),
});
export type LoginResponse = z.infer<typeof LoginResponse>;

export const RefreshRequest = z.object({ refreshToken: z.string().min(20) });

export const Role = z.enum(ROLES);
export const Permission = z.enum(PERMISSIONS);

export const FarmSummary = z.object({
  id: uuid,
  organizationId: uuid,
  name: z.string(),
  timezone: z.string(),
});
export type FarmSummary = z.infer<typeof FarmSummary>;

export const MeResponse = z.object({
  user: z.object({ id: uuid, name: z.string(), email: z.string() }),
  memberships: z.array(
    z.object({
      organizationId: uuid,
      organizationName: z.string(),
      role: Role,
      permissions: z.array(Permission),
      allFarms: z.boolean(),
      farms: z.array(FarmSummary),
    }),
  ),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const PasswordPolicy = z
  .string()
  .min(10, "A senha precisa ter ao menos 10 caracteres.")
  .max(200);

export const CreateInvitationRequest = z
  .object({
    email: z.email().max(254),
    role: Role,
    allFarms: z.boolean().default(false),
    farmIds: z.array(uuid).max(200).default([]),
  })
  .refine((v) => v.allFarms || v.farmIds.length > 0, {
    message: "Escolha ao menos uma fazenda ou acesso a todas.",
    path: ["farmIds"],
  });
export type CreateInvitationRequest = z.input<typeof CreateInvitationRequest>;

export const InvitationCreated = z.object({
  id: uuid,
  email: z.string(),
  role: Role,
  expiresAt: z.string(),
  /** Exibido uma única vez para quem convidou; o servidor guarda apenas o hash. */
  acceptUrl: z.string(),
});

export const InvitationPreview = z.object({
  organizationName: z.string(),
  email: z.string(),
  role: Role,
  expiresAt: z.string(),
  existingUser: z.boolean(),
});

export const AcceptInvitationRequest = z.object({
  token: z.string().min(20).max(200),
  name: z.string().trim().min(2).max(120).optional(),
  password: PasswordPolicy,
});

export const Member = z.object({
  membershipId: uuid,
  userId: uuid,
  name: z.string(),
  email: z.string(),
  role: Role,
  allFarms: z.boolean(),
  farmIds: z.array(uuid),
  createdAt: z.string(),
});
export type Member = z.infer<typeof Member>;

export const PendingInvitation = z.object({
  id: uuid,
  email: z.string(),
  role: Role,
  expiresAt: z.string(),
  createdAt: z.string(),
});
