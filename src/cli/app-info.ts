import packageJson from "../../package.json" with { type: "json" };

export const APP_NAME = "TaoPi";
export const APP_VERSION = packageJson.version ?? "0.0.0";
