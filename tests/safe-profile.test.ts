import { describe, expect, it } from "vitest";
import {
  SAFE_ENTITY_LABELS,
  buildSafeConfigForEntityType,
  getSafeMetricDefinitions,
  normalizeSafeConfig,
  normalizeSafeMetricIds,
} from "../apps/sm-tool/src/lib/safe";

describe("SAFe profile helpers", () => {
  it("defaults missing config to disabled Agile Team profile", () => {
    const config = normalizeSafeConfig(undefined);

    expect(config.enabled).toBe(false);
    expect(config.entityType).toBe("team");
    expect(config.metricIds).toEqual([
      "flow-time",
      "flow-velocity",
      "flow-load",
      "flow-efficiency",
      "flow-predictability",
      "flow-distribution",
      "built-in-quality",
      "competency-assessment",
    ]);
    expect(SAFE_ENTITY_LABELS[config.entityType]).toBe("Agile Team");
  });

  it("applies development value stream recommendations when entity type changes", () => {
    const config = buildSafeConfigForEntityType("development-value-stream", {
      enabled: true,
      entityType: "team",
      metricIds: ["flow-time"],
    });

    expect(config.enabled).toBe(true);
    expect(config.entityType).toBe("development-value-stream");
    expect(config.metricIds).toEqual([
      "business-outcomes",
      "flow-time",
      "flow-velocity",
      "flow-load",
      "flow-efficiency",
      "flow-predictability",
      "flow-distribution",
      "art-predictability",
      "competency-assessment",
      "employee-engagement",
    ]);
  });

  it("filters duplicate or unknown metric ids and falls back to entity defaults", () => {
    expect(
      normalizeSafeMetricIds(
        [
          "flow-time",
          "flow-time",
          "flow-load",
          "not-real" as never,
        ],
        "team",
      ),
    ).toEqual(["flow-time", "flow-load"]);

    expect(normalizeSafeMetricIds([], "portfolio")).toEqual([
      "business-outcomes",
      "flow-time",
      "flow-velocity",
      "flow-load",
      "flow-efficiency",
      "flow-predictability",
      "art-predictability",
      "competency-assessment",
      "employee-engagement",
    ]);
  });

  it("returns metric metadata with tool support hints", () => {
    const metrics = getSafeMetricDefinitions({
      enabled: true,
      entityType: "agile-release-train",
      metricIds: ["flow-efficiency", "art-predictability"],
    });

    expect(metrics).toHaveLength(2);
    expect(metrics[0]).toMatchObject({
      id: "flow-efficiency",
      domain: "Flow",
      support: "supported",
    });
    expect(metrics[1]).toMatchObject({
      id: "art-predictability",
      domain: "Outcomes",
      support: "external",
    });
  });
});
