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
    | "Layers3"
    | "KeyRound";
  exact?: boolean;
};

const DB_AGENT_ITEMS: NavItem[] = [
  { href: "/ama-agent", label: "DB Agent", icon: "Sparkles", exact: true },
  { href: "/ama-agent/runs", label: "Run History", icon: "History" },
];

const QUERY_ITEMS: NavItem[] = [
  { href: "/query", label: "SQL Query Generator", icon: "Search", exact: true },
  { href: "/query/runs", label: "Query Runs", icon: "History" },
];

const OTHER_ITEMS: NavItem[] = [
  { href: "/chat", label: "Chat", icon: "MessageSquare" },
  { href: "/data", label: "Data", icon: "Table" },
  { href: "/sources", label: "Source Data", icon: "Database" },
  { href: "/test-results", label: "Test Results", icon: "FlaskConical" },
  { href: "/answer-key", label: "Answer Key", icon: "KeyRound" },
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

function NavGroup({
  label,
  items,
  pathname,
  defaultOpen,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarGroup>
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger className="flex w-full items-center justify-between cursor-pointer hover:text-foreground transition-colors">
            <span>{label}</span>
            <Icon
              type={open ? "ChevronDown" : "ChevronRight"}
              size="sm"
              className="text-muted-foreground transition-transform"
            />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

export function AppSidebar() {
  const pathname = usePathname();

  const dbAgentActive = DB_AGENT_ITEMS.some((i) => isActive(pathname, i));
  const queryActive = QUERY_ITEMS.some((i) => isActive(pathname, i));
  const otherActive = OTHER_ITEMS.some((i) => isActive(pathname, i));

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Text level="base" className="font-semibold">
          Kognitos
        </Text>
      </SidebarHeader>

      <SidebarContent>
        <NavGroup
          label="Query"
          items={QUERY_ITEMS}
          pathname={pathname}
          defaultOpen={queryActive}
        />

        <NavGroup
          label="Tools"
          items={OTHER_ITEMS}
          pathname={pathname}
          defaultOpen={false}
        />

        <NavGroup
          label="DB Agent"
          items={DB_AGENT_ITEMS}
          pathname={pathname}
          defaultOpen={dbAgentActive}
        />
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
