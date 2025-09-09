import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UploadFilesDto {
  @IsString()
  chatId: string;

  @IsOptional()
  @IsString()
  messageId?: string;

  @IsOptional()
  @IsBoolean()
  extractText?: boolean = false;
}

export class FileUploadResponse {
  files: Array<{
    id: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    downloadUrl: string;
  }>;
}