// Quest videos play one after another, as classic stacks each video window, and a failed play releases the next.
/** @param {(name: string) => Promise<unknown>} play */
export function makeVideoQueue(play) {
  let chain = Promise.resolve();
  let depth = 0;
  const queue = (name) => {
    depth++;
    const turn = chain.then(() => play(name)).catch(() => undefined).finally(() => { depth--; });
    chain = turn;
    return turn;
  };
  queue.pending = () => depth;
  return queue;
}
