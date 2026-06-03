import { describe, it, expect } from "vitest";
import { splitSqlStatements } from "./migrate";

describe("splitSqlStatements", () => {
  it("splits multiple statements on semicolons", () => {
    const sql = "CREATE TABLE a (id INT);\nCREATE TABLE b (id INT);";
    expect(splitSqlStatements(sql)).toEqual([
      "CREATE TABLE a (id INT)",
      "CREATE TABLE b (id INT)",
    ]);
  });

  it("ignores trailing whitespace and empty statements", () => {
    const sql = "SELECT 1;\n\n   ;\nSELECT 2;\n";
    expect(splitSqlStatements(sql)).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("strips full-line SQL comments", () => {
    const sql = "-- create users\nCREATE TABLE users (id INT);\n-- done";
    expect(splitSqlStatements(sql)).toEqual(["CREATE TABLE users (id INT)"]);
  });

  it("returns an empty array for an empty or comment-only file", () => {
    expect(splitSqlStatements("")).toEqual([]);
    expect(splitSqlStatements("-- just a comment\n")).toEqual([]);
  });
});
