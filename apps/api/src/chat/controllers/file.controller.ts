import {
  Controller,
  Post,
  Body,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AuthGuard, Session, UserSession } from '@mguay/nestjs-better-auth';
import { FileDocumentService } from '../services/file-document.service';
import { UploadFilesDto, FileUploadResponse } from '../dto/file-upload.dto';

@Controller('files')
@UseGuards(AuthGuard)
export class FileController {
  constructor(private readonly fileDocumentService: FileDocumentService) {}

  @Post('upload')
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadFiles(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() uploadDto: UploadFilesDto,
    @Session() session: UserSession,
  ): Promise<FileUploadResponse> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    if (!uploadDto.chatId) {
      throw new BadRequestException('Chat ID is required');
    }

    const uploadedFiles = await this.fileDocumentService.createMultipleFileDocuments({
      chatId: uploadDto.chatId,
      files,
      extractText: uploadDto.extractText,
      userId: session.user.id,
    });

    return {
      files: uploadedFiles,
    };
  }
}
