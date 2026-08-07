export interface ExecutiveFlowStageLike {
  name: string;
  days: number;
  type: "active" | "queue";
}

export interface ExecutiveFlowSummary {
  queueDays: number;
  activeDays: number;
  totalDays: number;
  flowEfficiencyPct: number | null;
  biggestQueueName: string | null;
  biggestQueueDays: number | null;
}

/**
 * Single source of truth for flow summary values shown in Team and Scrum Master views.
 * Both views must consume this result instead of recalculating queue/active metrics independently.
 */
export function buildExecutiveFlowSummary(stages: ExecutiveFlowStageLike[]): ExecutiveFlowSummary {
  let queueDays = 0;
  let activeDays = 0;
  let biggestQueueName: string | null = null;
  let biggestQueueDays: number | null = null;

  for (const stage of stages) {
    if (!Number.isFinite(stage.days) || stage.days < 0) {
      continue;
    }

    if (stage.type === "queue") {
      queueDays += stage.days;
      if (biggestQueueDays === null || stage.days > biggestQueueDays) {
        biggestQueueDays = stage.days;
        biggestQueueName = stage.name;
      }
    } else {
      activeDays += stage.days;
    }
  }

  const totalDays = queueDays + activeDays;
  const flowEfficiencyPct = totalDays > 0 ? (activeDays / totalDays) * 100 : null;

  return {
    queueDays,
    activeDays,
    totalDays,
    flowEfficiencyPct,
    biggestQueueName,
    biggestQueueDays,
  };
}
