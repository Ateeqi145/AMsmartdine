import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { useNavigate } from "react-router-dom";

export default function Unauthorized() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8">
        <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
          <ShieldOff className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground max-w-sm">
          You don't have permission to access this area.
        </p>
        <Button onClick={() => navigate("/")}>Go Home</Button>
      </div>
    </div>
  );
}
