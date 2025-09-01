import { mysql } from '@trp/db';
const { mysqlTable, int, varchar, timestamp, boolean, index, uniqueIndex } =
  mysql;

export const players = mysqlTable(
  'players',
  {
    id: int('id').primaryKey().notNull(),
    createdAt: timestamp('created_at').notNull(),
    lastSeen: timestamp('last_seen'),
    name: varchar('name', { length: 64 }),
    isBanned: boolean('is_banned').notNull().default(false)
  },
  t => ({
    idxLastSeen: index('i_players_last_seen').on(t.lastSeen),
    uName: uniqueIndex('u_players_name').on(t.name)
  })
);

const tables = { players } as const;
export default tables;
