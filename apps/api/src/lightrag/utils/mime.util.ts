import { extension } from 'mime-types';

export const extensionFromMimeType = (mimeType: string | undefined | null): string | null => {
  if (!mimeType) return null;
  const result = extension(mimeType);
  if (!result) return null;
  return `.${result}`;
};
