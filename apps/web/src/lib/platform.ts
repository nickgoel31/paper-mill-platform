/**
 * TWJ-Labs platform staff are identified by their e-mail domain. A user whose
 * e-mail ends with this domain manages mills (tenants) via `/platform`; every
 * other user belongs to exactly one mill and uses that mill's ERP.
 */
export const PLATFORM_EMAIL_DOMAIN = "@twjlabs.com";

export function isPlatformEmail(email: string | null | undefined): boolean {
  return !!email && email.trim().toLowerCase().endsWith(PLATFORM_EMAIL_DOMAIN);
}
