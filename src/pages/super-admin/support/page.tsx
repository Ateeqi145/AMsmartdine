import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Label } from "@/components/ui/label.tsx";
import { toast } from "sonner";
import { TicketPercent, MessageSquare, Clock, CheckCircle2 } from "lucide-react";

type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
type TicketPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const PRIORITY_COLOR: Record<TicketPriority, string> = {
  LOW: "secondary",
  MEDIUM: "default",
  HIGH: "destructive",
  CRITICAL: "destructive",
};

const STATUS_COLOR: Record<TicketStatus, string> = {
  OPEN: "destructive",
  IN_PROGRESS: "default",
  RESOLVED: "secondary",
  CLOSED: "secondary",
};

const STATUS_ICON: Record<TicketStatus, React.ElementType> = {
  OPEN: MessageSquare,
  IN_PROGRESS: Clock,
  RESOLVED: CheckCircle2,
  CLOSED: CheckCircle2,
};

function UpdateTicketDialog({
  ticket,
  open,
  onClose,
}: {
  ticket: { _id: string; status: TicketStatus; notes?: string };
  open: boolean;
  onClose: () => void;
}) {
  const updateTicket = useMutation(api.admin.updateSupportTicket);
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [notes, setNotes] = useState(ticket.notes ?? "");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      await updateTicket({ ticketId: ticket._id as Id<"supportTickets">, status, notes });
      toast.success("Ticket updated");
      onClose();
    } catch {
      toast.error("Failed to update ticket");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Update Ticket</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as TicketStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Internal Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this ticket..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>{loading ? "Saving..." : "Update Ticket"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SuperAdminSupport() {
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "ALL">("ALL");
  const [editingTicket, setEditingTicket] = useState<{ _id: string; status: TicketStatus; notes?: string } | null>(null);

  const tickets = useQuery(
    api.admin.listSupportTickets,
    statusFilter === "ALL" ? { limit: 100 } : { status: statusFilter, limit: 100 },
  );
  const restaurants = useQuery(api.restaurants.listAll, { includeInactive: true });
  const restaurantMap = Object.fromEntries((restaurants ?? []).map((r) => [r._id, r.name]));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Support Tickets</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Restaurant support requests</p>
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All tickets</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="IN_PROGRESS">In Progress</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {tickets === undefined ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : tickets.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-2">
            <TicketPercent className="w-10 h-10 text-muted-foreground/40 mx-auto" />
            <p className="font-medium">No support tickets</p>
            <p className="text-sm text-muted-foreground">
              {statusFilter !== "ALL" ? `No ${statusFilter.toLowerCase()} tickets` : "All clear — no open tickets"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => {
            const StatusIcon = STATUS_ICON[t.status];
            return (
              <Card key={t._id}>
                <CardContent className="py-4">
                  <div className="flex items-start gap-3">
                    <StatusIcon className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{t.subject}</p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Badge variant={PRIORITY_COLOR[t.priority] as "destructive" | "default" | "secondary"} className="text-xs">
                            {t.priority}
                          </Badge>
                          <Badge variant={STATUS_COLOR[t.status] as "destructive" | "default" | "secondary"} className="text-xs">
                            {t.status.replace("_", " ")}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                        {t.restaurantId && restaurantMap[t.restaurantId] && (
                          <span>🏪 {restaurantMap[t.restaurantId]}</span>
                        )}
                        <span>Created {new Date(t.createdAt).toLocaleString()}</span>
                        {t.notes && <span className="italic">"{t.notes}"</span>}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs flex-shrink-0"
                      onClick={() => setEditingTicket({ _id: t._id, status: t.status, notes: t.notes })}
                    >
                      Update
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editingTicket && (
        <UpdateTicketDialog
          ticket={editingTicket}
          open={!!editingTicket}
          onClose={() => setEditingTicket(null)}
        />
      )}
    </div>
  );
}
