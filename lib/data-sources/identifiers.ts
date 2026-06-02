export function digitsOnly(value: string | number | null | undefined) {
  return String(value ?? "").replace(/\D/g, "");
}

export function cleanBizRaportKrs(value: string | number | null | undefined) {
  return String(value ?? "").trim().replace(/_+$/g, "");
}

export function isKrs(value: string | number | null | undefined) {
  return /^\d{10}$/.test(String(value ?? "").trim());
}

export function isNip(value: string | number | null | undefined) {
  const digits = String(value ?? "").trim();
  if (!/^\d{10}$/.test(digits)) {
    return false;
  }

  const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const checksum = weights.reduce((sum, weight, index) => sum + weight * Number(digits[index]), 0) % 11;

  return checksum !== 10 && checksum === Number(digits[9]);
}
