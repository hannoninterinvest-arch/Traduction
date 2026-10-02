declare module 'franc-min' {
  export function franc(text: string, options?: { minLength?: number; only?: string[] }): string;
}
