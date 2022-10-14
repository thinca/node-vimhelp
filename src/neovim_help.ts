import {execGit, PluginManager} from './plugin_manager'
import fs from "fs";
import {join as pathJoin} from "path";

export class NeovimHelp {
  dir: string
  runtime: string

  constructor(
    public manager: PluginManager,
    public vimBin = "vim",
  ) {
    this.dir = pathJoin(manager.basePath, "neovim_help")
    this.runtime = pathJoin(this.dir, "runtime")
  }

  update = async () => {
    if (fs.existsSync(this.runtime)) {
      await execGit(["pull", "origin", "master"], {cwd: this.dir})
    } else {
      await execGit(["clone", "--depth", "1", "--quiet", "https://github.com/neovim/neovim.git", this.dir])
    }
    await this.manager.updateTags([this.runtime])
  }
}
