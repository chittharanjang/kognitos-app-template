"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  Text,
  ModeToggle,
  Icon,
} from "@kognitos/lattice";

const NAV_ITEMS = [
  { href: "/query", label: "Query", icon: "Search" as const },
  { href: "/automations", label: "Automations", icon: "Blocks" as const },
  { href: "/chat", label: "Chat", icon: "MessageSquare" as const },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Text level="base" className="font-semibold">
          Kognitos
        </Text>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {NAV_ITEMS.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={pathname.startsWith(item.href)}>
                <Link href={item.href}>
                  <Icon type={item.icon} size="sm" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="p-3">
        <div className="flex items-center justify-between">
          <Text level="xSmall" color="muted">
            Powered by Kognitos
          </Text>
          <ModeToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
