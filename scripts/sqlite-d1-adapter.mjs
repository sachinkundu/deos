export class SqliteD1PreparedStatement {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new SqliteD1PreparedStatement(this.database, this.sql, values);
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.values) ?? null;
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return { success: true, results: [], meta: { changes: Number(result.changes) } };
  }
}

export class SqliteD1Database {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new SqliteD1PreparedStatement(this.database, sql);
  }

  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (primary) {
      try {
        this.database.exec("ROLLBACK");
      } catch (cleanup) {
        const error = primary instanceof Error ? primary : new Error(String(primary));
        throw new Error(error.message, {
          cause: new AggregateError([error, cleanup], "SQLite D1 rollback also failed"),
        });
      }
      throw primary;
    }
  }
}
