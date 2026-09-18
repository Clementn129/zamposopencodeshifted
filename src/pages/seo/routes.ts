import { lazy } from "react";
import type { ElementType } from "react";

interface SeoRoute {
  path: string;
  Component: ElementType;
}

export const seoRoutes: SeoRoute[] = [
  { path: "/pos-system-zambia", Component: lazy(() => import("./pos-system-zambia")) },
  { path: "/point-of-sale-software-zambia", Component: lazy(() => import("./point-of-sale-software-zambia")) },
  { path: "/free-offline-pos-zambia", Component: lazy(() => import("./free-offline-pos-zambia")) },
  { path: "/restaurant-pos-zambia", Component: lazy(() => import("./restaurant-pos-zambia")) },
  { path: "/inventory-management-zambia", Component: lazy(() => import("./inventory-management-zambia")) },
  { path: "/debtors-credit-sales-zambia", Component: lazy(() => import("./debtors-credit-sales-zambia")) },
];

export const SEO_PATHS = seoRoutes.map((r) => r.path);