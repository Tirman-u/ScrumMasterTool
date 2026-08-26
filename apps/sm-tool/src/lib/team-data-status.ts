import type { ImportFileInfo } from "../types/contracts";

export interface TeamDataStatusSnapshot {
  latestDataUpdate: string | null;
  lastCalculated: string | null;
  stale: boolean;
}

export function buildTeamDataStatus(
  importFiles: Pick<ImportFileInfo, "updatedAt">[],
  generatedAt: string | null | undefined,
): TeamDataStatusSnapshot {
  const validUpdates = importFiles
    .map((file) => file.updatedAt)
    .filter((value): value is string => Boolean(value) && Number.isFinite(Date.parse(value)));
  const latestDataUpdate = validUpdates.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
  const lastCalculated = generatedAt && Number.isFinite(Date.parse(generatedAt)) ? generatedAt : null;
  return {
    latestDataUpdate,
    lastCalculated,
    stale: latestDataUpdate !== null && lastCalculated !== null && Date.parse(latestDataUpdate) > Date.parse(lastCalculated),
  };
}
