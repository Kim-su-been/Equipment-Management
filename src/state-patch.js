const collections = ["people", "messages", "notifications", "customTasks"];
export function entityState(data) {
  const result = { settings: data.settings || {} };
  for (const key of collections)
    result[key] = Object.fromEntries(
      (data[key] || []).map((item) => [String(item.id), item]),
    );
  return result;
}
export function statePatch(before, after) {
  const ops = [];
  function diff(a, b, path = []) {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (
      a &&
      b &&
      typeof a === "object" &&
      typeof b === "object" &&
      !Array.isArray(a) &&
      !Array.isArray(b)
    ) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)]))
        diff(a[key], b[key], [...path, key]);
      return;
    }
    ops.push({
      path,
      hadOld: a !== undefined,
      oldValue: a === undefined ? null : a,
      remove: b === undefined,
      value: b === undefined ? null : b,
    });
  }
  diff(entityState(before), entityState(after));
  return ops;
}
export function readPath(root, path) {
  let value = root;
  for (const key of path) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key))
      return undefined;
    value = value[key];
  }
  return value;
}
export function writePath(root, path, value, remove = false) {
  let current = root;
  for (const key of path.slice(0, -1)) {
    if (!current[key] || typeof current[key] !== "object") current[key] = {};
    current = current[key];
  }
  if (remove) delete current[path.at(-1)];
  else current[path.at(-1)] = value;
}
export function restoreState(entities, original) {
  return {
    ...original,
    settings: entities.settings,
    ...Object.fromEntries(
      collections.map((key) => [key, Object.values(entities[key])]),
    ),
  };
}
