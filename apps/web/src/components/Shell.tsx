import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { User } from "@/types";

export function Shell({
  user,
  onSignOut,
  children,
}: {
  user: User | null;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_oklch(0.96_0.02_250),_oklch(0.985_0.01_95))]">
      <header className="border-b border-border/80 bg-background/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            Duck Ninja
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {user ? (
              <>
                <span className="text-muted-foreground">{user.name}</span>
                <Button type="button" variant="outline" size="sm" onClick={onSignOut}>
                  登出
                </Button>
              </>
            ) : null}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
