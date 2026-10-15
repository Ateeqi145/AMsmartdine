import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Eye } from "lucide-react";

type ErrorStatus = "NEW" | "REVIEWED" | "RESOLVED";

const STATUS_COLOR: Record<ErrorStatus, string> = {
  NEW: "destructive",
  REVIEWED: "secondary",
  RESOLVED: "default",
};

export default function SuperAdminErrors() {
  const [statusFilter, setStatusFilter] = useState<ErrorStatus | "ALL">("ALL");
  const updateStatus = useMutation(api.admin.updateErrorStatus);

  const errors = useQuery(
    api.admin.listErrors,
    statusFilter === "ALL" ? { limit: 100 } : { status: statusFilter, limit: 100 },
  );

  const handleUpdate = async (id: string, status: ErrorStatus) => {
    try {
      await updateStatus({ errorId: id as Id<"errorLogs">, status });
      toast.success(`Marked as ${status.toLowerCase()}`);
    } catch {
      toast.error("Failed to update error status");
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Error Logs</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Structured errors with context for debugging</p>
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="NEW">New</SelectItem>
            <SelectItem value="REVIEWED">Reviewed</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {errors === undefined ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : errors.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
            <p className="font-medium">No errors{statusFilter !== "ALL" ? ` with status "${statusFilter}"` : ""}</p>
            <p className="text-sm text-muted-foreground">All systems running cleanly</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {errors.map((e) => (
            <Card key={e._id} className={e.status === "NEW" ? "border-destructive/30" : ""}>
              <CardContent className="py-4">
                <div className="flex items-start gap-4">
                  <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${e.status === "NEW" ? "text-destructive" : "text-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <p className="font-medium text-sm">{e.message}</p>
                      <Badge variant={STATUS_COLOR[e.status] as "destructive" | "secondary" | "default"} className="text-xs flex-shrink-0">
                        {e.status}
                      </Badge>
                    </div>
                    {/* Context tags */}
                    <div className="flex flex-wrap gap-2 mt-2">
                      {e.module && (
                        <span className="text-xs bg-muted px-2 py-0.5 rounded font-medium">
                          Module: {e.module}
                        </span>
                      )}
                      {e.feature && (
                        <span className="text-xs bg-muted px-2 py-0.5 rounded font-medium">
                          Feature: {e.feature}
                        </span>
                      )}
                      {e.userRole && (
                        <span className="text-xs bg-muted px-2 py-0.5 rounded font-medium">
                          Role: {e.userRole}
                        </span>
                      )}
                      {e.environment && (
                        <span className="text-xs bg-muted px-2 py-0.5 rounded font-medium">
                          Env: {e.environment}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground items-center">
                      {e.requestId && <span className="font-mono">{e.requestId}</span>}
                      <span>{new Date(e.timestamp).toLocaleString()}</span>
                    </div>
                    {e.stack && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1 w-fit hover:text-foreground">
                          <Eye className="w-3 h-3" />
                          Stack trace
                        </summary>
                        <pre className="text-xs font-mono bg-muted/60 rounded-lg p-3 mt-1.5 overflow-x-auto whitespace-pre-wrap text-muted-foreground">{e.stack}</pre>
                      </details>
                    )}
                  </div>
                </div>
                {/* Actions */}
                {e.status !== "RESOLVED" && (
                  <div className="flex gap-2 mt-3 ml-8">
                    {e.status === "NEW" && (
                      <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => handleUpdate(e._id, "REVIEWED")}>
                        <Eye className="w-3 h-3" />
                        Mark Reviewed
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-green-600 hover:text-green-700" onClick={() => handleUpdate(e._id, "RESOLVED")}>
                      <CheckCircle2 className="w-3 h-3" />
                      Resolve
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
