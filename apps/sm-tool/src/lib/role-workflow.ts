export type WorkflowRole = "main" | "architect" | "designer" | "developer" | "qa";
export type WorkflowTaskStatus = "draft" | "in-progress" | "blocked" | "passed" | "paused";
export type QaVerdict = "PASS" | "PASS WITH FOLLOW-UPS" | "FAIL" | "PAUSED";

export interface WorkflowTask {
  id: string;
  number: number;
  title: string;
  scope: string;
  needsDesign: boolean;
  status: WorkflowTaskStatus;
  currentRole: WorkflowRole;
  verdict?: QaVerdict;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowMessage {
  id: string;
  taskId: string;
  from: WorkflowRole;
  to: WorkflowRole;
  kind: "handoff" | "report" | "note";
  body: string;
  createdAt: string;
}

export interface WorkflowState {
  version: 1;
  tasks: WorkflowTask[];
  messages: WorkflowMessage[];
}

export const WORKFLOW_STORAGE_KEY = "sm-tool-role-workflow-v1";

export const WORKFLOW_ROLES: Array<{ id: WorkflowRole; label: string; description: string }> = [
  { id: "main", label: "Main / ScrumMaster", description: "Owns task number, scope, routing and user status." },
  { id: "architect", label: "Architect", description: "Defines the technical scope and acceptance criteria." },
  { id: "designer", label: "Product Designer", description: "Designs UI/Figma only when the task needs it." },
  { id: "developer", label: "Developer", description: "Implements only the approved handoff." },
  { id: "qa", label: "QA / Reviewer", description: "Reviews independently and reports the verdict." },
];

export function createEmptyWorkflowState(): WorkflowState {
  return { version: 1, tasks: [], messages: [] };
}

export function loadWorkflowState(): WorkflowState {
  if (typeof window === "undefined") return createEmptyWorkflowState();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WORKFLOW_STORAGE_KEY) ?? "null") as Partial<WorkflowState> | null;
    if (!parsed || !Array.isArray(parsed.tasks) || !Array.isArray(parsed.messages)) return createEmptyWorkflowState();
    return { version: 1, tasks: parsed.tasks as WorkflowTask[], messages: parsed.messages as WorkflowMessage[] };
  } catch {
    return createEmptyWorkflowState();
  }
}

export function saveWorkflowState(state: WorkflowState): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(state));
}

export function nextTaskNumber(tasks: WorkflowTask[]): number {
  return tasks.reduce((highest, task) => Math.max(highest, task.number), 0) + 1;
}

export function nextRole(task: WorkflowTask, after: WorkflowRole): WorkflowRole {
  if (after === "main") return "architect";
  if (after === "architect") return task.needsDesign ? "designer" : "developer";
  if (after === "designer") return "developer";
  if (after === "developer") return "qa";
  return "main";
}

export function canAdvance(task: WorkflowTask): boolean {
  if (task.currentRole === "developer" && task.status === "blocked" && task.verdict === "FAIL") {
    return true;
  }

  return task.status === "in-progress" && task.currentRole !== "main";
}

export function verdictStatus(verdict: QaVerdict): WorkflowTaskStatus {
  if (verdict === "FAIL") return "blocked";
  if (verdict === "PAUSED") return "paused";
  return "passed";
}

export function applyQaVerdict(task: WorkflowTask, verdict: QaVerdict, updatedAt: string): WorkflowTask {
  return {
    ...task,
    currentRole: verdict === "FAIL" ? "developer" : "main",
    status: verdictStatus(verdict),
    verdict,
    updatedAt,
  };
}

export function prepareRemediationHandoff(task: WorkflowTask, updatedAt: string): WorkflowTask {
  if (task.currentRole !== "developer" || task.status !== "blocked" || task.verdict !== "FAIL") {
    return task;
  }

  return {
    ...task,
    currentRole: "qa",
    status: "in-progress",
    verdict: undefined,
    updatedAt,
  };
}
