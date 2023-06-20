export type Target = { hostname: string, port: number };
export type Proxy = Target & { ssl?: boolean, authorization?: string, type: 'http' | 'scifin' };
export type PrintOptions = { level?: number, wid?: number|boolean|string, lenient?: boolean };