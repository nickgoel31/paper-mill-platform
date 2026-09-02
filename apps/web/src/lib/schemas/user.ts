import { z } from "zod";
import { Role } from "@/generated/prisma/browser";

export const createUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  role: z.nativeEnum(Role, { errorMap: () => ({ message: "Please select a valid role" }) }),
  password: z.string().min(6, "Password must be at least 6 characters"),
  isActive: z.boolean().default(true),
});

export const updateUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  role: z.nativeEnum(Role, { errorMap: () => ({ message: "Please select a valid role" }) }),
  isActive: z.boolean().default(true),
});

export const resetPasswordSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
