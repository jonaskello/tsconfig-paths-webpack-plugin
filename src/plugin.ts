import * as chalk from "chalk";
import * as TsconfigPaths from "tsconfig-paths";
import * as path from "path";
import * as Options from "./options";
import * as Logger from "./logger";
import * as fs from "fs";
import { ResolveRequest, ResolveContext } from "enhanced-resolve";
import { ResolvePluginInstance, Resolver } from "./plugin.temp.types";

type FileSystem = Resolver["fileSystem"];
type TapAsyncCallback = (
  request: ResolveRequest,
  context: ResolveContext,
  callback: TapAsyncInnerCallback
) => void;
type TapAsyncInnerCallback = (
  error?: Error | null | false,
  result?: null | ResolveRequest
) => void;

export interface LegacyResolverPlugin {
  readonly apply: (resolver: LegacyResolver) => void;
}

export interface LegacyResolver {
  readonly apply: (plugin: LegacyResolverPlugin) => void;
  readonly plugin: (source: string, cb: ResolverCallbackLegacy) => void;
  readonly doResolve: doResolveLegacy | doResolve;
  readonly join: (relativePath: string, innerRequest: Request) => Request;
  readonly fileSystem: LegacyResolverFileSystem;
  readonly getHook: (hook: string) => Tapable;
}

export type doResolveLegacy = (
  target: string,
  req: Request,
  desc: string,
  callback: Callback
) => void;

export type doResolve = (
  hook: Tapable,
  req: Request,
  message: string,
  resolveContext: LegacyResolveContext,
  callback: Callback
) => void;

export type ReadJsonCallback = (error: Error | undefined, result?: {}) => void;

export type ReadJson = (path2: string, callback: ReadJsonCallback) => void;

export type LegacyResolverFileSystem = typeof fs & { readJson?: ReadJson };

export interface LegacyResolveContext {
  log?: string;
  stack?: string;
  missing?: string;
}

export interface Tapable {
  readonly tapAsync: (
    options: TapableOptions,
    callback: TapAsyncCallback
  ) => void;
}

export interface TapableOptions {
  readonly name: string;
}

export type ResolverCallbackLegacy = (
  request: Request,
  callback: Callback
) => void;
export type ResolverCallback = (
  request: Request,
  resolveContext: LegacyResolveContext,
  callback: Callback
) => void;

type CreateInnerCallback = (
  callback: Callback,
  options: Callback,
  message?: string,
  messageOptional?: string
) => Callback;

type CreateInnerContext = (
  options: {
    log?: string;
    stack?: string;
    missing?: string;
  },
  message?: string,
  messageOptional?: string
) => ResolveContext;

type getInnerRequest = (
  resolver: Resolver | LegacyResolver,
  request: ResolveRequest | Request
) => string;

export interface Request {
  readonly request?: Request | string;
  readonly relativePath: string;
  readonly path: string;
  readonly context: {
    readonly issuer: string;
  };
}

export interface Callback {
  (err?: Error, result?: string): void;
  log?: string;
  stack?: string;
  missing?: string;
}

const getInnerRequest: getInnerRequest = require("enhanced-resolve/lib/getInnerRequest");

export class TsconfigPathsPlugin implements ResolvePluginInstance {
  source: string = "described-resolve";
  target: string = "resolve";

  log: Logger.Logger;
  baseUrl: string;
  absoluteBaseUrl: string;
  extensions: ReadonlyArray<string>;

  referenceMatchMap: Record<string, TsconfigPaths.MatchPathAsync>;
  matchPath: TsconfigPaths.MatchPathAsync;

  constructor(rawOptions: Partial<Options.Options> = {}) {
    const options = Options.getOptions(rawOptions);

    this.extensions = options.extensions;
    this.referenceMatchMap = {};

    // const colors = new chalk.constructor({ enabled: options.colors });

    this.log = Logger.makeLogger(
      options,
      new chalk.Instance({ level: options.colors ? undefined : 0 })
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

      if (options.references) {
        options.references.reduce((pathMap, reference) => {
          if (reference) {
            const referenceResult = loadConfig(reference, this.log);
            if (referenceResult.resultType === "success") {
              const { paths, absoluteBaseUrl } = referenceResult;
              pathMap[absoluteBaseUrl] = TsconfigPaths.createMatchPathAsync(
                absoluteBaseUrl,
                paths,
                options.mainFields
              );
            }
          }
          return pathMap;
        }, this.referenceMatchMap);
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

    const { baseUrl } = this;

    if (!baseUrl) {
      // Nothing to do if there is no baseUrl
      this.log.logWarning(
        "tsconfig-paths-webpack-plugin: Found no baseUrl in tsconfig.json, not applying tsconfig-paths-webpack-plugin"
      );
      return;
    }

    // The file system only exists when the plugin is in the resolve context. This means it's also properly placed in the resolve.plugins array.
    // If not, we should warn the user that this plugin should be placed in resolve.plugins and not the plugins array of the root config for example.
    // This should hopefully prevent issues like: https://github.com/dividab/tsconfig-paths-webpack-plugin/issues/9
    if (!("fileSystem" in resolver)) {
      this.log.logWarning(
        "tsconfig-paths-webpack-plugin: No file system found on resolver." +
          " Please make sure you've placed the plugin in the correct part of the configuration." +
          " This plugin is a resolver plugin and should be placed in the resolve part of the Webpack configuration."
      );
      return;
    }

    // getHook will only exist in Webpack 4 & 5, if so we should comply to the Webpack 4 plugin system.
    if ("getHook" in resolver && typeof resolver.getHook === "function") {
      resolver
        .getHook(this.source)
        .tapAsync(
          { name: "TsconfigPathsPlugin" },
          createPluginCallback(
            this.referenceMatchMap,
            this.matchPath,
            resolver,
            this.absoluteBaseUrl,
            resolver.getHook(this.target),
            this.extensions
          )
        );
    } else if ("plugin" in resolver) {
      // This is the legacy (Webpack < 4.0.0) way of using the plugin system.
      const legacyResolver = resolver as {
        plugin: (source: string, cb: ResolverCallbackLegacy) => void;
      };
      legacyResolver.plugin(
        this.source,
        createPluginLegacy(
          this.matchPath,
          resolver,
          this.absoluteBaseUrl,
          this.target,
          this.extensions
        )
      );
    }
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
  referenceMatchMap: Record<string, TsconfigPaths.MatchPathAsync>,
  baseMatchPath: TsconfigPaths.MatchPathAsync,
  resolver: Resolver,
  baseAbsoluteBaseUrl: string,
  hook: Tapable,
  extensions: ReadonlyArray<string>
): TapAsyncCallback {
  const fileExistAsync = createFileExistAsync(resolver.fileSystem);
  const readJsonAsync = createReadJsonAsync(resolver.fileSystem);
  return (
    request: ResolveRequest,
    resolveContext: ResolveContext,
    callback: TapAsyncInnerCallback
  ) => {
    const innerRequest = getInnerRequest(resolver, request);

    if (
      !innerRequest ||
      innerRequest.startsWith(".") ||
      innerRequest.startsWith("..")
    ) {
      return callback();
    }

    // Find the base URL and matchPath instance
    // Quickly check if the request path is a known baseUrl
    // Then check if the path is a child of a reference baseUrl
    let absoluteBaseUrl = baseAbsoluteBaseUrl;
    if (
      typeof request.path === "string" &&
      request.path !== baseAbsoluteBaseUrl
    ) {
      if (referenceMatchMap[request.path]) {
        absoluteBaseUrl = request.path;
      } else {
        const referenceUrl = Object.keys(referenceMatchMap).find(
          (refBaseUrl) => {
            const relative = path.relative(refBaseUrl, request.path || "");
            return (
              relative &&
              !relative.startsWith("..") &&
              !path.isAbsolute(relative)
            );
          }
        );
        if (referenceUrl) {
          absoluteBaseUrl = referenceUrl;
        }
      }
    }

    const matchPath = referenceMatchMap[absoluteBaseUrl] || baseMatchPath;

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
          return callback();
        }

        const newRequest = {
          ...request,
          request: foundMatch,
          path: absoluteBaseUrl,
        };

        // Only at this point we are sure we are dealing with the latest Webpack version (>= 4.0.0)
        // So only now can we require the createInnerContext function.
        // (It doesn't exist in legacy versions)
        const createInnerContext: CreateInnerContext = require("enhanced-resolve/lib/createInnerContext");

        return resolver.doResolve(
          hook,
          newRequest as never,
          `Resolved request '${innerRequest}' to '${foundMatch}' using tsconfig.json paths mapping`,
          // tslint:disable-next-line:no-any
          createInnerContext({ ...(resolveContext as any) }),
          (err2: Error, result2: ResolveRequest): void => {
            // Pattern taken from:
            // https://github.com/webpack/enhanced-resolve/blob/42ff594140582c3f8f86811f95dea7bf6774a1c8/lib/AliasPlugin.js#L44
            if (err2) {
              return callback(err2);
            }

            // Don't allow other aliasing or raw request
            if (result2 === undefined) {
              return callback(undefined, undefined);
            }

            // tslint:disable-next-line:no-any
            callback(undefined, result2);
          }
        );
      }
    );
  };
}

function createPluginLegacy(
  matchPath: TsconfigPaths.MatchPathAsync,
  resolver: LegacyResolver,
  absoluteBaseUrl: string,
  target: string,
  extensions: ReadonlyArray<string>
): ResolverCallbackLegacy {
  const fileExistAsync = createFileExistAsync(resolver.fileSystem);
  const readJsonAsync = createReadJsonAsync(resolver.fileSystem);
  return (request, callback) => {
    const innerRequest = getInnerRequest(resolver, request);

    if (
      !innerRequest ||
      innerRequest.startsWith(".") ||
      innerRequest.startsWith("..")
    ) {
      return callback();
    }

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
          return callback();
        }

        const newRequest = {
          ...request,
          request: foundMatch,
          path: absoluteBaseUrl,
        };

        // Only at this point we are sure we are dealing with a legacy Webpack version (< 4.0.0)
        // So only now can we require the createInnerCallback function.
        // (It's already deprecated and might be removed down the line).
        const createInnerCallback: CreateInnerCallback = require("enhanced-resolve/lib/createInnerCallback");

        return (resolver.doResolve as doResolveLegacy)(
          target,
          newRequest,
          `Resolved request '${innerRequest}' to '${foundMatch}' using tsconfig.json paths mapping`,
          createInnerCallback(function (err2: Error, result2: string): void {
            // Note:
            //  *NOT* using an arrow function here because arguments.length implies we have "this"
            //  That means "this" has to be in the current function scope, and not the scope above.
            //  Pattern taken from:
            //  https://github.com/s-panferov/awesome-typescript-loader/blob/10653beff85f555f1f3b5d4bfd7d21513d0e54a4/src/paths-plugin.ts#L169
            if (arguments.length > 0) {
              return callback(err2, result2);
            }

            // don't allow other aliasing or raw request
            callback(undefined, undefined);
          }, callback)
        );
      }
    );
  };
}

function readJson(
  fileSystem: FileSystem,
  path2: string,
  callback: ReadJsonCallback
): void {
  if ("readJson" in fileSystem && fileSystem.readJson) {
    return fileSystem.readJson(path2, callback);
  }

  fileSystem.readFile(path2, (err, buf) => {
    if (err) {
      return callback(err);
    }

    let data;

    try {
      // @ts-ignore  This will crash if buf is undefined, which I guess it can be...
      data = JSON.parse(buf.toString("utf-8"));
    } catch (e) {
      return callback(e);
    }

    return callback(undefined, data);
  });
}

function createReadJsonAsync(
  filesystem: FileSystem
): TsconfigPaths.ReadJsonAsync {
  // tslint:disable-next-line:no-any
  return (path2: string, callback2: (err?: Error, content?: any) => void) => {
    readJson(filesystem, path2, (err, json) => {
      // If error assume file does not exist
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
    filesystem.stat(path2, (err: Error, stats: fs.Stats) => {
      // If error assume file does not exist
      if (err) {
        callback2(undefined, false);
        return;
      }
      callback2(undefined, stats ? stats.isFile() : false);
    });
  };
}
