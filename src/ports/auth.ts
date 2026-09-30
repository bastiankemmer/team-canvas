/** Login protocol: whether a request/session may use the host UI and APIs. */
export type AuthRequest = {
  headers?: Record<string, string | string[] | undefined>
}

export type Auth = {
  allow(request: AuthRequest): boolean | Promise<boolean>
}
