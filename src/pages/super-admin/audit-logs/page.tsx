export {};import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { ClipboardList, Circle } from "lucide-react";

export default function SuperAdminAuditLogs() {
  const logs = useQuery(api.admin.list, { limit: 100 });

  const actionColor = (action: string) => {
    if (action.includes("CREATE")) return "bg-green-500";
    if (action.includes("DELETE") || action.includes("DEACTIVATE")) return "bg-red-500";
    if (action.includes("UPDATE") || action.includes("TOGGLE") || action.includes("SET")) return "bg-blue-500";
    return "bg-muted-foreground";
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground mt-1">Track all important platform actions</p>
      </div>

      {logs === undefined ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : logs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ClipboardList className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No audit logs yet</p>
            <p className="text-sm text-muted-foreground mt-1">Actions will be recorded here</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <Card key={log._id}>
              <CardContent className="py-3">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${actionColor(log.action)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{log.action.replace(/_/g, " ")}</p>
                      {log.actorRole && (
                        <Badge variant="secondary" className="text-xs">{log.actorRole}</Badge>
                      )}
                      {log.targetType && (
                        <Badge variant="secondary" className="text-xs">{log.targetType}</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-muted-foreground">
                      {log.requestId && <span className="font-mono">{log.requestId}</span>}
                      <span>{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    {log.details && (
                      <details className="mt-1">
                        <summary className="text-xs text-muted-foreground cursor-pointer">Details</summary>
                        <pre className="text-xs font-mono bg-muted/50 rounded p-1.5 mt-1 overflow-x-auto">{log.details}</pre>
                      </details>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
