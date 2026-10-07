import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { TABS, TAB_LABEL, type Tab } from "@/types";
import {
  DemandsPanel,
  SprintsPanel,
  CasesPanel,
  PlansPanel,
  ExecutionsPanel,
  ReportsPanel,
} from "./panels";

export function ProjectPage() {
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
