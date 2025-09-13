import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import MemoryClient from "mem0ai";
import type { Memory } from 'mem0ai';

export interface Mem0CreateMemoryParams {
  userId: string;
  chatId?: string;
  messageId?: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  metadata?: Record<string, any>;
}

export interface Mem0SearchMemoryParams {
  userId: string;
  query: string;
  limit?: number;
}

export interface Mem0Memory {
  id: string;
  memory: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class Mem0MemoryService {
  private memory: MemoryClient;

  constructor(private readonly configService: ConfigService) {
    this.memory = new MemoryClient({
      apiKey: configService.getOrThrow<string>('MEM0_API_KEY'),
    });
  }

  async addMemory(params: Mem0CreateMemoryParams): Promise<Memory[]> {
    const { userId, chatId, messageId, messages, metadata = {} } = params;

    const enhancedMetadata = {
      ...metadata,
      chatId,
      messageId,
      userId,
    };

    try {
      const result = await this.memory.add(messages, {
        user_id: userId,
        metadata: enhancedMetadata,
      });

      return result;
    } catch (error) {
      console.error('Error adding memory to Mem0:', error);
      throw new Error('Failed to add memory');
    }
  }

  async searchMemories(params: Mem0SearchMemoryParams): Promise<Memory[]> {
    const { userId, query, limit = 5 } = params;

    try {
      const results = await this.memory.search(query, {
        user_id: userId,
        limit,
      });

      return results;
    } catch (error) {
      console.error('Error searching memories in Mem0:', error);
      throw new Error('Failed to search memories');
    }
  }

  async getAllMemories(userId: string): Promise<Memory[]> {
    try {
      const memories = await this.memory.getAll({ user_id: userId });
      return memories;
    } catch (error) {
      console.error('Error getting all memories from Mem0:', error);
      throw new Error('Failed to get memories');
    }
  }

  async getMemory(memoryId: string): Promise<Memory | null> {
    try {
      const memory = await this.memory.get(memoryId);
      return memory;
    } catch (error) {
      console.error('Error getting memory from Mem0:', error);
      return null;
    }
  }

  async updateMemory(memoryId: string, content: string): Promise<Memory[]> {
    try {
      const result = await this.memory.update(memoryId, { text: content });
      return result;
    } catch (error) {
      console.error('Error updating memory in Mem0:', error);
      throw new Error('Failed to update memory');
    }
  }

  async deleteMemory(memoryId: string): Promise<void> {
    try {
      await this.memory.delete(memoryId);
    } catch (error) {
      console.error('Error deleting memory from Mem0:', error);
      throw new Error('Failed to delete memory');
    }
  }

  async deleteAllMemories(userId: string): Promise<void> {
    try {
      await this.memory.deleteAll({ user_id: userId });
    } catch (error) {
      console.error('Error deleting all memories from Mem0:', error);
      throw new Error('Failed to delete all memories');
    }
  }

  async getMemoryContext(userId: string, query: string, limit: number = 5): Promise<string> {
    try {
      const memories = await this.searchMemories({ userId, query, limit });
      
      if (memories.length === 0) {
        return '';
      }

      const contextItems = memories
        .map((memory) => `- ${memory.memory}`)
        .join('\n');

      return `\n\nLong-term memory (relevant):\n${contextItems}\n\nUse these only if helpful and relevant. Do not hallucinate.`;
    } catch (error) {
      console.error('Error getting memory context from Mem0:', error);
      return '';
    }
  }
}
