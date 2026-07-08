import { describe, it } from "node:test";
import assert from "node:assert";
import path from "node:path";
import webpack from "webpack";
import type { Configuration } from "webpack";
import { TsconfigPathsPlugin } from "../mod.ts";

const __dirname = path.resolve(path.dirname(""));

describe(`TsconfigPathsPlugin`, () => {
  const SETTINGS: Configuration = {
    mode: "development",
    context: path.resolve(__dirname, "src"),
    entry: `${__dirname}/examples/example/src/index.ts`,
    output: {
      path: path.join(__dirname, "../../temp"),
      filename: "bundle.js",
    },
    module: {
      rules: [
        {
          test: /\\.tsx?$/,
          exclude: /^node_modules/,
          loader: "ts-loader",
          options: {
            configFile: "./example/tsconfig.json",
          },
        },
      ],
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js"],
    },
  };

  it(`Can initialize the plugin`, (_t, done) => {
    const testPlugin = new TsconfigPathsPlugin({
      configFile: `${__dirname}/examples/example/tsconfig.json`,
      logLevel: "INFO",
      extensions: [".ts", ".tsx"],
      mainFields: ["browser", "main"],
    });

    assert.ok(testPlugin instanceof TsconfigPathsPlugin);

    const testSettings: Configuration = {
      ...SETTINGS,
      resolve: {
        extensions: [".ts", ".tsx", ".js"],
        plugins: [testPlugin],
      },
    };

    const compiler = webpack(testSettings);

    compiler.run((err, stats) => {
      if (err) {
        done(err);
        return;
      }
      
      assert.ok(stats);

      const details = stats?.toJson();

      assert.ok(details);
      assert.strictEqual(details.errorsCount, 0);
      
      // TODO There should probably be a test that verifies the stats match what is expected
      done();
    });
  });

  it(`Test to ensure Apply exists and is working`, (_t, done) => {
    const webpackSettings: Configuration = {
      entry: `${__dirname}/examples/example/src/index.ts`,
      target: "web",
      output: {
        path: path.join(__dirname, "../../temp"),
        filename: "[name].js",
      },
      mode: "development",
      resolve: {
        extensions: [
          ".ts",
          ".tsx",
          ".js",
          ".jsx",
          "ttf",
          "eot",
          "otf",
          "svg",
          "png",
          "woff",
          "woff2",
        ],
        plugins: [
          new TsconfigPathsPlugin({
            configFile: `${__dirname}/examples/example/tsconfig.json`,
          }),
        ],
      },
      module: {
        rules: [],
      },
    };
    // Build compiler
    const compiler = webpack(webpackSettings);
    const pluginInstance = compiler?.options?.resolve?.plugins?.find(
      (plugin) => plugin instanceof TsconfigPathsPlugin
    );
    if (!pluginInstance) {
      return done(`TsconfigPathsPlugin not loaded in webpack settings`);
    }

    assert.ok(pluginInstance instanceof TsconfigPathsPlugin);
    assert.ok((pluginInstance as TsconfigPathsPlugin).apply);
    assert.strictEqual(
      typeof (pluginInstance as TsconfigPathsPlugin).apply,
      "function"
    );

    // Run compiler
    compiler.run((err, stats) => {
      if (err) {
        done(err);
        return;
      }

      assert.ok(stats);

      const details = stats?.toJson();
    
      assert.ok(details);
      assert.strictEqual(details.errorsCount, 0);
      done();
    });
  });

  it(`Resolves project references`, (_t, done) => {
    const testPlugin = new TsconfigPathsPlugin({
      configFile: `${__dirname}/examples/referenceExample/tsconfig.json`,
      logLevel: "INFO",
      extensions: [".ts", ".tsx"],
      mainFields: ["browser", "main"],
      references: [`${__dirname}/examples/example/tsconfig.json`],
    });

    assert.ok(testPlugin instanceof TsconfigPathsPlugin);

    const testSettings: Configuration = {
      ...SETTINGS,
      resolve: {
        extensions: [".ts", ".tsx", ".js"],
        plugins: [testPlugin],
      },
    };

    const compiler = webpack(testSettings);

    compiler.run((err, stats) => {
      if (err) {
        done(err);
        return;
      }
      assert.ok(stats);

      const details = stats?.toJson();

      assert.ok(details);

      if (details.errorsCount > 0) {
        console.error(details.errors);
      }

      assert.strictEqual(details.errorsCount, 0);
  
      // TODO There should probably be a test that verifies the stats match what is expected
      done();
    });
  });
});
