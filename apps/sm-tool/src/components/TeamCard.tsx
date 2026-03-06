import { type SleValues } from "../types/contracts";

interface TeamCardProps {
  teamName: string;
  teamId: string;
  doneCount: number;
  avgCycleTime: number | null;
  sle: SleValues;
  multiSprintPercentage: number;
  velocity: number;
  monthLabel: string;
}

export function TeamCard(props: TeamCardProps): JSX.Element {
  return (
    <article className="panel card">
      <div className="card-title-row">
        <h3>{props.teamName}</h3>
        <span className="badge">{props.teamId}</span>
      </div>
      <div className="metric-row">
        <span>Done ({props.monthLabel})</span>
        <strong>{props.doneCount}</strong>
      </div>
      <div className="metric-row">
        <span>Avg cycle time</span>
        <strong>{formatNullable(props.avgCycleTime)}</strong>
      </div>
      <div className="metric-row sle-row">
        <span>SLE (P50/P70/P85/P95)</span>
        <strong>
          {formatNullable(props.sle.p50)} / {formatNullable(props.sle.p70)} / {formatNullable(props.sle.p85)} / {formatNullable(props.sle.p95)}
        </strong>
      </div>
      <div className="metric-row">
        <span>2+ sprint %</span>
        <strong>{props.multiSprintPercentage.toFixed(1)}%</strong>
      </div>
      <div className="metric-row">
        <span>Velocity ({props.monthLabel})</span>
        <strong>{props.velocity.toFixed(2)}</strong>
      </div>
    </article>
  );
}

function formatNullable(value: number | null): string {
  if (value === null) {
    return "n/a";
  }
  return value.toFixed(2);
}
