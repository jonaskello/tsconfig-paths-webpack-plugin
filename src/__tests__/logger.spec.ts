import { makeLogger } from "../logger";
import * as chalk from "chalk";
import { mockProcessStdout, mockProcessStderr } from "jest-mock-process";

// jest.mock("Console", () => {
//   return jest.fn();
// });

describe(`Logger`, () => {
  const mockStdout = mockProcessStdout();
  const mockStderr = mockProcessStderr();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test(`Can create a logger instance to process.stdout`, () => {
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
      new chalk.Instance()
    );
    expect(result).toBeDefined();

    result.logInfo(`Test logInfo`);
    result.logWarning(`Test logWarning`);
    result.logError(`Test logError`);
    result.log(`Test external logger`);

    expect(mockStdout).toHaveBeenCalledTimes(2);
    expect(mockStderr).toHaveBeenCalledTimes(2);
  });

  test(`Can create a logger instance to process.stderr`, () => {
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
      new chalk.Instance()
    );
    expect(result).toBeDefined();

    result.log(`Test external logger`);

    expect(mockStderr).toHaveBeenCalledTimes(1);
    expect(mockStdout).not.toHaveBeenCalled();
  });
});
