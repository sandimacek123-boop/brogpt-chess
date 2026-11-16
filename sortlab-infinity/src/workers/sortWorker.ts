/// <reference lib="webworker" />
import { executeSort, RunRequest } from '../core/execute';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (e: MessageEvent<{ type: 'run'; req: RunRequest }>) => {
  if (e.data?.type !== 'run') return;
  const result = executeSort(e.data.req);
  scope.postMessage({ type: 'result', result }, [result.trace.buffer, result.final.buffer]);
};
