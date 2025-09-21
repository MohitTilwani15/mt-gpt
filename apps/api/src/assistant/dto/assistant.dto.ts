import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

export class AssistantCapabilitiesDto {
  @IsOptional()
  @IsBoolean()
  webSearch?: boolean;

  @IsOptional()
  @IsBoolean()
  imageGeneration?: boolean;
}

export class CreateAssistantDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsString()
  defaultModel?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AssistantCapabilitiesDto)
  capabilities?: AssistantCapabilitiesDto;
}

export class UpdateAssistantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  instructions?: string;

  @IsOptional()
  @IsString()
  defaultModel?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AssistantCapabilitiesDto)
  capabilities?: AssistantCapabilitiesDto;
}

export class ShareAssistantDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsBoolean()
  canManage?: boolean;
}

export class AssistantIdParamDto {
  @IsUUID()
  id: string;
}

export class AssistantShareParamDto {
  @IsUUID()
  assistantId: string;

  @IsString()
  userId: string;
}

export class UploadAssistantKnowledgeDto {
  @IsOptional()
  @IsBoolean()
  extractText?: boolean;
}
