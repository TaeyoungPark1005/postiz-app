import {
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export const normalizeBcp47Language = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  try {
    return Intl.getCanonicalLocales(value.trim())[0] || null;
  } catch {
    return null;
  }
};

@ValidatorConstraint({ name: 'isBcp47Language', async: false })
export class IsBcp47LanguageConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown) {
    return normalizeBcp47Language(value) !== null;
  }

  defaultMessage() {
    return 'Caption language must be a valid BCP-47 tag';
  }
}

const normalizedAllowedCaptionPrefixes = (): URL[] => {
  const frontend = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const bucket = (process.env.CLOUDFLARE_BUCKET_URL || '').replace(/\/$/, '');

  return [frontend ? `${frontend}/uploads/` : '', bucket ? `${bucket}/` : '']
    .filter(Boolean)
    .flatMap((value) => {
      try {
        return [new URL(value)];
      } catch {
        return [];
      }
    });
};

export const isTrustedCaptionPath = (value: unknown): boolean => {
  if (typeof value !== 'string') {
    return false;
  }

  let candidate: URL;
  try {
    candidate = new URL(value);
  } catch {
    return false;
  }

  if (
    !['http:', 'https:'].includes(candidate.protocol) ||
    candidate.username ||
    candidate.password ||
    !/\.srt$/i.test(candidate.pathname)
  ) {
    return false;
  }

  return normalizedAllowedCaptionPrefixes().some(
    (prefix) =>
      candidate.origin === prefix.origin &&
      candidate.pathname.startsWith(prefix.pathname)
  );
};

@ValidatorConstraint({ name: 'isTrustedCaptionPath', async: false })
export class IsTrustedCaptionPathConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown) {
    return isTrustedCaptionPath(value);
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} must be a Postiz-managed SRT upload path`;
  }
}
