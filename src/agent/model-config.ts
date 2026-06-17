import {
  getModels,
  getProviders,
  type KnownProvider,
  type Model,
} from "@earendil-works/pi-ai";

export interface ResolveConfiguredModelOptions {
  provider: string;
  modelId: string;
  modelTemplateId?: string;
  baseUrl?: string;
  compat?: Record<string, unknown>;
}

export function resolveConfiguredModel(options: ResolveConfiguredModelOptions): Model<any> {
  const { provider, modelId, modelTemplateId, baseUrl, compat } = options;
  const providers = getProviders();

  if (!providers.includes(provider as KnownProvider)) {
    throw new Error(`Unknown provider "${provider}". Available providers: ${providers.join(", ")}`);
  }

  const providerModels = getModels(provider as KnownProvider);
  const registeredModel = providerModels.find((candidate) => candidate.id === modelId);
  const templateModel = modelTemplateId
    ? providerModels.find((candidate) => candidate.id === modelTemplateId)
    : registeredModel;

  if (!templateModel) {
    throw new Error(
      modelTemplateId
        ? `Unknown model template "${modelTemplateId}" for provider "${provider}".`
        : `Unknown model "${modelId}" for provider "${provider}". Set PI_MODEL_TEMPLATE to clone a registered model for a custom model id.`,
    );
  }

  const resolvedModel = registeredModel ?? {
    ...templateModel,
    id: modelId,
    name: modelId,
  };

  return {
    ...resolvedModel,
    baseUrl: baseUrl ?? resolvedModel.baseUrl,
    compat: compat ? { ...(resolvedModel.compat ?? {}), ...compat } : resolvedModel.compat,
  };
}
