import { openai } from '@ai-sdk/openai';
import { Controller, Post, Res, Body } from '@nestjs/common';
import { streamText } from 'ai';
import type { Response } from 'express';

interface ChatRequest {
  prompt: string;
  model?: string;
}

@Controller()
export class AppController {
  @Post('/')
  root(@Res() res: Response, @Body() body: ChatRequest) {
    const result = streamText({
      model: openai(body.model || 'gpt-4o'),
      prompt: body.prompt,
    });

    result.pipeUIMessageStreamToResponse(res);
  }

  @Post('/stream-data')
  streamData(@Res() res: Response, @Body() body: ChatRequest) {
    const result = streamText({
      model: openai(body.model || 'gpt-4o'),
      prompt: body.prompt,
    });

    result.pipeUIMessageStreamToResponse(res, {
      onError: (error) => {
        // Error messages are masked by default for security reasons.
        // If you want to expose the error message to the client, you can do so here:
        return error instanceof Error ? error.message : String(error);
      },
    });
  }

  @Post('/text-stream-example')
  example(@Res() res: Response, @Body() body: ChatRequest) {
    const result = streamText({
      model: openai(body.model || 'gpt-4o'),
      prompt: body.prompt,
    });

    result.pipeTextStreamToResponse(res);
  }
}
