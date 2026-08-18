import { useMemo, useState } from "react";
import {
  canAdvance,
  createEmptyWorkflowState,
  applyQaVerdict,
  loadWorkflowState,
  nextRole,
  nextTaskNumber,
  prepareRemediationHandoff,
  saveWorkflowState,
  WORKFLOW_ROLES,
  type QaVerdict,
  type WorkflowRole,
  type WorkflowMessage,
  type WorkflowState,
  type WorkflowTask,
} from "../lib/role-workflow";

const roleLabel = (role: WorkflowRole) => WORKFLOW_ROLES.find((item) => item.id === role)?.label ?? role;
const timeLabel = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: "short", timeStyle: "short" }).format(new Date(value));

export function RoleWorkflow() {
  const [state, setState] = useState<WorkflowState>(() => loadWorkflowState());
  const [title, setTitle] = useState("");
  const [scope, setScope] = useState("");
  const [needsDesign, setNeedsDesign] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageTo, setMessageTo] = useState<WorkflowRole>("architect");

  const selectedTask = state.tasks.find((task) => task.id === selectedTaskId) ?? state.tasks[0];
  const selectedMessages = useMemo(
    () => (selectedTask ? state.messages.filter((item) => item.taskId === selectedTask.id).slice().reverse() : []),
    [selectedTask, state.messages],
  );

  function commit(next: WorkflowState) {
    setState(next);
    saveWorkflowState(next);
  }

  function createTask() {
    if (!title.trim() || !scope.trim()) return;
    const now = new Date().toISOString();
    const task: WorkflowTask = {
      id: crypto.randomUUID(), number: nextTaskNumber(state.tasks), title: title.trim(), scope: scope.trim(), needsDesign,
      status: "in-progress", currentRole: "architect", createdAt: now, updatedAt: now,
    };
    const next = { ...state, tasks: [task, ...state.tasks] };
    commit(next);
    setSelectedTaskId(task.id);
    setTitle(""); setScope(""); setNeedsDesign(false);
  }

  function advanceTask() {
    if (!selectedTask || !canAdvance(selectedTask)) return;
    const now = new Date().toISOString();
    const from = selectedTask.currentRole;
    const to = nextRole(selectedTask, from);
    const isRemediation = selectedTask.currentRole === "developer" && selectedTask.status === "blocked" && selectedTask.verdict === "FAIL";
    const nextTask = isRemediation
      ? prepareRemediationHandoff(selectedTask, now)
      : { ...selectedTask, currentRole: to, updatedAt: now, status: "in-progress" as const };
    const nextMessage = { id: crypto.randomUUID(), taskId: selectedTask.id, from, to: isRemediation ? "qa" as const : to, kind: "handoff" as const, body: isRemediation ? `Developer remediation is ready for QA review for TASK ${selectedTask.number}.` : `${roleLabel(from)} handed off TASK ${selectedTask.number} to ${roleLabel(to)}.`, createdAt: now };
    commit({ ...state, tasks: state.tasks.map((task) => task.id === selectedTask.id ? nextTask : task), messages: [...state.messages, nextMessage] });
  }

  function recordVerdict(verdict: QaVerdict) {
    if (!selectedTask || selectedTask.currentRole !== "qa") return;
    const now = new Date().toISOString();
    const nextTask = applyQaVerdict(selectedTask, verdict, now);
    const reportMessage = { id: crypto.randomUUID(), taskId: selectedTask.id, from: "qa" as const, to: "main" as const, kind: "report" as const, body: `QA verdict: ${verdict}`, createdAt: now };
    const nextMessages: WorkflowMessage[] = [reportMessage];
    if (verdict === "FAIL") {
      nextMessages.push({ id: crypto.randomUUID(), taskId: selectedTask.id, from: "qa", to: "developer", kind: "handoff", body: `Developer remediation required for TASK ${selectedTask.number}.`, createdAt: now });
    }
    commit({ ...state, tasks: state.tasks.map((task) => task.id === selectedTask.id ? nextTask : task), messages: [...state.messages, ...nextMessages] });
  }

  function sendNote() {
    if (!selectedTask || !message.trim()) return;
    const nextMessage = { id: crypto.randomUUID(), taskId: selectedTask.id, from: "main" as const, to: messageTo, kind: "note" as const, body: message.trim(), createdAt: new Date().toISOString() };
    commit({ ...state, messages: [...state.messages, nextMessage] });
    setMessage("");
  }

  function clearState() {
    const empty = createEmptyWorkflowState();
    commit(empty); setSelectedTaskId(null);
  }

  return (
    <section className="page-section role-workflow-page">
      <div className="section-head">
        <div><h1>Role Workflow</h1><p>Local-first task routing for Main, Architect, Designer, Developer and QA.</p></div>
        <span className="workflow-runtime-badge">Local coordinator · no external chat access</span>
      </div>

      <section className="workflow-role-strip" aria-label="Role handoff sequence">
        {WORKFLOW_ROLES.map((role, index) => <div className="workflow-role-step" key={role.id}><span>{index + 1}</span><strong>{role.label}</strong><small>{role.description}</small></div>)}
      </section>

      <div className="role-workflow-grid">
        <section className="table-panel">
          <div className="table-title-row"><div><div className="table-title">Create task</div><div className="table-subtitle">New work starts at Architect. Designer is inserted only when UI/Figma is in scope.</div></div></div>
          <div className="workflow-create-form">
            <label>Task title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Add sprint health review" /></label>
            <label>Frozen scope<textarea value={scope} onChange={(event) => setScope(event.target.value)} placeholder="What must be delivered and what is excluded?" rows={3} /></label>
            <label className="workflow-check"><input type="checkbox" checked={needsDesign} onChange={(event) => setNeedsDesign(event.target.checked)} /> UI or Figma handoff required</label>
            <button type="button" onClick={createTask} disabled={!title.trim() || !scope.trim()}>Create TASK {nextTaskNumber(state.tasks)}</button>
          </div>
        </section>

        <section className="table-panel">
          <div className="table-title-row"><div><div className="table-title">Task queue</div><div className="table-subtitle">FAIL blocks the task. PASS WITH FOLLOW-UPS closes it with explicit follow-ups.</div></div><button type="button" className="soft-btn" onClick={clearState} disabled={state.tasks.length === 0}>Clear local queue</button></div>
          <div className="workflow-task-list">
            {state.tasks.length === 0 ? <p className="muted">No local tasks yet. Create the first task above.</p> : state.tasks.map((task) => <button type="button" key={task.id} className={`workflow-task-row ${selectedTask?.id === task.id ? "active" : ""}`} onClick={() => setSelectedTaskId(task.id)}><span>TASK {String(task.number).padStart(3, "0")}</span><strong>{task.title}</strong><small>{task.status} · {roleLabel(task.currentRole)}</small></button>)}
          </div>
        </section>
      </div>

      {selectedTask ? <section className="table-panel workflow-detail-panel">
        <div className="section-head compact"><div><div className="eyebrow">TASK {String(selectedTask.number).padStart(3, "0")}</div><h2>{selectedTask.title}</h2><p>{selectedTask.scope}</p></div><span className={`workflow-status-pill ${selectedTask.status}`}>{selectedTask.status}{selectedTask.verdict ? ` · ${selectedTask.verdict}` : ""}</span></div>
        <div className="workflow-detail-grid"><div><span className="card-meta">Current owner</span><strong>{roleLabel(selectedTask.currentRole)}</strong></div><div><span className="card-meta">Path</span><strong>{selectedTask.needsDesign ? "Architect → Designer → Developer → QA" : "Architect → Developer → QA"}</strong></div><div><span className="card-meta">Updated</span><strong>{timeLabel(selectedTask.updatedAt)}</strong></div></div>
        <div className="workflow-actions"><button type="button" onClick={advanceTask} disabled={!canAdvance(selectedTask)}>{selectedTask.currentRole === "developer" && selectedTask.status === "blocked" ? "Send remediation to QA" : `Handoff to ${roleLabel(nextRole(selectedTask, selectedTask.currentRole))}`}</button>{selectedTask.currentRole === "qa" ? <div className="workflow-verdicts">{(["PASS", "PASS WITH FOLLOW-UPS", "FAIL", "PAUSED"] as QaVerdict[]).map((verdict) => <button type="button" className="soft-btn" key={verdict} onClick={() => recordVerdict(verdict)}>{verdict}</button>)}</div> : null}</div>
        <div className="workflow-message-form"><label>Message to<select value={messageTo} onChange={(event) => setMessageTo(event.target.value as WorkflowRole)}>{WORKFLOW_ROLES.filter((role) => role.id !== "main").map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label><label className="workflow-message-input">Note<textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={2} placeholder="Add a handoff note or follow-up" /></label><button type="button" className="soft-btn" onClick={sendNote} disabled={!message.trim()}>Send local note</button></div>
        <div className="workflow-event-list"><h3>Handoff log</h3>{selectedMessages.length === 0 ? <p className="muted">No handoffs recorded yet.</p> : selectedMessages.map((item) => <article key={item.id}><div><strong>{roleLabel(item.from)} → {roleLabel(item.to)}</strong><small>{timeLabel(item.createdAt)} · {item.kind}</small></div><p>{item.body}</p></article>)}</div>
      </section> : null}
    </section>
  );
}
