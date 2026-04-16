export function log(message, extra = undefined) {
  const prefix = `[${new Date().toISOString()}]`;
  if (extra === undefined) {
    console.log(prefix, message);
    return;
  }
  console.log(prefix, message, extra);
}

export function errorLog(message, extra = undefined) {
  const prefix = `[${new Date().toISOString()}]`;
  if (extra === undefined) {
    console.error(prefix, message);
    return;
  }
  console.error(prefix, message, extra);
}
