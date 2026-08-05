export function getOrgId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("activeOrgId");
}
