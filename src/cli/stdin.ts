export async function readPipedStdin(input: NodeJS.ReadStream): Promise<string> {
  if (input.isTTY) {
    return "";
  }

  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks).toString("utf8").trim();
}
