import { Console } from "node:console";
import type { ChalkInstance } from "chalk";
import type { Options } from "./options.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InternalLoggerFunc = (whereToLog: any, message: string) => void;

export type LoggerFunc = (message: string) => void;

export interface Logger {
  log: LoggerFunc;
  logInfo: LoggerFunc;
  logWarning: LoggerFunc;
  logError: LoggerFunc;
}

const LogLevel = {
  INFO: 1,
  WARN: 2,
  ERROR: 3,
} as const;

const stderrConsole = new Console(process.stderr);
const stdoutConsole = new Console(process.stdout);

const doNothingLogger = (_message: string): void => {
  /* Do nothing */
};

const makeLoggerFunc = (options: Options): InternalLoggerFunc =>
  options.silent
    ? (_whereToLog: Console, _message: string) => {
        /* Do nothing */
      }
    : (whereToLog: Console, message: string) => whereToLog.log(message);

const makeExternalLogger = (
  loaderOptions: Options,
  logger: InternalLoggerFunc
): LoggerFunc => (message: string) =>
  logger(
    loaderOptions.logInfoToStdOut ? stdoutConsole : stderrConsole,
    message
  );

const makeLogInfo = (
  options: Options,
  logger: InternalLoggerFunc,
  green: ChalkInstance
): LoggerFunc =>
  LogLevel[options.logLevel] <= LogLevel.INFO
    ? (message: string) =>
        logger(
          options.logInfoToStdOut ? stdoutConsole : stderrConsole,
          green(message)
        )
    : doNothingLogger;

const makeLogError = (
  options: Options,
  logger: InternalLoggerFunc,
  red: ChalkInstance
): LoggerFunc =>
  LogLevel[options.logLevel] <= LogLevel.ERROR
    ? (message: string) => logger(stderrConsole, red(message))
    : doNothingLogger;

const makeLogWarning = (
  options: Options,
  logger: InternalLoggerFunc,
  yellow: ChalkInstance
): LoggerFunc =>
  LogLevel[options.logLevel] <= LogLevel.WARN
    ? (message: string) => logger(stderrConsole, yellow(message))
    : doNothingLogger;

export function makeLogger(options: Options, colors: ChalkInstance): Logger {
  const logger = makeLoggerFunc(options);
  return {
    log: makeExternalLogger(options, logger),
    logInfo: makeLogInfo(options, logger, colors.green),
    logWarning: makeLogWarning(options, logger, colors.yellow),
    logError: makeLogError(options, logger, colors.red),
  };
}
