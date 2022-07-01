import {spawn} from "child_process";

export function execVim(vimBin: string, commands: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const vim = spawn(vimBin, [
      "-u", "NONE", "-i", "NONE", "-N",
      "-Z", "-X", "-R", "-e", "-s"
    ]);
    const resultBuffers: Buffer[] = [];
    const errorBuffers: Buffer[] = [];
    vim.stdout.on("data", (data) => {
      resultBuffers.push(data);
    });
    vim.stderr.on("data", (data) => {
      errorBuffers.push(data);
    });
    vim.on("exit", (exitCode) => {
      const resultText = Buffer.concat(resultBuffers).toString();
      const errorText = Buffer.concat(errorBuffers).toString();
      if (exitCode === 0 && errorText === "") {
        resolve(resultText.trimEnd());
      } else {
        reject({exitCode, resultText, errorText});
      }
    });
    const script = commands
      .map((c) => c.replace(/\r?\n[^]*/, ""))
      .filter((c) => /\S/.test(c))
      .map((c) => `${c}\n`).join("");
    vim.stdin.write(script);
  });
}
