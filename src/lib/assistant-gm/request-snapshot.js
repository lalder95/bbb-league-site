export function createRequestSnapshotProvider(loadSnapshot) {
  let snapshotPromise = null;

  return function getRequestSnapshot() {
    if (!snapshotPromise) {
      snapshotPromise = Promise.resolve().then(loadSnapshot);
    }
    return snapshotPromise;
  };
}
