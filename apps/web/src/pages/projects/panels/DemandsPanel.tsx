import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function DemandsPanel({ projectId }: { projectId: string }) {
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
