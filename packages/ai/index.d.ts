export function areaRead(
  areaId: string,
  read: (areaId: string) => string | Promise<string>,
): string | Promise<string>;
