import { Navigate, Route, Routes } from "react-router-dom";
import { Shell } from "@/components/Shell";
import { useSession } from "@/hooks/useSession";
import { signOut } from "@/lib/api";
import { AuthPage } from "@/pages/auth/AuthPage";
import { ProjectsPage } from "@/pages/projects/ProjectsPage";
import { ProjectPage } from "@/pages/projects/ProjectPage";

export function App() {
  const { user, refresh, setUser } = useSession();

  if (user === undefined) {
    return (
      <div className="grid min-h-dvh place-items-center text-muted-foreground">
        加载中…
      </div>
    );
  }

  return (
    <Shell
      user={user}
      onSignOut={() => {
        void signOut().then(() => setUser(null));
      }}
    >
      <Routes>
        <Route
          path="/login"
          element={
            user ? (
              <Navigate to="/" replace />
            ) : (
              <AuthPage mode="login" onDone={() => void refresh()} />
            )
          }
        />
        <Route
          path="/register"
          element={
            user ? (
              <Navigate to="/" replace />
            ) : (
              <AuthPage mode="register" onDone={() => void refresh()} />
            )
          }
        />
        <Route
          path="/"
          element={user ? <ProjectsPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/projects/:projectId"
          element={user ? <ProjectPage /> : <Navigate to="/login" replace />}
        />
      </Routes>
    </Shell>
  );
}
