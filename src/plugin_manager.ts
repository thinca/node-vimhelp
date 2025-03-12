import {execFile} from "child_process";
import fs from "fs";
import fsp from "fs/promises";
import {join as pathJoin} from "path";

import {RTPProvider} from "./vimhelp.js";
import {execVim, ExecError} from "./exec_vim.js";

function execGit(args: string[], options = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const defaultOptions = {env: Object.assign({}, process.env, {GIT_TERMINAL_PROMPT: "0"})};
    execFile("git", args, Object.assign(defaultOptions, options), (error, resultText, errorText) => {
      if (error) {
        reject(new ExecError(error.code, resultText, errorText));
      } else {
        resolve(resultText);
      }
    });
  });
}

async function getPluginVersion(pluginPath: string): Promise<string> {
  if (!fs.existsSync(pluginPath)) {
    return Promise.reject(new Error(`pluginPath does not exist: ${pluginPath}`));
  }
  const version = await execGit(["rev-parse", "HEAD"], {cwd: pluginPath});
  return version.trim();
}

export interface UpdateInfo {
  pluginName: string;
  pluginPath: string;
  beforeVersion: string;
  afterVersion: string;
  updated(): boolean;
}

export interface PluginInfo {
  pluginName: string;
  dirName: string;
  runtimepath: string;
  repository: string;
}

export class PluginManager {
  constructor(
    public basePath: string,
    public vimBin = "vim",
  ) {
  }

  get plugins(): PluginInfo[] {
    return this.dirNames.map((dirName) => {
      const pluginName = this.dirnameToName(dirName);
      const repository = this.nameToRepository(pluginName);
      const runtimepath = pathJoin(this.basePath, dirName);
      return {
        pluginName,
        dirName,
        runtimepath,
        repository
      };
    });
  }

  get dirNames(): string[] {
    return fs.readdirSync(this.basePath);
  }

  get pluginNames(): string[] {
    return this.dirNames.map(this.dirnameToName);
  }

  get runtimepaths(): string[] {
    return this.dirNames.map((path) => pathJoin(this.basePath, path));
  }

  get rtpProvider(): RTPProvider {
    return () => this.runtimepaths;
  }

  async install(pluginName: string): Promise<string> {
    const repos = this.nameToRepository(pluginName);
    const pluginPath = this.nameToPath(pluginName);
    if (fs.existsSync(pluginPath)) {
      throw new Error(`Plugin already installed: ${pluginName}`);
    }
    await execGit(["clone", "--depth", "1", "--quiet", repos, pluginPath]);
    await this.updateTags([pluginPath]);
    return await getPluginVersion(pluginPath);
  }

  async uninstall(pluginName: string): Promise<string> {
    const path = this.nameToPath(pluginName);
    if (!fs.existsSync(path)) {
      throw new Error(`Plugin is not installed: ${path}`);
    }
    await fsp.rm(path, {recursive: true});
    return path;
  }

  clean(): Promise<string[]> {
    return Promise.all(this.pluginNames.map(this.uninstall.bind(this)));
  }

  async update(pluginName: string): Promise<UpdateInfo> {
    const info = await this.updatePlugin(pluginName);
    if (info.updated()) {
      await this.updateTags([info.pluginPath]);
    }
    return info;
  }

  async updatePlugin(pluginName: string): Promise<UpdateInfo> {
    const pluginPath = this.nameToPath(pluginName);
    const beforeVersion = await getPluginVersion(pluginPath);
    await execGit(["pull"], {cwd: pluginPath});
    const afterVersion = await getPluginVersion(pluginPath);
    const updateInfo = {
      beforeVersion,
      afterVersion,
      pluginPath,
      pluginName,
      updated() {
        return this.beforeVersion !== this.afterVersion;
      }
    };
    return updateInfo;
  }

  async updateAll(pluginNames = this.pluginNames): Promise<UpdateInfo[]> {
    const updateInfos = await Promise.all(
      pluginNames.map(this.updatePlugin.bind(this))
    );
    const needTagUpdates = updateInfos.filter((info) => info.updated());
    await this.updateTags(
      needTagUpdates.map((info) => info.pluginPath)
    );
    return updateInfos;
  }

  async updateTags(pluginPaths: string[]): Promise<string[]> {
    const commands = pluginPaths
      .map((path) => pathJoin(path, "doc"))
      .filter((path) => fs.existsSync(path))
      .map((path) => `helptags ${path}`);
    if (commands.length === 0) {
      return pluginPaths;
    }
    commands.push("qall!");
    await execVim(this.vimBin, commands);
    return pluginPaths;
  }

  nameToRepository(pluginName: string): string {
    let repos = pluginName;
    if (!/\//.test(repos)) {
      repos = `vim-scripts/${repos}`;
    }
    if (/^[^/]+\/[^/]+$/.test(repos)) {
      repos = `https://github.com/${repos}`;
    }
    return repos;
  }

  repositoryToDirname(repos: string): string {
    return repos
      .replace(/^\w+(?::\/\/|@)/, "")
      .replace(/\.git$/, "")
      .replace(/[:/]/g, "__");
  }

  nameToPath(pluginName: string): string {
    const repos = this.nameToRepository(pluginName);
    const dirname = this.repositoryToDirname(repos);
    return pathJoin(this.basePath, dirname);
  }

  dirnameToName(dirname: string): string {
    return dirname
      .replace(/__/g, "/")
      .replace(/^github\.com\//, "")
      .replace(/^vim-scripts\//, "");
  }
}
