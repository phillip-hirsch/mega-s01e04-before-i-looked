// Plan morning-digest § 1. The contract every part of § 2 builds against.
// The implementation lives in `src/digest/read.ts` and exports `readNight: ReadNight`.

export type RunStatus = 'ok' | 'retry' | 'fail';

/** One line of `runs/<night>.jsonl`, after parsing. */
export type RunLine = {
  at: string; // ISO 8601 with the log's own offset; never converted to UTC
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

/** One row per job for a night. */
export type DigestRow = {
  job: string;
  owner: string | null; // views show `null` as `—`
  runs: number; // lines for this job, any status
  retries: number; // lines with status `retry`
  lastStatus: RunStatus;
  lastError: string | null; // `error` of the last line that had one
  firstAt: string; // `at` of the first line, as written in the log
  lastAt: string; // `at` of the last line, as written in the log
};

export type Night = {
  night: string; // YYYY-MM-DD, the file name without `.jsonl`
  rows: DigestRow[]; // sorted by job
  counts: Record<RunStatus, number>; // lines per status, across all jobs
  badLines: number; // lines that did not parse; counted, never thrown
};

/** `null` when `runs/<night>.jsonl` does not exist. An empty file gives `rows: []`. */
export type ReadNight = (runsDir: string, night: string) => Night | null;
