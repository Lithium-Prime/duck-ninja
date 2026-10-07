import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function PlansPanel({ projectId }: { projectId: string }) {
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
