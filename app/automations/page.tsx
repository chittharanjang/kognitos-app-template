"use client";

import { useEffect, useState } from "react";
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

dayjs.extend(relativeTime);

interface Automation {
  id: string;
  displayName: string;
  resourceName: string;
  englishCode: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  state: string | null;
}

function stateBadge(state: string | null) {
  if (!state) return <Badge variant="secondary">Unknown</Badge>;

  const s = state.toLowerCase();
  if (s.includes("published"))
    return <Badge variant="success">Published</Badge>;
  if (s.includes("draft")) return <Badge variant="secondary">Draft</Badge>;
  if (s.includes("disabled"))
    return <Badge variant="destructive">Disabled</Badge>;
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
        setAutomations(data.automations);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <Title level="h2">Automations</Title>
        <Text level="small" color="muted">
          All automations in your workspace
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
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid gap-3">
          {automations.map((a) => (
            <div
              key={a.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4 hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="mt-0.5 shrink-0">
                  <Icon type="Blocks" size="md" className="text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <Text level="base" className="font-medium truncate">
                    {a.displayName}
                  </Text>
                  <Text level="xSmall" color="muted" className="mt-0.5 font-mono truncate">
                    {a.id}
                  </Text>
                  {a.englishCode && (
                    <Text level="xSmall" color="muted" className="mt-1 line-clamp-2">
                      {a.englishCode}
                    </Text>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-end gap-1 shrink-0">
                {stateBadge(a.state)}
                {a.updatedAt && (
                  <Text level="xSmall" color="muted">
                    {dayjs(a.updatedAt).fromNow()}
                  </Text>
                )}
              </div>
            </div>
          ))}

          {automations.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Icon type="Archive" size="xl" className="text-muted-foreground" />
              <Text color="muted">No automations found in this workspace</Text>
            </div>
          )}
        </div>
      )}

      <div className="pt-2">
        <Text level="xSmall" color="muted">
          {!loading && `${automations.length} automation${automations.length !== 1 ? "s" : ""}`}
        </Text>
      </div>
    </div>
  );
}
