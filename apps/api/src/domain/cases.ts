import ExcelJS from "exceljs";
import { HttpError, newId, nowIso } from "../lib/util";
import type { CaseStatus, CaseStep, ParamGroup } from "../lib/vocab";
import { CASE_STATUSES } from "../lib/vocab";

export type CaseInput = {
  title: string;
  description?: string | null;
  precondition?: string | null;
  steps: CaseStep[];
  priority?: string | null;
  severity?: string | null;
  type?: string | null;
  tags?: string[];
  maintainerId?: string | null;
  estimatedMinutes?: number | null;
  folderId?: string | null;
  demandIds?: string[];
  status?: CaseStatus;
  params?: ParamGroup[];
};

const CRITICAL_FIELDS = ["title", "precondition", "steps"] as const;

function serializeCase(row: Record<string, unknown>) {
  return {
    ...row,
    steps: JSON.parse(String(row.stepsJson ?? "[]")),
    tags: JSON.parse(String(row.tagsJson ?? "[]")),
    params: JSON.parse(String(row.paramsJson ?? "[]")),
  };
}

export async function createFolder(
  db: D1Database,
  projectId: string,
  input: { name: string; parentId?: string | null },
  now?: () => Date,
) {
  if (!input.name?.trim()) throw new HttpError(400, "目录名称必填");
  if (input.parentId) {
    const parent = await db
      .prepare(
        `SELECT id FROM case_folder WHERE id = ? AND projectId = ? AND archivedAt IS NULL`,
      )
      .bind(input.parentId, projectId)
      .first();
    if (!parent) throw new HttpError(400, "父目录不存在");
  }
  const id = newId();
  const ts = nowIso(now);
  await db
    .prepare(
      `INSERT INTO case_folder (id, projectId, parentId, name, archivedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(id, projectId, input.parentId ?? null, input.name.trim(), ts, ts)
    .run();
  return db.prepare(`SELECT * FROM case_folder WHERE id = ?`).bind(id).first();
}

export async function listFolders(
  db: D1Database,
  projectId: string,
  includeArchived = false,
) {
  const sql = includeArchived
    ? `SELECT * FROM case_folder WHERE projectId = ? ORDER BY name ASC`
    : `SELECT * FROM case_folder WHERE projectId = ? AND archivedAt IS NULL ORDER BY name ASC`;
  const { results } = await db.prepare(sql).bind(projectId).all();
  return results ?? [];
}

export async function archiveFolder(
  db: D1Database,
  projectId: string,
  folderId: string,
  now?: () => Date,
) {
  const ts = nowIso(now);
  const result = await db
    .prepare(
      `UPDATE case_folder SET archivedAt = ?, updatedAt = ? WHERE id = ? AND projectId = ? AND archivedAt IS NULL`,
    )
    .bind(ts, ts, folderId, projectId)
    .run();
  if (!result.meta.changes) throw new HttpError(404, "目录不存在或已归档");
  return { id: folderId, archivedAt: ts };
}

export async function createCase(
  db: D1Database,
  projectId: string,
  input: CaseInput,
  now?: () => Date,
) {
  if (!input.title?.trim()) throw new HttpError(400, "标题必填");
  if (!Array.isArray(input.steps)) throw new HttpError(400, "步骤必填");
  const id = newId();
  const ts = nowIso(now);
  const status = input.status ?? "draft";
  if (!(CASE_STATUSES as readonly string[]).includes(status)) {
    throw new HttpError(400, "无效用例状态");
  }
  await db
    .prepare(
      `INSERT INTO test_case (
        id, projectId, folderId, title, description, precondition, stepsJson,
        priority, severity, type, tagsJson, maintainerId, estimatedMinutes,
        status, paramsJson, archivedAt, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    )
    .bind(
      id,
      projectId,
      input.folderId ?? null,
      input.title.trim(),
      input.description ?? null,
      input.precondition ?? null,
      JSON.stringify(input.steps),
      input.priority ?? null,
      input.severity ?? null,
      input.type ?? null,
      JSON.stringify(input.tags ?? []),
      input.maintainerId ?? null,
      input.estimatedMinutes ?? null,
      status,
      JSON.stringify(input.params ?? []),
      ts,
      ts,
    )
    .run();
  if (input.demandIds?.length) {
    await setCaseDemands(db, projectId, id, input.demandIds);
  }
  return getCase(db, id);
}

export type CaseRecord = {
  id: string;
  projectId: string;
  folderId: string | null;
  title: string;
  description: string | null;
  precondition: string | null;
  steps: CaseStep[];
  priority: string | null;
  severity: string | null;
  type: string | null;
  tags: string[];
  maintainerId: string | null;
  estimatedMinutes: number | null;
  status: string;
  params: ParamGroup[];
  archivedAt: string | null;
  demandIds: string[];
};

export async function getCase(db: D1Database, id: string): Promise<CaseRecord> {
  const row = await db
    .prepare(`SELECT * FROM test_case WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>();
  if (!row) throw new HttpError(404, "用例不存在");
  const demands = await listCaseDemands(db, id);
  return {
    ...(serializeCase(row) as Omit<CaseRecord, "demandIds">),
    demandIds: demands,
  };
}

export async function listCases(
  db: D1Database,
  projectId: string,
  filter: {
    includeArchived?: boolean;
    folderId?: string;
    tag?: string;
    type?: string;
    status?: string;
    demandSprintId?: string;
  } = {},
) {
  const clauses = [`c.projectId = ?`];
  const binds: unknown[] = [projectId];
  if (!filter.includeArchived) clauses.push(`c.archivedAt IS NULL`);
  if (filter.folderId) {
    clauses.push(`c.folderId = ?`);
    binds.push(filter.folderId);
  }
  if (filter.type) {
    clauses.push(`c.type = ?`);
    binds.push(filter.type);
  }
  if (filter.status) {
    clauses.push(`c.status = ?`);
    binds.push(filter.status);
  }
  if (filter.tag) {
    clauses.push(`c.tagsJson LIKE ?`);
    binds.push(`%${filter.tag}%`);
  }
  if (filter.demandSprintId) {
    clauses.push(`EXISTS (
      SELECT 1 FROM case_demand_link l
      INNER JOIN demand d ON d.id = l.demandId
      WHERE l.caseId = c.id AND d.sprintId = ?
    )`);
    binds.push(filter.demandSprintId);
  }
  const { results } = await db
    .prepare(
      `SELECT c.* FROM test_case c WHERE ${clauses.join(" AND ")} ORDER BY c.createdAt DESC`,
    )
    .bind(...binds)
    .all<Record<string, unknown>>();
  return (results ?? []).map(serializeCase);
}

async function listCaseDemands(db: D1Database, caseId: string) {
  const { results } = await db
    .prepare(`SELECT demandId FROM case_demand_link WHERE caseId = ?`)
    .bind(caseId)
    .all<{ demandId: string }>();
  return (results ?? []).map((r) => r.demandId);
}

export async function setCaseDemands(
  db: D1Database,
  projectId: string,
  caseId: string,
  demandIds: string[],
) {
  for (const demandId of demandIds) {
    const d = await db
      .prepare(`SELECT id FROM demand WHERE id = ? AND projectId = ?`)
      .bind(demandId, projectId)
      .first();
    if (!d) throw new HttpError(400, `需求不存在: ${demandId}`);
  }
  await db
    .prepare(`DELETE FROM case_demand_link WHERE caseId = ?`)
    .bind(caseId)
    .run();
  for (const demandId of demandIds) {
    await db
      .prepare(
        `INSERT INTO case_demand_link (caseId, demandId) VALUES (?, ?)`,
      )
      .bind(caseId, demandId)
      .run();
  }
}

export async function updateCase(
  db: D1Database,
  projectId: string,
  caseId: string,
  patch: Partial<CaseInput>,
  now?: () => Date,
) {
  const existing = await db
    .prepare(`SELECT * FROM test_case WHERE id = ? AND projectId = ?`)
    .bind(caseId, projectId)
    .first<Record<string, unknown> & { status: string; archivedAt: string | null }>();
  if (!existing) throw new HttpError(404, "用例不存在");
  if (existing.archivedAt) throw new HttpError(400, "已归档用例不可编辑");

  let nextStatus = existing.status;
  const criticalChanged =
    (patch.title !== undefined && patch.title !== existing.title) ||
    (patch.precondition !== undefined &&
      patch.precondition !== existing.precondition) ||
    (patch.steps !== undefined &&
      JSON.stringify(patch.steps) !== String(existing.stepsJson));

  if (existing.status === "ready" && criticalChanged) {
    nextStatus = "draft";
  }
  if (patch.status !== undefined) {
    if (!(CASE_STATUSES as readonly string[]).includes(patch.status)) {
      throw new HttpError(400, "无效用例状态");
    }
    if (!(existing.status === "ready" && criticalChanged)) {
      nextStatus = patch.status;
    }
  }

  const ts = nowIso(now);
  await db
    .prepare(
      `UPDATE test_case SET
        title = COALESCE(?, title),
        description = CASE WHEN ? THEN ? ELSE description END,
        precondition = CASE WHEN ? THEN ? ELSE precondition END,
        stepsJson = COALESCE(?, stepsJson),
        priority = CASE WHEN ? THEN ? ELSE priority END,
        severity = CASE WHEN ? THEN ? ELSE severity END,
        type = CASE WHEN ? THEN ? ELSE type END,
        tagsJson = COALESCE(?, tagsJson),
        maintainerId = CASE WHEN ? THEN ? ELSE maintainerId END,
        estimatedMinutes = CASE WHEN ? THEN ? ELSE estimatedMinutes END,
        folderId = CASE WHEN ? THEN ? ELSE folderId END,
        paramsJson = COALESCE(?, paramsJson),
        status = ?,
        updatedAt = ?
       WHERE id = ?`,
    )
    .bind(
      patch.title ?? null,
      patch.description !== undefined ? 1 : 0,
      patch.description ?? null,
      patch.precondition !== undefined ? 1 : 0,
      patch.precondition ?? null,
      patch.steps ? JSON.stringify(patch.steps) : null,
      patch.priority !== undefined ? 1 : 0,
      patch.priority ?? null,
      patch.severity !== undefined ? 1 : 0,
      patch.severity ?? null,
      patch.type !== undefined ? 1 : 0,
      patch.type ?? null,
      patch.tags ? JSON.stringify(patch.tags) : null,
      patch.maintainerId !== undefined ? 1 : 0,
      patch.maintainerId ?? null,
      patch.estimatedMinutes !== undefined ? 1 : 0,
      patch.estimatedMinutes ?? null,
      patch.folderId !== undefined ? 1 : 0,
      patch.folderId ?? null,
      patch.params ? JSON.stringify(patch.params) : null,
      nextStatus,
      ts,
      caseId,
    )
    .run();

  if (patch.demandIds) {
    await setCaseDemands(db, projectId, caseId, patch.demandIds);
  }
  void CRITICAL_FIELDS;
  return getCase(db, caseId);
}

export async function archiveCase(
  db: D1Database,
  projectId: string,
  caseId: string,
  now?: () => Date,
) {
  const ts = nowIso(now);
  const result = await db
    .prepare(
      `UPDATE test_case SET archivedAt = ?, updatedAt = ? WHERE id = ? AND projectId = ? AND archivedAt IS NULL`,
    )
    .bind(ts, ts, caseId, projectId)
    .run();
  if (!result.meta.changes) throw new HttpError(404, "用例不存在或已归档");
  return { id: caseId, archivedAt: ts };
}

export async function copyCase(
  db: D1Database,
  projectId: string,
  caseId: string,
  now?: () => Date,
) {
  const source = await getCase(db, caseId);
  if (source.projectId !== projectId) throw new HttpError(404, "用例不存在");
  return createCase(
    db,
    projectId,
    {
      title: `${String(source.title)} (副本)`,
      description: source.description as string | null,
      precondition: source.precondition as string | null,
      steps: source.steps as CaseStep[],
      priority: source.priority as string | null,
      severity: source.severity as string | null,
      type: source.type as string | null,
      tags: source.tags as string[],
      maintainerId: source.maintainerId as string | null,
      estimatedMinutes: source.estimatedMinutes as number | null,
      folderId: source.folderId as string | null,
      params: source.params as ParamGroup[],
      status: "draft",
      demandIds: [],
    },
    now,
  );
}

export const IMPORT_HEADERS = [
  "title",
  "description",
  "precondition",
  "step_action",
  "step_expected",
  "priority",
  "severity",
  "type",
  "tags",
  "status",
] as const;

export async function buildImportTemplate(): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("cases");
  ws.addRow([...IMPORT_HEADERS]);
  ws.addRow([
    "登录成功",
    "示例",
    "已注册账号",
    "输入账号密码并提交",
    "进入首页",
    "P1",
    "major",
    "functional",
    "smoke,auth",
    "draft",
  ]);
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}

export async function importCasesFromXlsx(
  db: D1Database,
  projectId: string,
  bytes: Uint8Array,
  now?: () => Date,
) {
  const wb = new ExcelJS.Workbook();
  // exceljs accepts Buffer-like
  await wb.xlsx.load(Buffer.from(bytes) as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new HttpError(400, "空工作表");

  const headerRow = ws.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell((cell, col) => {
    headers[col - 1] = String(cell.value ?? "").trim();
  });
  for (const h of IMPORT_HEADERS) {
    if (!headers.includes(h)) {
      throw new HttpError(400, `缺少列: ${h}`);
    }
  }

  type RowData = {
    title: string;
    description: string | null;
    precondition: string | null;
    steps: CaseStep[];
    priority: string | null;
    severity: string | null;
    type: string | null;
    tags: string[];
    status: CaseStatus;
  };

  const parsed: RowData[] = [];
  const errors: string[] = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const get = (name: string) => {
      const idx = headers.indexOf(name);
      const v = row.getCell(idx + 1).value;
      return v == null ? "" : String(v).trim();
    };
    const title = get("title");
    const stepAction = get("step_action");
    const stepExpected = get("step_expected");
    const statusRaw = get("status") || "draft";
    if (!title) {
      errors.push(`第 ${rowNumber} 行: 标题为空`);
      return;
    }
    if (!stepAction || !stepExpected) {
      errors.push(`第 ${rowNumber} 行: 步骤不完整`);
      return;
    }
    if (!(CASE_STATUSES as readonly string[]).includes(statusRaw)) {
      errors.push(`第 ${rowNumber} 行: 状态无效`);
      return;
    }
    parsed.push({
      title,
      description: get("description") || null,
      precondition: get("precondition") || null,
      steps: [{ action: stepAction, expected: stepExpected }],
      priority: get("priority") || null,
      severity: get("severity") || null,
      type: get("type") || null,
      tags: get("tags")
        ? get("tags")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      status: statusRaw as CaseStatus,
    });
  });

  if (errors.length) {
    throw new HttpError(400, `导入失败: ${errors.join("; ")}`);
  }
  if (!parsed.length) {
    throw new HttpError(400, "没有可导入的行");
  }

  const created = [];
  for (const row of parsed) {
    created.push(await createCase(db, projectId, row, now));
  }
  return { count: created.length, cases: created };
}
