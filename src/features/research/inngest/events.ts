export const RESEARCH_EVENTS = {
  START: "research/start",
  CANCEL: "research/cancel",
  INNER_LOOP_TICK: "research/inner-loop-tick",
  OUTER_LOOP_TICK: "research/outer-loop-tick",
  FINALIZE: "research/finalize",
  DIRECTION_OVERRIDE: "research/direction-override",
} as const;

export const MAX_INNER_LOOPS = 20;
export const MAX_OUTER_LOOPS = 5;
export const OUTER_LOOP_INTERVAL = 3; // Run outer loop every N inner loops
