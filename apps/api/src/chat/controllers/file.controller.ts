import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Body,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  ParseUUIDPipe,
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
      messageId: uploadDto.messageId,
      files,
      extractText: uploadDto.extractText,
      userId: session.user.id,
    });

    return {
      files: uploadedFiles.map(file => ({
        id: file.id,
        fileName: file.fileName,
        fileSize: file.fileSize,
        mimeType: file.mimeType,
        downloadUrl: file.downloadUrl,
      })),
      message: `${files.length} file(s) uploaded successfully`,
    };
  }

  @Get('download/:documentId')
  async getDownloadUrl(
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Query('expiresIn') expiresIn?: number,
  ) {
    const downloadUrl = await this.fileDocumentService.getDownloadUrl({
      documentId,
      expiresIn: expiresIn ? parseInt(expiresIn.toString()) : undefined,
    });

    return { downloadUrl };
  }

  @Get('message/:messageId')
  async getDocumentsByMessage(
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ) {
    const documents = await this.fileDocumentService.getDocumentsByMessageId(messageId);
    return { documents };
  }

  @Get('message/:messageId/content/:documentId')
  async getDocumentContent(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    const document = await this.fileDocumentService.getDocumentContent(documentId);
    return { document };
  }

  @Get('chat/:chatId')
  async getDocumentsByChat(
    @Param('chatId', ParseUUIDPipe) chatId: string,
  ) {
    const documents = await this.fileDocumentService.getDocumentsByChatId(chatId);
    return { documents };
  }

  @Delete(':documentId')
  async deleteDocument(@Param('documentId', ParseUUIDPipe) documentId: string) {
    return this.fileDocumentService.deleteDocument(documentId);
  }

  @Delete('chat/:chatId')
  async deleteDocumentsByChat(@Param('chatId', ParseUUIDPipe) chatId: string) {
    return this.fileDocumentService.deleteDocumentsByChatId(chatId);
  }
}