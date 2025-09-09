import { UIMessagePart } from 'ai'
import type { MyDBUIMessagePart, MyDBUIMessagePartSelect } from "../database/schemas/conversation.schema";

export const mapUIMessagePartsToDBParts = (
  messageParts: UIMessagePart<any, any>[],
  messageId: string,
): MyDBUIMessagePart[] => {
  return messageParts.map((part, index) => {
    switch (part.type) {
      case "text":
        return {
          messageId,
          order: index,
          type: part.type,
          text_text: part.text,
          providerMetadata: part.providerMetadata,
        };
      case "reasoning":
        return {
          messageId,
          order: index,
          type: part.type,
          reasoning_text: part.text,
          providerMetadata: part.providerMetadata,
        };
      case "file":
        return {
          messageId,
          order: index,
          type: part.type,
          file_mediaType: part.mediaType,
          file_filename: part.filename,
          file_url: part.url,
        };
      case "source-document":
        return {
          messageId,
          order: index,
          type: part.type,
          source_document_sourceId: part.sourceId,
          source_document_mediaType: part.mediaType,
          source_document_title: part.title,
          source_document_filename: part.filename,
          providerMetadata: part.providerMetadata,
        };
      case "source-url":
        return {
          messageId,
          order: index,
          type: part.type,
          source_url_sourceId: part.sourceId,
          source_url_url: part.url,
          source_url_title: part.title,
          providerMetadata: part.providerMetadata,
        };
      case "step-start":
        return {
          messageId,
          order: index,
          type: part.type,
        };
      default:
        throw new Error(`Unsupported part type: ${JSON.stringify(part)}`);
    }
  });
};

export const mapDBPartToUIMessagePart = (
  part: MyDBUIMessagePartSelect,
): UIMessagePart<any, any> => {
  switch (part.type) {
    case "text":
      return {
        type: part.type,
        text: part.text_text!,
        providerMetadata: part.providerMetadata ?? undefined,
      };
    case "reasoning":
      return {
        type: part.type,
        text: part.reasoning_text!,
        providerMetadata: part.providerMetadata ?? undefined,
      };
    case "file":
      return {
        type: part.type,
        mediaType: part.file_mediaType!,
        filename: part.file_filename ?? undefined,
        url: part.file_url!,
      };
    case "source-document":
      return {
        type: part.type,
        sourceId: part.source_document_sourceId!,
        mediaType: part.source_document_mediaType!,
        title: part.source_document_title!,
        filename: part.source_document_filename ?? undefined,
        providerMetadata: part.providerMetadata ?? undefined,
      };
    case "source-url":
      return {
        type: part.type,
        sourceId: part.source_url_sourceId!,
        url: part.source_url_url!,
        title: part.source_url_title!,
        providerMetadata: part.providerMetadata ?? undefined,
      };
    case "step-start":
      return { type: part.type };
    default:
      throw new Error(`Unsupported part type: ${part.type}`);
  }
};