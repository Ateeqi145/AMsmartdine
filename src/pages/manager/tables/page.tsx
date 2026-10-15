import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { toast } from "sonner";
import {
  Plus, QrCode, RefreshCw, Printer, Download, Trash2,
  Users, ToggleLeft, Pencil, ExternalLink,
} from "lucide-react";
import QRCode from "qrcode";

// ─── QR Canvas Component ──────────────────────────────────────────
function QrCanvas({ token, size = 160 }: { token: string; size?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const url = `${window.location.origin}/table/${token}`;
    QRCode.toCanvas(canvasRef.current, url, {
      width: size,
      margin: 2,
      color: { dark: "#1a1209", light: "#ffffff" },
    });
  }, [token, size]);

  return <canvas ref={canvasRef} className="rounded-lg" />;
}

// ─── QR Print Dialog ─────────────────────────────────────────────
function QrPrintDialog({
  table,
  restaurantName,
  open,
  onClose,
}: {
  table: { _id: string; tableNumber: string; displayName?: string; qrCodeToken: string };
  restaurantName: string;
  open: boolean;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const url = `${window.location.origin}/table/${table.qrCodeToken}`;
    QRCode.toCanvas(canvasRef.current, url, {
      width: 256,
      margin: 2,
      color: { dark: "#1a1209", light: "#ffffff" },
    });
  }, [open, table.qrCodeToken]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `qr-${table.tableNumber}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  };

  const tableUrl = `${window.location.origin}/table/${table.qrCodeToken}`;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>QR Code — {table.displayName ?? `Table ${table.tableNumber}`}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div className="p-4 bg-white rounded-2xl shadow-inner border">
            <canvas ref={canvasRef} className="rounded-lg" />
          </div>
          <div className="text-center space-y-1">
            <p className="font-bold text-lg">{restaurantName}</p>
            <p className="text-sm text-muted-foreground">{table.displayName ?? `Table ${table.tableNumber}`}</p>
            <p className="text-xs text-muted-foreground font-mono break-all">{tableUrl}</p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="ghost" className="gap-1.5" onClick={() => window.open(tableUrl, "_blank")}>
            <ExternalLink className="w-3.5 h-3.5" />
            Test Link
          </Button>
          <Button className="gap-1.5" onClick={handleDownload}>
            <Download className="w-3.5 h-3.5" />
            Download PNG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create/Edit Table Dialog ─────────────────────────────────────
function TableDialog({
  restaurantId,
  editTable,
  open,
  onClose,
}: {
  restaurantId: Id<"restaurants">;
  editTable?: { _id: string; tableNumber: string; displayName?: string; capacity?: number };
  open: boolean;
  onClose: () => void;
}) {
  const create = useMutation(api.tables.create);
  const update = useMutation(api.tables.update);
  const [form, setForm] = useState({
    tableNumber: editTable?.tableNumber ?? "",
    displayName: editTable?.displayName ?? "",
    capacity: editTable?.capacity?.toString() ?? "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setForm({
      tableNumber: editTable?.tableNumber ?? "",
      displayName: editTable?.displayName ?? "",
      capacity: editTable?.capacity?.toString() ?? "",
    });
  }, [editTable, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.tableNumber.trim()) { toast.error("Table number is required"); return; }
    setLoading(true);
    try {
      if (editTable) {
        await update({
          tableId: editTable._id as Id<"tables">,
          restaurantId,
          displayName: form.displayName || undefined,
          capacity: form.capacity ? parseInt(form.capacity) : undefined,
        });
        toast.success("Table updated");
      } else {
        await create({
          restaurantId,
          tableNumber: form.tableNumber.trim(),
          displayName: form.displayName || undefined,
          capacity: form.capacity ? parseInt(form.capacity) : undefined,
        });
        toast.success("Table created");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save table");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editTable ? "Edit Table" : "Add Table"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Table Number *</Label>
            <Input
              placeholder="T1, A3, Bar-1…"
              value={form.tableNumber}
              onChange={(e) => setForm((f) => ({ ...f, tableNumber: e.target.value }))}
              disabled={!!editTable}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Display Name</Label>
            <Input
              placeholder="Window Table, VIP Booth…"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Capacity (seats)</Label>
            <Input
              type="number"
              min="1"
              placeholder="4"
              value={form.capacity}
              onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? "Saving…" : editTable ? "Save Changes" : "Add Table"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
export default function ManagerTablesPage() {
  const restaurant = useQuery(api.users.getCurrentUserRestaurant, {});
  const rid = restaurant?._id as Id<"restaurants"> | undefined;

  const tables = useQuery(api.tables.listByRestaurant, rid ? { restaurantId: rid } : "skip");
  const removeTable = useMutation(api.tables.remove);
  const regenerateQr = useMutation(api.tables.regenerateQr);
  const toggleActive = useMutation(api.tables.update);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTable, setEditTable] = useState<typeof tables extends undefined ? never : NonNullable<typeof tables>[0] | null>(null);
  const [qrTable, setQrTable] = useState<NonNullable<typeof tables>[0] | null>(null);

  const handleDelete = async (table: NonNullable<typeof tables>[0]) => {
    if (!rid) return;
    try {
      await removeTable({ tableId: table._id, restaurantId: rid });
      toast.success("Table removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cannot delete table");
    }
  };

  const handleRegenQr = async (table: NonNullable<typeof tables>[0]) => {
    if (!rid) return;
    try {
      await regenerateQr({ tableId: table._id, restaurantId: rid });
      toast.success("QR code regenerated — old QR codes will no longer work");
    } catch {
      toast.error("Failed to regenerate QR");
    }
  };

  const handleToggleActive = async (table: NonNullable<typeof tables>[0]) => {
    if (!rid) return;
    try {
      await toggleActive({ tableId: table._id, restaurantId: rid, isActive: !table.isActive });
      toast.success(table.isActive ? "Table deactivated" : "Table activated");
    } catch {
      toast.error("Failed to update table");
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tables & QR Codes</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            One permanent QR per table · Scan to start ordering
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Table
        </Button>
      </div>

      {tables === undefined ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-52 w-full rounded-2xl" />)}
        </div>
      ) : tables.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <QrCode className="w-10 h-10 text-muted-foreground/40 mx-auto" />
            <p className="font-medium">No tables yet</p>
            <p className="text-sm text-muted-foreground">Add your first table to generate a QR code</p>
            <Button className="mt-2 gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              Add Table
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {tables.map((table) => (
            <Card
              key={table._id}
              className={`overflow-hidden transition-shadow hover:shadow-md ${!table.isActive ? "opacity-60" : ""}`}
            >
              <CardContent className="p-0">
                {/* QR preview */}
                <div
                  className="bg-white flex items-center justify-center p-4 cursor-pointer"
                  onClick={() => setQrTable(table)}
                >
                  <QrCanvas token={table.qrCodeToken} size={120} />
                </div>

                {/* Info */}
                <div className="p-3 space-y-2 border-t">
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <p className="font-bold text-sm">{table.displayName ?? `Table ${table.tableNumber}`}</p>
                      <p className="text-xs text-muted-foreground font-mono">#{table.tableNumber}</p>
                    </div>
                    <Badge variant={table.isActive ? "default" : "secondary"} className="text-[10px] flex-shrink-0">
                      {table.isActive ? "Active" : "Off"}
                    </Badge>
                  </div>
                  {table.capacity && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="w-3 h-3" />
                      {table.capacity} seats
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-1 pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 flex-1 text-xs gap-1 text-primary"
                      onClick={() => setQrTable(table)}
                    >
                      <QrCode className="w-3 h-3" />
                      QR
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => setEditTable(table)}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => handleToggleActive(table)}
                    >
                      <ToggleLeft className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(table)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Dialogs */}
      {rid && (
        <TableDialog
          restaurantId={rid}
          open={createOpen}
          onClose={() => setCreateOpen(false)}
        />
      )}
      {rid && editTable && (
        <TableDialog
          restaurantId={rid}
          editTable={editTable}
          open={!!editTable}
          onClose={() => setEditTable(null)}
        />
      )}
      {qrTable && restaurant && (
        <QrPrintDialog
          table={qrTable}
          restaurantName={restaurant.name}
          open={!!qrTable}
          onClose={() => setQrTable(null)}
        />
      )}
    </div>
  );
}
