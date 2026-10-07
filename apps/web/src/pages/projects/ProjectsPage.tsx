import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function ProjectsPage() {
  const [projects, setProjects] = useState<
    { id: string; name: string; description?: string | null }[]
  >([]);
  const [name, setName] = useState("");
  const [invite, setInvite] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    setProjects(await api("/api/projects"));
  }
  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">项目</h1>
        <p className="text-muted-foreground">创建          注册后默认无项目；可创建或凭邀请码加入。
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void api("/api/projects", {
              method: "POST",
              body: JSON.stringify({ name }),
            })
              .then(() => {
                setName("");
                return load();
              })
              .catch((err) => setMsg(String(err.message)));
          }}
        >
          <h2 className="font-medium">创建项目</h2>
          <input
            className="w-full rounded-md border border-border px-3 py-2"
            placeholder="项目名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Button type="submit">创建</Button>
        </form>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void api("/api/invite-codes/redeem", {
              method: "POST",
              body: JSON.stringify({ code: invite }),
            })
              .then(() => {
                setInvite("");
                setMsg("已加入项目");
                return load();
              })
              .catch((err) => setMsg(String(err.message)));
          }}
        >
          <h2 className="font-medium">用项目邀请码加入</h2>
          <input
            className="w-full rounded-md border border-border px-3 py-2"
            placeholder="邀请码"
            value={invite}
            onChange={(e) => setInvite(e.target.value)}
            required
          />
          <Button type="submit" variant="outline">
            加入
          </Button>
        </form>
      </section>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

      <ul className="space-y-2">
        {projects.length === 0 && (
          <li className="text-muted-foreground">暂无项目</li>
        )}
        {projects.map((p) => (
          <li key={p.id}>
            <Link
              className="block rounded-md border border-border bg-background/80 px-4 py-3 hover:border-primary"
              to={`/projects/${p.id}`}
            >
              <div className="font-medium">{p.name}</div>
              {p.description && (
                <div className="text-sm text-muted-foreground">{p.description}</div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
