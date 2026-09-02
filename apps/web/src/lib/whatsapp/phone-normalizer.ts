/**
 * Indian Mobile Phone Number Normalizer and Validator.
 * Rules:
 *  - Strips spaces, dashes, parentheses, plus signs.
 *  - Drops leading zero (e.g. 09876543210 -> 9876543210).
 *  - Adds '91' country code if the number is exactly 10 digits starting with 6, 7, 8, or 9.
 *  - Validates 12-digit format (91XXXXXXXXXX).
 *  - Throws descriptive error for invalid inputs.
 */
export function normalizeIndianPhoneNumber(input: string | null | undefined): string {
  if (!input || typeof input !== "string") {
    throw new Error("Phone number is required and cannot be empty.");
  }

  // 1. Remove all non-numeric characters
  let digits = input.replace(/\D/g, "");

  // 2. Drop leading 0 if present (e.g. 09876543210 -> 9876543210 or 0091... -> 91...)
  if (digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
  }

  // 3. If 10 digits, prepend India country code 91
  if (digits.length === 10) {
    if (!/^[6-9]\d{9}$/.test(digits)) {
      throw new Error(
        `Invalid Indian mobile number '${input}'. 10-digit mobile numbers must start with 6, 7, 8, or 9.`
      );
    }
    digits = `91${digits}`;
  }

  // 4. Validate final 12-digit Indian number: 91 followed by 10 digits starting with 6-9
  if (!/^91[6-9]\d{9}$/.test(digits)) {
    throw new Error(
      `Invalid WhatsApp destination number '${input}'. Expected 10-digit Indian mobile or 12-digit number starting with 91 (Got '${digits}').`
    );
  }

  return digits;
}
