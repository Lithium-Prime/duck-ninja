import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function ExecutionsPanel({ projectId }: { projectId: string }) {
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
