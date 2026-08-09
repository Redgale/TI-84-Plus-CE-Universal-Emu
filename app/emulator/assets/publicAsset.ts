export function publicAsset(pathname: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.endsWith("/") ? base : `${base}/`}${pathname.replace(/^\/+/, "")}`;
}
