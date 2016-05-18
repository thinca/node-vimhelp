const {spawn} = require("child_process");

class VimHelp {
  constructor(vimBin = "vim") {
    this.vimBin = vimBin;
  }

  search(word) {
    let script = `verbose silent help ${word}\n`;
    script += ".,/[^*]$//\\*\\S\\+\\*$\\|\\%$/?^[^=-].*[^=-]$?print\n";
    script += "qall!\n";
    return this._execVim(script);
  }

  _execVim(script) {
    return new Promise((resolve, reject) => {
      const vim = spawn(this.vimBin, [
        "-u", "NONE", "-i", "NONE", "-N",
        "-Z", "-R", "-e", "-s"
      ]);
      let resultText = "";
      let errorText = "";
      vim.stdout.on("data", (data) => {
        resultText += data.toString();
      });
      vim.stderr.on("data", (data) => {
        errorText += data.toString();
      });
      vim.on("exit", (exitCode) => {
        if (exitCode === 0 && errorText === "") {
          resolve(resultText);
        } else {
          reject({exitCode, resultText, errorText});
        }
      });
      vim.stdin.write(script);
    });
  }
}

module.exports = {VimHelp};
