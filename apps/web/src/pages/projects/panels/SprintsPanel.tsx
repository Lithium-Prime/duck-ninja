import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function SprintsPanel({ projectId }: { projectId: string }) {
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
