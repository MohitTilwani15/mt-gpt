import { useLocalStorage } from 'usehooks-ts';
import { useSupportedModels } from './use-models';

const LOCAL_STORAGE_KEY = 'selected-chat-model';

export function useSelectedModel() {
  const { data: modelsData, isLoading: isLoadingModels } = useSupportedModels();
  const [storedModel, setStoredModel] = useLocalStorage<string | null>(
    LOCAL_STORAGE_KEY,
    null
  );

  const availableModels = modelsData?.models ?? [];
  const defaultModel = modelsData?.defaultModel ?? '';

  const availableIds = availableModels.map((m) => m.id);

  const selectedModel =
    storedModel && availableIds.includes(storedModel)
      ? storedModel
      : defaultModel;

  const setSelectedModel = (model: string) => {
    if (availableIds.includes(model)) {
      setStoredModel(model);
    } else {
      console.warn(`Tried to set unsupported model "${model}"`);
    }
  };

  const resetToDefault = () => {
    setStoredModel(null);
  };

  return {
    selectedModel,
    setSelectedModel,
    availableModels,
    backendDefaultModel: defaultModel,
    isLoading: isLoadingModels,
    isUsingStoredModel: storedModel !== null,
    resetToDefault,
  };
}
