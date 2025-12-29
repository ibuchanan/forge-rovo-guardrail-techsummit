import { myself } from "../confluence/myself";
import type { RovoContext } from "../rovo/action";
import type { CommonEvent } from "./events";

interface Assessment {
  scores: Record<string, number>;
}

export interface LogAssessmentPayload extends CommonEvent {
  assessment: string;
  context: RovoContext;
}

export async function logAssessment(e: LogAssessmentPayload) {
  console.debug(`assessment: ${JSON.stringify(e)}`);
  const me = await myself(e, {});
  if (typeof me === "string") {
    return me;
  }
  const assessment = JSON.parse(e.assessment) as Assessment | undefined;
  if (assessment === undefined) {
    return `Could not find an Assessment in ${e}`;
  }
  if (assessment.scores === undefined) {
    return `Could not find an scores in ${e}`;
  }
  const totalScope: number = Object.values(assessment.scores).reduce(
    (accumulator: number, currentScore: number) => {
      return accumulator + currentScore;
    },
    0,
  );
  console.log(`[${me.displayName}](${me.email}): ${totalScope}`);
  return `[${me.displayName}](${me.email}): ${totalScope}`;
}

export function truncateEvents(obj: any): any {
  if (typeof obj !== "object" || obj === null) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(truncateEvents);
  }
  const newObj: any = {};
  for (const key in obj) {
    if (key === "contextToken") {
      const token: string = obj[key];
      newObj[key] = `${token.slice(0, 3)}...${token.slice(-3)}`;
    } else if (key === "headers") {
      newObj[key] = { "...": "..." };
    } else {
      newObj[key] = truncateEvents(obj[key]);
    }
  }
  return newObj;
}
