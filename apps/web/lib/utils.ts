export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const SUPPORTED_FILE_TYPES = ['.pdf', '.doc', '.docx', '.txt', '.csv'];

export const MAX_FILE_SIZE = 10 * 1024 * 1024;

export const MAX_FILES_PER_UPLOAD = 10;