/**
 * Close contest job — runs at closesAt time.
 * Transitions contest from active → closed, then starts resolution polling.
 */

import { type Job } from "bullmq";
import {
  transitionContest,
  voidContest,
  getContest,
} from "../services/contest-manager";

export interface CloseContestData {
  contestId: string;
}

export async function processCloseContest(job: Job<CloseContestData>) {
  const { contestId } = job.data;

  const contest = await getContest(contestId);
  if (!contest || contest.status !== "active") return;

  // If min entries not met, void the contest
  if (contest.totalEntries < contest.minEntries) {
    await voidContest(contestId);
    return;
  }

  // Transition to closed
  await transitionContest(contestId, "closed");

}
