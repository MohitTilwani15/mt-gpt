import { Injectable, Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DATABASE_CONNECTION } from '../database-connection';
import { databaseSchema } from '../schemas';

@Injectable()
export class UserQueryService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: NodePgDatabase<typeof databaseSchema>,
  ) {}

  async findById(userId: string) {
    return this.db.query.user.findFirst({
      where: eq(databaseSchema.user.id, userId),
    });
  }

  async findByEmail(email: string) {
    return this.db.query.user.findFirst({
      where: eq(databaseSchema.user.email, email),
    });
  }
}
