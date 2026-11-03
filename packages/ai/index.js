/**
 * Read one area. `read` is the port the shell uses to supply the knowledge file
 * for that id. The id is not a heading, so the result is the whole file.
 */
export function areaRead(areaId, read) {
  return read(areaId);
}
