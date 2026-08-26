import { useEffect, useState, type FormEvent } from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  api,
  getSession,
  signIn,
  signOut,
  signUp,
} from "@/lib/api";

type User = { id: string; email: string; name: string; role?: string };

function useSession() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  async function refresh() {
    const s = await getSession();
    setUser(s?.user ?? null);
  }
  useEffect(() => {
    void refresh().catch(() => setUser(null));
  }, []);
  return { user, refresh, setUser };
}

function Shell({
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

function AuthPage({
  mode,
  onDone,
}: {
  mode: "login" | "register";
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (mode === "register") {
        await signUp(email, password, name || email.split("@")[0]!);
      } else {
        await signIn(email, password);
      }
      onDone();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "失败");
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-semibold">
        {mode === "login" ? "登录" : "注册"}
      </h1>
      {mode === "register" && (
        <label className="block space-y-1 text-sm">
          <span>姓名</span>
          <input
            className="w-full rounded-md border border-border bg-background px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      )}
      <label className="block space-y-1 text-sm">
        <span>邮箱</span>
        <input
          type="email"
          required
          className="w-full rounded-md border border-border bg-background px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>密码</span>
        <input
          type="password"
          required
          minLength={8}
          className="w-full rounded-md border border-border bg-background px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit">{mode === "login" ? "登录" : "注册"}</Button>
      <p className="text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            没有账号？ <Link to="/register">注册</Link>
          </>
        ) : (
          <>
            已有账号？ <Link to="/login">登录</Link>
          </>
        )}
      </p>
    </form>
  );
}

function ProjectsPage() {
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

const TABS = [
  "overview",
  "demands",
  "sprints",
  "cases",
  "plans",
  "executions",
  "reports",
] as const;

type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  overview: "概览",
  demands: "需求看板",
  sprints: "Sprint",
  cases: "用例库",
  plans: "测试计划",
  executions: "测试执行",
  reports: "测试报告",
};

function ProjectPage() {
  const { projectId = "" } = useParams();
  const [tab, setTab] = useState<Tab>("overview");
  const [project, setProject] = useState<{
    id: string;
    name: string;
    description?: string | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  useEffect(() => {
    void api<{ id: string; name: string; description?: string | null }>(
      `/api/projects/${projectId}`,
    )
      .then(setProject)
      .catch((e) => setError(e.message));
  }, [projectId]);

  if (error) return <p className="text-destructive">{error}</p>;
  if (!project) return <p className="text-muted-foreground">加载中…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/" className="text-sm text-muted-foreground">
            ← 项目列表
          </Link>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void api<{ code: string }>(`/api/projects/${projectId}/invite-codes`, {
                method: "POST",
                body: "{}",
              }).then((r) => setInviteCode(r.code));
            }}
          >
            生成邀请码
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void api(`/api/projects/${projectId}/archive`, {
                method: "POST",
                body: "{}",
              }).then(() => (window.location.href = "/"));
            }}
          >
            归档项目
          </Button>
        </div>
      </div>
      {inviteCode && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          邀请码：<code>{inviteCode}</code>
        </p>
      )}

      <nav className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === t ? "bg-primary text-primary-foreground" : "hover:bg-muted"
            }`}
            onClick={() => setTab(t)}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </nav>

      {tab === "overview" && (
        <p className="text-muted-foreground">
          在各标签中管理需求、Sprint、用例、计划与执行。
        </p>
      )}
      {tab === "demands" && <DemandsPanel projectId={projectId} />}
      {tab === "sprints" && <SprintsPanel projectId={projectId} />}
      {tab === "cases" && <CasesPanel projectId={projectId} />}
      {tab === "plans" && <PlansPanel projectId={projectId} />}
      {tab === "executions" && <ExecutionsPanel projectId={projectId} />}
      {tab === "reports" && <ReportsPanel projectId={projectId} />}
    </div>
  );
}

function DemandsPanel({ projectId }: { projectId: string }) {
  const [demands, setDemands] = useState<
    { id: string; title: string; boardColumn: string; storyPoints?: number }[]
  >([]);
  const [title, setTitle] = useState("");
  const [sprints, setSprints] = useState<{ id: string; name: string }[]>([]);
  const [sprintId, setSprintId] = useState("");

  async function load() {
    setDemands(await api(`/api/projects/${projectId}/demands`));
    setSprints(await api(`/api/projects/${projectId}/sprints`));
  }
  useEffect(() => {
    void load();
  }, [projectId]);

  const columns = [
    ["todo", "待办"],
    ["in_progress", "进行中"],
    ["awaiting_acceptance", "待验收"],
    ["done", "完成"],
  ] as const;

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void api(`/api/projects/${projectId}/demands`, {
            method: "POST",
            body: JSON.stringify({
              title,
              priority: "medium",
              storyPoints: 3,
              sprintId: sprintId || null,
            }),
          }).then(() => {
            setTitle("");
            return load();
          });
        }}
      >
        <input
          className="rounded-md border border-border px-3 py-2"
          placeholder="需求标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <select
          className="rounded-md border border-border px-3 py-2"
          value={sprintId}
          onChange={(e) => setSprintId(e.target.value)}
        >
          <option value="">Backlog</option>
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <Button type="submit">创建需求</Button>
      </form>
      <div className="grid gap-3 md:grid-cols-4">
        {columns.map(([key, label]) => (
          <div key={key} className="space-y-2">
            <h3 className="text-sm font-medium">{label}</h3>
            {demands
              .filter((d) => d.boardColumn === key)
              .map((d) => (
                <div
                  key={d.id}
                  className="rounded-md border border-border bg-background p-3 text-sm"
                >
                  <div>{d.title}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {columns.map(([col, lab]) =>
                      col === key ? null : (
                        <button
                          key={col}
                          type="button"
                          className="text-xs text-primary underline"
                          onClick={() => {
                            void api(
                              `/api/projects/${projectId}/demands/${d.id}/board`,
                              {
                                method: "POST",
                                body: JSON.stringify({ boardColumn: col }),
                              },
                            ).then(load);
                          }}
                        >
                          →{lab}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SprintsPanel({ projectId }: { projectId: string }) {
  const [sprints, setSprints] = useState<
    {
      id: string;
      name: string;
      status: string;
      lockedCapacity?: number | null;
      capacityLimit: number;
    }[]
  >([]);
  const [burndown, setBurndown] = useState<Record<string, unknown> | null>(null);
  const [name, setName] = useState("");

  async function load() {
    setSprints(await api(`/api/projects/${projectId}/sprints`));
  }
  useEffect(() => {
    void load();
  }, [projectId]);

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void api(`/api/projects/${projectId}/sprints`, {
            method: "POST",
            body: JSON.stringify({
              name,
              startDate: "2026-08-01",
              endDate: "2026-08-14",
              capacityLimit: 20,
            }),
          }).then(() => {
            setName("");
            return load();
          });
        }}
      >
        <input
          className="rounded-md border border-border px-3 py-2"
          placeholder="Sprint 名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Button type="submit">创建 Sprint</Button>
      </form>
      <ul className="space-y-3">
        {sprints.map((s) => (
          <li
            key={s.id}
            className="rounded-md border border-border bg-background p-3 text-sm"
          >
            <div className="font-medium">
              {s.name} · {s.status}
            </div>
            <div className="text-muted-foreground">
              容量上限 {s.capacityLimit}
              {s.lockedCapacity != null ? ` · 锁定 ${s.lockedCapacity}` : ""}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {s.status === "planning" && (
                <Button
                  size="sm"
                  type="button"
                  onClick={() => {
                    void api(
                      `/api/projects/${projectId}/sprints/${s.id}/transition`,
                      {
                        method: "POST",
                        body: JSON.stringify({ status: "active" }),
                      },
                    ).then(load);
                  }}
                >
                  开始
                </Button>
              )}
              {s.status === "active" && (
                <Button
                  size="sm"
                  variant="outline"
                  type="button"
                  onClick={() => {
                    void api(
                      `/api/projects/${projectId}/sprints/${s.id}/transition`,
                      {
                        method: "POST",
                        body: JSON.stringify({ status: "completed" }),
                      },
                    ).then(load);
                  }}
                >
                  完成
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => {
                  void api<Record<string, unknown>>(
                    `/api/projects/${projectId}/sprints/${s.id}/burndown`,
                  ).then(setBurndown);
                }}
              >
                查看燃尽
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {burndown && (
        <pre className="overflow-auto rounded-md bg-muted/50 p-3 text-xs">
          {JSON.stringify(burndown, null, 2)}
        </pre>
      )}
    </div>
  );
}

function CasesPanel({ projectId }: { projectId: string }) {
  const [cases, setCases] = useState<
    { id: string; title: string; status: string }[]
  >([]);
  const [title, setTitle] = useState("");

  async function load() {
    setCases(await api(`/api/projects/${projectId}/cases`));
  }
  useEffect(() => {
    void load();
  }, [projectId]);

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void api(`/api/projects/${projectId}/cases`, {
            method: "POST",
            body: JSON.stringify({
              title,
              steps: [{ action: "操作", expected: "预期" }],
              status: "draft",
            }),
          }).then(() => {
            setTitle("");
            return load();
          });
        }}
      >
        <input
          className="rounded-md border border-border px-3 py-2"
          placeholder="用例标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <Button type="submit">创建用例</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            window.open(
              `${import.meta.env.VITE_API_BASE_URL}/api/projects/${projectId}/cases/import-template`,
              "_blank",
            );
          }}
        >
          下载导入模板
        </Button>
      </form>
      <ul className="space-y-2">
        {cases.map((c) => (
          <li
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            <span>
              {c.title} · {c.status}
            </span>
            <div className="flex gap-2">
              {c.status === "draft" && (
                <Button
                  size="sm"
                  type="button"
                  onClick={() => {
                    void api(`/api/projects/${projectId}/cases/${c.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ status: "ready" }),
                    }).then(load);
                  }}
                >
                  标为就绪
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                type="button"
                onClick={() => {
                  void api(`/api/projects/${projectId}/cases/${c.id}/copy`, {
                    method: "POST",
                    body: "{}",
                  }).then(load);
                }}
              >
                复制
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlansPanel({ projectId }: { projectId: string }) {
  const [sprints, setSprints] = useState<{ id: string; name: string }[]>([]);
  const [plans, setPlans] = useState<{ id: string; name: string; sprintId: string }[]>(
    [],
  );
  const [cases, setCases] = useState<{ id: string; title: string; status: string }[]>(
    [],
  );
  const [sprintId, setSprintId] = useState("");
  const [name, setName] = useState("");

  async function load() {
    const s = await api<{ id: string; name: string }[]>(
      `/api/projects/${projectId}/sprints`,
    );
    setSprints(s);
    setPlans(await api(`/api/projects/${projectId}/plans`));
    setCases(await api(`/api/projects/${projectId}/cases?status=ready`));
    if (!sprintId && s[0]) setSprintId(s[0].id);
  }
  useEffect(() => {
    void load();
  }, [projectId]);

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void api(`/api/projects/${projectId}/plans`, {
            method: "POST",
            body: JSON.stringify({ sprintId, name }),
          }).then(() => {
            setName("");
            return load();
          });
        }}
      >
        <select
          className="rounded-md border border-border px-3 py-2"
          value={sprintId}
          onChange={(e) => setSprintId(e.target.value)}
          required
        >
          {sprints.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          className="rounded-md border border-border px-3 py-2"
          placeholder="计划名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <Button type="submit">创建计划</Button>
      </form>
      <ul className="space-y-2">
        {plans.map((p) => (
          <li
            key={p.id}
            className="rounded-md border border-border bg-background p-3 text-sm"
          >
            <div className="font-medium">{p.name}</div>
            <Button
              size="sm"
              className="mt-2"
              type="button"
              onClick={() => {
                const readyIds = cases.map((c) => c.id);
                void api(`/api/projects/${projectId}/plans/${p.id}/cases`, {
                  method: "PUT",
                  body: JSON.stringify({ caseIds: readyIds }),
                }).then(load);
              }}
            >
              勾选全部就绪用例
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExecutionsPanel({ projectId }: { projectId: string }) {
  const [plans, setPlans] = useState<{ id: string; name: string }[]>([]);
  const [executions, setExecutions] = useState<
    { id: string; name?: string; status: string }[]
  >([]);
  const [detail, setDetail] = useState<{
    id: string;
    results: { id: string; status: string; lastEditorId?: string | null }[];
  } | null>(null);

  async function load() {
    setPlans(await api(`/api/projects/${projectId}/plans`));
    setExecutions(await api(`/api/projects/${projectId}/executions`));
  }
  useEffect(() => {
    void load();
  }, [projectId]);

  useEffect(() => {
    if (!detail) return;
    const t = setInterval(() => {
      void api<{
        id: string;
        results: { id: string; status: string; lastEditorId?: string | null }[];
      }>(`/api/projects/${projectId}/executions/${detail.id}`).then(setDetail);
    }, 12000);
    return () => clearInterval(t);
  }, [detail?.id, projectId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {plans.map((p) => (
          <Button
            key={p.id}
            type="button"
            size="sm"
            onClick={() => {
              void api(`/api/projects/${projectId}/plans/${p.id}/executions`, {
                method: "POST",
                body: "{}",
              }).then(load);
            }}
          >
            开跑：{p.name}
          </Button>
        ))}
      </div>
      <ul className="space-y-2">
        {executions.map((e) => (
          <li key={e.id}>
            <button
              type="button"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-left text-sm"
              onClick={() => {
                void api<{
                  id: string;
                  results: {
                    id: string;
                    status: string;
                    lastEditorId?: string | null;
                  }[];
                }>(`/api/projects/${projectId}/executions/${e.id}`).then(
                  setDetail,
                );
              }}
            >
              {e.name ?? e.id} · {e.status}
            </button>
          </li>
        ))}
      </ul>
      {detail && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <p className="text-sm text-muted-foreground">约 12 秒轮询刷新</p>
          {detail.results.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span>{r.status}</span>
              {(["untested", "passed", "failed", "blocked"] as const).map(
                (st) => (
                  <button
                    key={st}
                    type="button"
                    className="text-xs text-primary underline"
                    onClick={() => {
                      void api(
                        `/api/projects/${projectId}/executions/${detail.id}/results/${r.id}`,
                        {
                          method: "PATCH",
                          body: JSON.stringify({ status: st }),
                        },
                      ).then(() =>
                        api<{
                          id: string;
                          results: {
                            id: string;
                            status: string;
                            lastEditorId?: string | null;
                          }[];
                        }>(
                          `/api/projects/${projectId}/executions/${detail.id}`,
                        ).then(setDetail),
                      );
                    }}
                  >
                    {st}
                  </button>
                ),
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportsPanel({ projectId }: { projectId: string }) {
  const [sprints, setSprints] = useState<{ id: string; name: string }[]>([]);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void api<{ id: string; name: string }[]>(
      `/api/projects/${projectId}/sprints`,
    ).then(setSprints);
  }, [projectId]);

  return (
    <div className="space-y-4">
      {sprints.map((s) => (
        <Button
          key={s.id}
          type="button"
          variant="outline"
          onClick={() => {
            void api<Record<string, unknown>>(
              `/api/projects/${projectId}/sprints/${s.id}/report`,
            ).then(setReport);
          }}
        >
          Sprint 报告：{s.name}
        </Button>
      ))}
      {report && (
        <pre className="overflow-auto rounded-md bg-muted/50 p-3 text-xs">
          {JSON.stringify(report, null, 2)}
        </pre>
      )}
    </div>
  );
}

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
