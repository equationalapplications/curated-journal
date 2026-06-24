export function yieldToUI(): Promise<void> {
  return new Promise((resolve) => {
    setImmediate(() => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve());
      } else {
        resolve();
      }
    });
  });
}
