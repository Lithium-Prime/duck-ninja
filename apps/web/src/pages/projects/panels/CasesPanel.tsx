import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function CasesPanel({ projectId }: { projectId: string }) {
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
