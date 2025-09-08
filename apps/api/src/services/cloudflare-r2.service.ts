import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import path from 'path';

export interface FileUploadParams {
  file: Express.Multer.File;
  key?: string;
  contentType?: string;
}

export interface FileDownloadParams {
  key: string;
  expiresIn?: number;
  asAttachmentName?: string;
}

@Injectable()
export class CloudflareR2Service {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;

  constructor(private readonly configService: ConfigService) {
    this.s3Client = new S3Client({
      region: 'auto',
      forcePathStyle: true,
      endpoint: this.configService.getOrThrow<string>('CLOUDFLARE_R2_ENDPOINT'),
      credentials: {
        accessKeyId: this.configService.getOrThrow<string>('CLOUDFLARE_R2_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.getOrThrow<string>('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
      },
    });

    this.bucketName = this.configService.getOrThrow<string>('CLOUDFLARE_R2_BUCKET_NAME');
  }

  private safeKey(original?: string) {
    if (!original) return randomUUID();
    const ext = path.extname(original).slice(0, 16);
    return `${randomUUID()}${ext || ''}`;
  }

  async uploadFile(params: FileUploadParams): Promise<{ key: string; url: string }> {
    const { file, key, contentType } = params;
    const fileKey = key ?? this.safeKey(file.originalname);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fileKey,
      Body: file.buffer,
      ContentType: contentType || file.mimetype,
    });

    await this.s3Client.send(command);

    const url = await this.getDownloadUrl({ key: fileKey });

    return { key: fileKey, url };
  }

  async uploadMultipleFiles(files: Express.Multer.File[]): Promise<Array<{ key: string; url: string }>> {
    return Promise.all(files.map((f) => this.uploadFile({ file: f })));
  }

  async getDownloadUrl(params: FileDownloadParams): Promise<string> {
    const { key, expiresIn = 3600, asAttachmentName } = params;
    const command = new GetObjectCommand({ Bucket: this.bucketName, Key: key });
    const url = await getSignedUrl(this.s3Client, command, { expiresIn });

    if (!asAttachmentName) return url;

    const u = new URL(url);
    u.searchParams.set('response-content-disposition', `attachment; filename="${asAttachmentName}"`);
    return u.toString();
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.s3Client.send(command);
  }

  async deleteMultipleFiles(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    // Bulk delete (up to 1000 per call)
    const chunks = (arr: string[], size = 1000) => arr.reduce<string[][]>((a, _, i) => (i % size ? a : [...a, arr.slice(i, i + size)]), []);
    for (const batch of chunks(keys)) {
      await this.s3Client.send(new DeleteObjectsCommand({
        Bucket: this.bucketName,
        Delete: { Objects: batch.map(Key => ({ Key })) },
      }));
    }
  }
}
