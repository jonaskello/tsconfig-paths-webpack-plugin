import * as path from "node:path";
import * as TsconfigPaths from "tsconfig-paths";
import { Chalk } from "chalk";
import { AsyncSeriesBailHook } from "tapable";
import getInnerRequest from "enhanced-resolve/lib/getInnerRequest.js";
import createInnerContext from "enhanced-resolve/lib/createInnerContext.js";
import type { Resolver } from "webpack";
import * as Options from "./options.ts";
import * as Logger from "./logger.ts";
import type { ResolveContext, ResolveRequest } from "enhanced-resolve";

type TapAsyncCallback = Parameters<
  AsyncSeriesBailHook<[ResolveRequest, ResolveContext], null | ResolveRequest>["tapAsync"]
>[1];

type TapAsyncInnerCallback = Parameters<TapAsyncCallback>[2];

type FileSystem = Resolver["fileSystem"];

export interface TsconfigPathsPlugin {
  source: string;
  target: string;
  apply(resolver: Resolver): void;
}

export class TsconfigPathsPlugin {
  source: string = "described-resolve";
  target: string = "resolve";

  log: Logger.Logger;
  baseUrl: string | undefined;
  absoluteBaseUrl: string;
  extensions: ReadonlyArray<string>;
  matchPath: TsconfigPaths.MatchPathAsync;
  referenceMatchMap: Record<string, TsconfigPaths.MatchPathAsync> = {};

  constructor(rawOptions: Partial<Options.Options> = {}) {
    const options = Options.getOptions(rawOptions);
    this.extensions = options.extensions;
    this.absoluteBaseUrl = options.baseUrl || process.cwd();
    this.matchPath = () => Promise.resolve(undefined);

    this.log = Logger.makeLogger(
      options,
      new Chalk({ level: options.colors ? undefined : 0 })
    );

    const context = options.context || process.cwd();
    const loadFrom = options.configFile || context;

    const loadResult = loadConfig(loadFrom, this.log);
    if (loadResult.resultType === "success") {
      this.baseUrl = options.baseUrl || loadResult.baseUrl;
      this.absoluteBaseUrl = options.baseUrl
        ? path.resolve(options.baseUrl)
        : loadResult.absoluteBaseUrl;
      this.matchPath = TsconfigPaths.createMatchPathAsync(
        this.absoluteBaseUrl,
        loadResult.paths,
        options.mainFields
      );
    }

    // Load path mappings for any referenced tsconfig projects too, so that
    // modules whose paths are only declared in a referenced project (via
    // TypeScript project references) can still be resolved.
    for (const referenceConfigFile of options.references ?? []) {
      const referenceLoadResult = loadConfig(referenceConfigFile, this.log);
      if (referenceLoadResult.resultType === "success") {
        this.referenceMatchMap[referenceLoadResult.absoluteBaseUrl] =
          TsconfigPaths.createMatchPathAsync(
            referenceLoadResult.absoluteBaseUrl,
            referenceLoadResult.paths,
            options.mainFields
          );
      }
    }
  }

  apply(resolver: Resolver): void {
    if (!resolver) {
      this.log.logWarning(
        "tsconfig-paths-webpack-plugin: Found no resolver, not applying tsconfig-paths-webpack-plugin"
      );
      return;
    }

    if (!("fileSystem" in resolver)) {
      this.log.logWarning(
        "tsconfig-paths-webpack-plugin: No file system found on resolver. " +
          "Please ensure the plugin is placed in the `resolve.plugins` array of your Webpack configuration."
      );
      return;
    }

    const hook = resolver.getHook(this.target);
    resolver
      .getHook(this.source)
      .tapAsync(
        { name: "TsconfigPathsPlugin" },
        createPluginCallback(
          this.matchPath,
          this.referenceMatchMap,
          resolver,
          this.absoluteBaseUrl,
          hook,
          this.extensions
        )
      );
  }
}

function loadConfig(
  configPath: string,
  logger: Logger.Logger
): TsconfigPaths.ConfigLoaderResult {
  const loadResult = TsconfigPaths.loadConfig(configPath);
  if (loadResult.resultType === "failed") {
    logger.logError(`Failed to load ${configPath}: ${loadResult.message}`);
  } else {
    logger.logInfo(
      `tsconfig-paths-webpack-plugin: Using config file at ${loadResult.configFileAbsolutePath}`
    );
  }
  return loadResult;
}

function createPluginCallback(
  baseMatchPath: TsconfigPaths.MatchPathAsync,
  referenceMatchMap: Record<string, TsconfigPaths.MatchPathAsync>,
  resolver: Resolver,
  baseAbsoluteBaseUrl: string,
  hook: AsyncSeriesBailHook<[ResolveRequest, ResolveContext], null | ResolveRequest>,
  extensions: ReadonlyArray<string>
): TapAsyncCallback {
  const fileExistAsync = createFileExistAsync(resolver.fileSystem);
  const readJsonAsync = createReadJsonAsync(resolver.fileSystem);

  // Try the plugin's own tsconfig first, then fall back to any referenced
  // tsconfig projects (TypeScript project references) in order.
  const candidates: ReadonlyArray<
    readonly [string, TsconfigPaths.MatchPathAsync]
  > = [
    [baseAbsoluteBaseUrl, baseMatchPath],
    ...Object.entries(referenceMatchMap),
  ];

  return (
    request: ResolveRequest,
    resolveContext: ResolveContext,
    callback: TapAsyncInnerCallback
  ) => {
    const innerRequest = getInnerRequest(resolver, request);

    if (
      !innerRequest ||
      request?.request?.startsWith(".") ||
      request?.request?.startsWith("..")
    ) {
      return callback();
    }

    const tryCandidate = (index: number): void => {
      if (index >= candidates.length) {
        return callback();
      }

      const [absoluteBaseUrl, matchPath] = candidates[index];

      matchPath(
        innerRequest,
        readJsonAsync,
        fileExistAsync,
        extensions,
        (err, foundMatch) => {
          if (err) {
            return callback(err);
          }

          if (!foundMatch) {
            return tryCandidate(index + 1);
          }

          const newRequest = {
            ...request,
            request: foundMatch,
            path: absoluteBaseUrl,
          };

          return resolver.doResolve(
            hook,
            newRequest as never,
            `Resolved request '${innerRequest}' to '${foundMatch}' using tsconfig.json paths mapping`,
            createInnerContext({ ...resolveContext }),
            (err2?: Error | null, result2?: ResolveRequest) => {
              if (err2) {
                return callback(err2);
              }
              if (!result2) {
                return tryCandidate(index + 1);
              }
              callback(undefined, result2);
            }
          );
        }
      );
    };

    tryCandidate(0);
  };
}

function readJson(
  fileSystem: FileSystem,
  path2: string,
  callback: (err: Error | null | undefined, result?: {}) => void
): void {
  if ("readJson" in fileSystem && fileSystem.readJson) {
    return fileSystem.readJson(path2, callback);
  }

  fileSystem.readFile(path2, (err, buf) => {
    if (err) {
      return callback(err);
    }

    try {
      if (!buf) {
        return callback(new Error(`Failed to read file at ${path2}`));
      }
      const data = JSON.parse(buf.toString("utf-8"));
      return callback(undefined, data);
    } catch (e) {
      return callback(e instanceof Error ? e : new Error("Unknown error parsing JSON"));
    }
  });
}

function createReadJsonAsync(
  filesystem: FileSystem
): TsconfigPaths.ReadJsonAsync {
  return (path2: string, callback2: (err?: Error, content?: unknown) => void) => {
    readJson(filesystem, path2, (err, json) => {
      if (err || !json) {
        callback2();
        return;
      }
      callback2(undefined, json);
    });
  };
}

function createFileExistAsync(
  filesystem: FileSystem
): TsconfigPaths.FileExistsAsync {
  return (
    path2: string,
    callback2: (err?: Error, exists?: boolean) => void
  ) => {
    filesystem.stat(path2, (err, stats) => {
      if (err) {
        callback2(undefined, false);
        return;
      }
      callback2(undefined, stats?.isFile() ?? false);
    });
  };
}
