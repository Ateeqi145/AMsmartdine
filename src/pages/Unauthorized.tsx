import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";

export default function Unauthorized() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signout, isAuthenticated, isLoading } = useAuth();
  const inactive = searchParams.get("reason") === "inactive";

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8">
        <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
          <ShieldOff className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-2xl font-bold">
          {inactive ? "Account inactive" : "Access Denied"}
        </h2>
        <p className="text-muted-foreground max-w-sm">
          {inactive
            ? "This account has been deactivated. Ask a Super Admin to reactivate it before signing in again."
            : "You don't have permission to access this area."}
        </p>
        <Button onClick={() => void signout()}>
          {inactive ? "Sign out" : "Return to sign in"}
        </Button>
      </div>
    </div>
  );
}
