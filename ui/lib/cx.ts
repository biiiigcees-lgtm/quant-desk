type ClassToken = string | false | null | undefined;

export function cx(...tokens: ClassToken[]): string {
  return tokens.filter(Boolean).join(' ');
}
