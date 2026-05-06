"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Text,
  ModeToggle,
  Icon,
} from "@kognitos/lattice";

type NavItem = {
  href: string;
  label: string;
  icon:
    | "Search"
    | "Sparkles"
    | "MessageSquare"
    | "Table"
    | "Blocks"
    | "Database"
    | "BookOpen"
    | "FlaskConical"
    | "History"
    | "Layers3";
  exact?: boolean;
};

const TOP_ITEMS: NavItem[] = [
  { href: "/ama-agent", label: "DB Agent", icon: "Sparkles", exact: true },
  { href: "/ama-agent/runs", label: "Run History", icon: "History" },
];

const TOOLS_ITEMS: NavItem[] = [
  { href: "/query", label: "Query", icon: "Search", exact: true },
  { href: "/query/runs", label: "Query Runs", icon: "History" },
  { href: "/chat", label: "Chat", icon: "MessageSquare" },
  { href: "/data", label: "Data", icon: "Table" },
  { href: "/sources", label: "Source Data", icon: "Database" },
  { href: "/test-results", label: "Test Results", icon: "FlaskConical" },
];

const BOTTOM_ITEMS: NavItem[] = [
  { href: "/automations", label: "Automations", icon: "Blocks" },
  { href: "/guide", label: "User Guide", icon: "BookOpen" },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive(pathname, item)}>
        <Link href={item.href}>
          <Icon type={item.icon} size="sm" />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const toolsActive = TOOLS_ITEMS.some((i) => isActive(pathname, i));
  const [toolsOpen, setToolsOpen] = useState<boolean>(toolsActive);

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Text level="base" className="font-semibold">
          Kognitos
        </Text>
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {TOP_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </SidebarMenu>

        <Collapsible open={toolsOpen} onOpenChange={setToolsOpen}>
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger className="flex w-full items-center justify-between cursor-pointer hover:text-foreground transition-colors">
                <span>Tools</span>
                <Icon
                  type={toolsOpen ? "ChevronDown" : "ChevronRight"}
                  size="sm"
                  className="text-muted-foreground transition-transform"
                />
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {TOOLS_ITEMS.map((item) => (
                    <NavLink key={item.href} item={item} pathname={pathname} />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>

        <SidebarMenu>
          {BOTTOM_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
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
