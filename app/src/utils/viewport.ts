/** Viewport helpers — match prototype's isMobile/isTablet/isDesktop. */

export function isMobile(): boolean {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

export function isTablet(): boolean {
  return (
    typeof window !== "undefined" &&
    window.innerWidth >= 768 &&
    window.innerWidth < 1024
  );
}

export function isDesktop(): boolean {
  return typeof window !== "undefined" && window.innerWidth >= 1024;
}

export function formFactor(): "mobile" | "tablet" | "desktop" {
  if (isMobile()) return "mobile";
  if (isTablet()) return "tablet";
  return "desktop";
}