"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Title,
  Text,
  Badge,
  Skeleton,
  Icon,
  Alert,
  AlertTitle,
  AlertDescription,
} from "@kognitos/lattice";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { getAutomationDisplayName } from "@/lib/automation-sop";

dayjs.extend(relativeTime);

interface Automation {
  id: string;
  displayName: string;
  resourceName: string;
  createdAt: string | null;
  updatedAt: string | null;
  state: string | null;
  connections?: Record<
    string,
    { connection_id?: string; endpoint?: string }
  > | null;
}

function stateBadge(state: string | null) {
  if (!state) return <Badge variant="secondary">Unknown</Badge>;
  const s = state.toLowerCase();
  if (s.includes("published")) return <Badge variant="success">Published</Badge>;
  if (s.includes("draft")) return <Badge variant="secondary">Draft</Badge>;
  if (s.includes("disabled")) return <Badge variant="destructive">Disabled</Badge>;
  return <Badge variant="secondary">{state.replace(/^AUTOMATION_STATE_/, "")}</Badge>;
}

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/automations")
      .then(async (res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        setAutomations(data.automations ?? []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <Title level="h2">Automations</Title>
        <Text level="small" color="muted">
          Click an automation to view its SOP logic and integrations.
        </Text>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Failed to load automations</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : automations.length > 0 ? (
        <div className="space-y-3">
          {automations.map((a) => (
            <AutomationCard key={a.id} automation={a} />
          ))}
        </div>
      ) : (
        !error && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Icon type="Archive" size="xl" className="text-muted-foreground" />
            <Text color="muted">No automations found in this workspace</Text>
          </div>
        )
      )}
    </div>
  );
}

function AutomationCard({ automation }: { automation: Automation }) {
  const connectionCount = automation.connections
    ? Object.keys(automation.connections).length
    : 0;

  return (
    <Link
      href={`/automations/${automation.id}`}
      className="block rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all duration-150 group"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 shrink-0 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <Icon type="Blocks" size="md" className="text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Text level="base" className="font-semibold group-hover:text-primary transition-colors">
                {getAutomationDisplayName(automation.id, automation.displayName)}
              </Text>
              <Icon
                type="ChevronRight"
                size="sm"
                className="text-muted-foreground group-hover:text-primary transition-colors"
              />
            </div>
            <Text level="xSmall" color="muted" className="mt-0.5 font-mono">
              {automation.id}
            </Text>
            {connectionCount > 0 && (
              <Text level="xSmall" color="muted" className="mt-1.5">
                {connectionCount} connection{connectionCount !== 1 ? "s" : ""}
              </Text>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {stateBadge(automation.state)}
          {automation.updatedAt && (
            <Text level="xSmall" color="muted">
              Updated {dayjs(automation.updatedAt).fromNow()}
            </Text>
          )}
        </div>
      </div>
    </Link>
  );
}
