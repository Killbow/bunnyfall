export function createTransitionGate() {
  let gen = 0;
  let inFlight = null;
  return {
    async begin() {
      const token = gen;
      while (inFlight) await inFlight.promise;
      if (token !== gen) return null;
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      inFlight = { promise, resolve };
      return token;
    },
    valid(token) { return token === gen; },
    abort() { gen++; },
    end() {
      const held = inFlight;
      inFlight = null;
      held?.resolve();
    },
    async run(build) {
      const token = await this.begin();
      if (token == null) return false;
      try {
        const published = await build(() => this.valid(token));
        if (published) gen++;
        return published;
      } finally {
        this.end();
      }
    },
    async settled() {
      while (inFlight) await inFlight.promise;
    },
  };
}
