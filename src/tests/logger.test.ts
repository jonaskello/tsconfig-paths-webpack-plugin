import { test, describe, afterEach, beforeEach, mock } from "node:test";
import assert from "node:assert";
import { Chalk } from "chalk";
import { makeLogger } from "../logger.ts";

// Mock process.stdout and process.stderr
const originalStdoutWrite = process.stdout.write;
const originalStderrWrite = process.stderr.write;

describe("Logger", () => {
  let mockStdout: ReturnType<typeof mock.fn>;
  let mockStderr: ReturnType<typeof mock.fn>;

  beforeEach(() => {
    mockStdout = mock.fn();
    mockStderr = mock.fn();
    process.stdout.write = mockStdout as unknown as typeof process.stdout.write;
    process.stderr.write = mockStderr as unknown as typeof process.stderr.write;
  });

  test("Can create a logger instance to process.stdout", () => {
    const result = makeLogger(
      {
        baseUrl: undefined,
        colors: false,
        configFile: "",
        context: undefined,
        extensions: [],
        logInfoToStdOut: true,
        logLevel: "INFO",
        mainFields: [],
        silent: false,
        references: undefined,
      },
      new Chalk({ level: 0 })
    );
    assert.ok(result);

    result.logInfo(`Test logInfo`);
    result.logWarning(`Test logWarning`);
    result.logError(`Test logError`);
    result.log(`Test external logger`);

    assert.strictEqual(mockStdout.mock.calls.length, 2);
    assert.strictEqual(mockStderr.mock.calls.length, 2);
  });

  test("Can create a logger instance to process.stderr", () => {
    const result = makeLogger(
      {
        baseUrl: undefined,
        colors: false,
        configFile: "",
        context: undefined,
        extensions: [],
        logInfoToStdOut: false,
        logLevel: "INFO",
        mainFields: [],
        silent: false,
        references: undefined,
      },
      new Chalk({ level: 0 })
    );
    assert.ok(result);

    result.log(`Test external logger`);

    assert.strictEqual(mockStderr.mock.calls.length, 1);
    assert.strictEqual(mockStdout.mock.calls.length, 0);
  });

  // Restore original methods after all tests
  afterEach(() => {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  });
});