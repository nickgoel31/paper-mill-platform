import { Role } from "@/generated/prisma/browser";
import {
  LayoutDashboard,
  ShoppingCart,
  Scissors,
  Factory,
  Package,
  Send,
  ReceiptText,
  Database,
  Users,
  BookOpen,
  MessageSquare,
  Settings,
  LucideIcon,
  TrendingDown,
  BarChart3,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  allowedRoles: Role[];
  badge?: string;
  section?: "main" | "operations" | "inventory" | "settings";
  subItems?: {
    title: string;
    href: string;
    allowedRoles: Role[];
  }[];
}

export const navConfig: NavItem[] = [
  // MAIN
  {
    title: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
    section: "main",
    allowedRoles: [
      Role.ADMIN,
      Role.SALES,
      Role.PLANNER,
      Role.OPERATOR,
      Role.DISPATCH,
    ],
  },
  {
    title: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    section: "main",
    allowedRoles: [
      Role.ADMIN,
      Role.SALES,
      Role.PLANNER,
      Role.OPERATOR,
      Role.DISPATCH,
    ],
  },
  {
    title: "Orders",
    href: "/orders",
    icon: ShoppingCart,
    section: "main",
    allowedRoles: [Role.ADMIN, Role.SALES, Role.PLANNER],
  },
  {
    title: "Deckle Planning",
    href: "/deckle",
    icon: Scissors,
    section: "main",
    allowedRoles: [Role.ADMIN, Role.PLANNER],
  },
  {
    title: "Production",
    href: "/production",
    icon: Factory,
    section: "main",
    allowedRoles: [Role.ADMIN, Role.PLANNER, Role.OPERATOR],
  },
  {
    title: "Logistics",
    href: "/dispatch",
    icon: Send,
    section: "main",
    allowedRoles: [Role.ADMIN, Role.DISPATCH, Role.PLANNER],
    subItems: [
      {
        title: "Dispatch Desk",
        href: "/dispatch",
        allowedRoles: [Role.ADMIN, Role.DISPATCH],
      },
      {
        title: "Truck Batches",
        href: "/loads",
        allowedRoles: [Role.ADMIN, Role.PLANNER, Role.DISPATCH],
      },
      {
        title: "Dispatch History",
        href: "/dispatch/history",
        allowedRoles: [Role.ADMIN, Role.DISPATCH],
      },
    ],
  },
  {
    title: "Invoices",
    href: "/invoices",
    icon: ReceiptText,
    section: "main",
    allowedRoles: [Role.ADMIN, Role.SALES, Role.DISPATCH],
  },
  {
    title: "Inventory",
    href: "/stock",
    icon: Package,
    section: "main",
    allowedRoles: [
      Role.ADMIN,
      Role.PLANNER,
      Role.OPERATOR,
      Role.DISPATCH,
    ],
  },
  {
    title: "Wastage",
    href: "/wastage",
    icon: TrendingDown,
    section: "main",
    allowedRoles: [
      Role.ADMIN,
      Role.PLANNER,
      Role.OPERATOR,
      Role.DISPATCH,
    ],
  },
  {
    title: "Masters",
    href: "/masters/clients",
    icon: Database,
    section: "main",
    allowedRoles: [Role.ADMIN, Role.SALES, Role.PLANNER, Role.DISPATCH],
    subItems: [
      {
        title: "Clients",
        href: "/masters/clients",
        allowedRoles: [Role.ADMIN, Role.SALES],
      },
      {
        title: "Machines",
        href: "/masters/machines",
        allowedRoles: [Role.ADMIN, Role.PLANNER],
      },
      {
        title: "Trucks & Fleet",
        href: "/masters/trucks",
        allowedRoles: [Role.ADMIN, Role.PLANNER, Role.DISPATCH],
      },
      {
        title: "Stock Presets",
        href: "/masters/stock-presets",
        allowedRoles: [Role.ADMIN, Role.PLANNER, Role.SALES, Role.DISPATCH, Role.OPERATOR],
      },
    ],
  },

  // OTHERS / SETTINGS
  {
    title: "Notifications",
    href: "/notifications",
    icon: MessageSquare,
    section: "settings",
    allowedRoles: [Role.ADMIN, Role.DISPATCH],
  },
  {
    title: "User Management",
    href: "/users",
    icon: Users,
    section: "settings",
    allowedRoles: [Role.ADMIN],
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
    section: "settings",
    allowedRoles: [Role.ADMIN],
  },
  {
    title: "System Guide",
    href: "/guide",
    icon: BookOpen,
    section: "settings",
    allowedRoles: [
      Role.ADMIN,
      Role.SALES,
      Role.PLANNER,
      Role.OPERATOR,
      Role.DISPATCH,
    ],
  },
];
