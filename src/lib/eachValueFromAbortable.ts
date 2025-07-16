import { Observable, merge, interval, map } from "rxjs";
import { eachValueFrom } from "rxjs-for-await";

export async function* eachValueFromAbortable<O extends Observable<any>>(
  observable: O,
  signal?: AbortSignal
): AsyncIterable<O extends Observable<infer D> ? D : never> {
  const pingObject = {};

  const abortableObserver = merge(
    observable,
    interval(5_000).pipe(map(() => pingObject))
  );

  for await (const value of eachValueFrom(abortableObserver as O)) {
    if (signal?.aborted) break;

    if (value === pingObject) continue;

    yield value;
  }
}