import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function ReportsPanel({ projectId }: { projectId: string }) {
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
