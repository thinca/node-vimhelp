const {spawn} = require("child_process");

class VimHelp {
  constructor(vimBin = "vim") {
    this.vimBin = vimBin;
  }

  search(word) {
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
      vim.stdin.write(`verbose silent help ${word}\n`);
      vim.stdin.write(".,/[^*]$//\\*\\S\\+\\*$\\|\\%$/?^[^=-].*[^=-]$?print\n");
      vim.stdin.write("qall!\n");
    });
  }
}

module.exports = {VimHelp};
