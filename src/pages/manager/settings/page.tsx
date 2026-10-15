import { BarChart3 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card.tsx";

export default function ManagerReportsPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Analytics and reporting coming in a future milestone</p>
      </div>
      <Card>
        <CardContent className="py-20 text-center space-y-2">
          <BarChart3 className="w-10 h-10 text-muted-foreground/40 mx-auto" />
          <p className="font-medium">Analytics & Reports</p>
          <p className="text-sm text-muted-foreground">Daily revenue, popular dishes, customer counts, and more</p>
        </CardContent>
      </Card>
    </div>
  );
}
